import { spawn } from 'node:child_process';
import { request as httpRequest, type IncomingMessage, type OutgoingHttpHeaders } from 'node:http';
import { createServer } from 'node:net';
import { createInterface } from 'node:readline';
import { z } from 'zod';
import type { ConformanceHost, Exchange } from './host';

/**
 * A host run as its own process, driven the way a supervisor and a terminal
 * drive one: started on a directory, found through the one line it
 * announces, reached over loopback HTTP, and stopped by closing its standard
 * input or by SIGINT. `README.md` beside this file states the contract a host
 * command must keep, in words that do not depend on the language it is written
 * in.
 */

/** What a host says once it can be reached, or why it cannot. */
export type HostAnnouncement =
  | {
      readonly kind: 'listening';
      readonly port: number;
      /**
       * Present for a host that keeps the launch lock: the secret presented once
       * at `/?launch=<secret>` and traded for a session cookie. Absent for a host
       * with no lock, which still refuses another `Host`.
       */
      readonly secret?: string;
    }
  | { readonly kind: 'refused'; readonly message: string };

/**
 * The announcement every host writes: one JSON line, the shape the desktop
 * sidecar writes (`src/desktop/announcement.ts`), with the secret optional.
 * `test/unit/http-conformance-host-process.test.ts` reads every sidecar
 * announcement through it.
 */
const announcementLineSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('listening'),
    port: z.number().int().min(1).max(65_535),
    secret: z.string().min(1).optional(),
  }),
  z.object({ kind: z.literal('refused'), message: z.string() }),
]);

/** Reads a stdout line as the JSON announcement, or `undefined` for any other line. */
export const readJsonAnnouncement = (line: string): HostAnnouncement | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return undefined;
  }
  const announcement = announcementLineSchema.safeParse(parsed);
  if (!announcement.success) return undefined;
  if (announcement.data.kind === 'refused') return announcement.data;
  const { port, secret } = announcement.data;
  return secret === undefined ? { kind: 'listening', port } : { kind: 'listening', port, secret };
};

/**
 * How to start a host. `argv` is the program and its arguments, in which the
 * suite replaces three placeholders: `{directory}` with the Aggregate directory
 * to run, `{port}` with a free loopback port the suite chose, and `{built}` with
 * the stand-in build (`fixture.ts`). A host that takes no `{built}` carries its
 * own build, and the suite checks only the shell's transport.
 */
export interface HostCommand {
  /** A name for the host in test titles. */
  readonly name: string;
  readonly argv: readonly string[];
  readonly cwd?: string;
  /**
   * Variables set in the host's environment, over the suite's own, which the
   * host otherwise inherits.
   */
  readonly env?: Readonly<Record<string, string>>;
  /** Whether closing standard input stops the host as SIGINT does (the desktop sidecar's protocol). */
  readonly stopsOnStdinClose: boolean;
  /**
   * Whether the host keeps the launch lock, and so must announce a secret. The
   * lock cases fail a host that declares this and announces none, and skip one
   * that declares it not.
   */
  readonly keepsLock: boolean;
}

/** Whether the command is handed the stand-in build, rather than carrying its own. */
export const takesStandInBuild = (command: HostCommand): boolean =>
  command.argv.some((argument) => argument.includes('{built}'));

/**
 * A loopback port free when this answers. It is closed again before the host
 * binds it, so another process can take it in between; a host that takes
 * `{port}` and finds it taken fails to start, and the case fails rather than
 * passing wrongly. A host that picks its own port and announces it has no such
 * window.
 */
export const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (address instanceof Object) resolve(address.port);
        else reject(new Error('No port'));
      });
    });
  });

/** A request as it goes onto the wire, with every header the suite chose. */
export interface WireRequest {
  readonly method: string;
  /** The request target: a pathname and query, sent as written. */
  readonly target: string;
  /**
   * Sent as written. A body is sent with its exact `Content-Length`, unless
   * these name a `Transfer-Encoding`: it is then sent chunked, declaring no
   * length.
   */
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: Uint8Array;
}

/** How long a host that announced a refusal has to exit before the suite kills it. */
const REFUSED_EXIT_DEADLINE_MS = 10_000;

const NO_BODY_STATUSES = new Set([101, 204, 205, 304]);

const responseOf = async (message: IncomingMessage, method: string): Promise<Response> => {
  const chunks: Buffer[] = [];
  for await (const chunk of message) {
    if (chunk instanceof Buffer) chunks.push(chunk);
  }
  const headers = new Headers();
  for (const [name, value] of Object.entries(message.headers)) {
    if (value === undefined) continue;
    for (const one of Array.isArray(value) ? value : [value]) headers.append(name, one);
  }
  const status = message.statusCode ?? 0;
  const body = method === 'HEAD' || NO_BODY_STATUSES.has(status) ? null : Buffer.concat(chunks);
  return new Response(body, { status, headers });
};

/**
 * Send one request to `127.0.0.1:<port>` exactly as written, `Host` included.
 * `node:http` rather than `fetch`, because `fetch` will not send a `Host`
 * other than the URL's, and the lock cases must.
 */
export const sendOnWire = (port: number, wire: WireRequest): Promise<Response> =>
  new Promise((resolve, reject) => {
    const headers: OutgoingHttpHeaders = { ...wire.headers };
    const chunked = Object.keys(wire.headers).some(
      (name) => name.toLowerCase() === 'transfer-encoding',
    );
    if (wire.body !== undefined && !chunked) {
      headers['content-length'] = String(wire.body.byteLength);
    }
    const outgoing = httpRequest(
      {
        host: '127.0.0.1',
        port,
        method: wire.method,
        path: wire.target,
        headers,
        agent: false,
        setHost: false,
      },
      (message) => {
        responseOf(message, wire.method).then(resolve, reject);
      },
    );
    outgoing.once('error', reject);
    outgoing.end(wire.body === undefined ? undefined : Buffer.from(wire.body));
  });

const headersOf = (request: Request) => Object.fromEntries(request.headers);

/** The `name=value` of the first `Set-Cookie` a response carries. */
const sessionCookieOf = (response: Response): string | undefined =>
  response.headers.getSetCookie()[0]?.split(';')[0];

/** A host process the suite started, listening. */
export interface RunningHost extends ConformanceHost {
  readonly port: number;
  /** The launch secret, for a host that keeps the lock. */
  readonly secret: string | undefined;
  /** The `name=value` session cookie the launch secret was traded for, for a host that keeps the lock. */
  readonly sessionCookie: string | undefined;
  /** The `Host` every request names: `127.0.0.1:<port>`. */
  readonly hostHeader: string;
  /** Sends a request exactly as written, with no `Host` or cookie added. */
  readonly sendRaw: (wire: WireRequest) => Promise<Response>;
  /** Close the host's standard input. */
  readonly closeStdin: () => void;
  readonly signal: (signal: NodeJS.Signals) => void;
  /** Resolves with the exit code once the host exits. */
  readonly exited: Promise<number | null>;
  /** Everything the host wrote to standard error, so far. */
  readonly stderr: () => string;
  /** Kill the host if it is still running. */
  readonly kill: () => void;
}

export type HostStart =
  | { readonly kind: 'listening'; readonly host: RunningHost }
  | {
      readonly kind: 'refused';
      /** The refusal the host announced, if it announced one before exiting. */
      readonly message: string | undefined;
      readonly exitCode: number | null;
      readonly stderr: string;
    };

const substitute = (argument: string, values: Readonly<Record<string, string>>): string =>
  argument.replaceAll(
    /\{(directory|port|built)\}/g,
    (whole, name: string) => values[name] ?? whole,
  );

/** Where the host is started, and what fills the command's placeholders. */
export interface HostLaunch {
  readonly directory: string;
  readonly built: string;
}

/**
 * The launch of a host that runs no directory or build, such as a host over a
 * store (the SQLite restart proof's, `test/support/restart-proof-host.ts`): its
 * command names `{port}` alone, and one naming `{directory}` or `{built}` fails
 * the start before anything is spawned.
 */
export const STORE_BACKED_LAUNCH = { kind: 'store-backed' } as const;
export type StoreBackedLaunch = typeof STORE_BACKED_LAUNCH;

/** A placeholder a store-backed launch has no value for. */
export const DIRECTORY_PLACEHOLDER = /\{(directory|built)\}/;

export interface HostStartOptions {
  /**
   * How long the host has to announce itself, and then to answer its own
   * launch secret, before the suite kills it.
   */
  readonly announceDeadlineMs?: number;
  /**
   * Called with a way to kill the host as soon as it is spawned, before it has
   * announced, so a case that is abandoned while the host starts can still
   * kill it.
   */
  readonly onSpawn?: (kill: () => void) => void;
}

/** Long enough for a host built from source to start, and well inside a case's timeout. */
const ANNOUNCE_DEADLINE_MS = 30_000;

/**
 * Start the host on a directory and wait for its announcement. A host that
 * keeps the lock is unlocked before this answers: the launch secret is
 * presented once and the session cookie it is traded for is sent with every
 * request through `exchange`, beside the `Host` the host expects.
 *
 * A host that cannot be spawned, does not announce within the deadline, or
 * cannot be unlocked within it fails the start, and is killed first.
 */
export const startHost = async (
  command: HostCommand,
  launch: HostLaunch | StoreBackedLaunch,
  options: HostStartOptions = {},
): Promise<HostStart> => {
  const freeLoopbackPort = String(await freePort());
  if ('kind' in launch) {
    const named = command.argv.find((argument) => DIRECTORY_PLACEHOLDER.test(argument));
    if (named !== undefined) {
      throw new Error(
        `${command.name} runs no directory or build, but its command names ${named}`,
      );
    }
  }
  const values =
    'kind' in launch
      ? { port: freeLoopbackPort }
      : { directory: launch.directory, built: launch.built, port: freeLoopbackPort };
  const [program, ...args] = command.argv.map((argument) => substitute(argument, values));
  if (program === undefined) throw new Error(`The host command for ${command.name} is empty`);
  const child = spawn(program, args, {
    cwd: command.cwd,
    env: command.env === undefined ? process.env : { ...process.env, ...command.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const kill = (): void => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  };
  options.onSpawn?.(kill);
  // A host that fails to spawn emits 'error' and may never emit 'exit'.
  const failed = new Promise<never>((_, reject) => {
    child.once('error', (error) => {
      reject(new Error(`${command.name} could not be started: ${error.message}`));
    });
  });
  failed.catch(() => undefined);
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
    stderr += chunk;
  });
  const exited = new Promise<number | null>((resolve) => child.once('exit', resolve));
  const announced = new Promise<HostAnnouncement | undefined>((resolve) => {
    const lines = createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      const announcement = readJsonAnnouncement(line);
      if (announcement === undefined) return;
      lines.removeAllListeners('line');
      resolve(announcement);
    });
    // Standard output ends after the host's last line has been read, which
    // 'exit' does not wait for: a host that announces and exits at once would
    // otherwise be read as one that never announced.
    lines.once('close', () => resolve(undefined));
  });
  // Standard output keeps flowing after the announcement, so a host that
  // writes more to it never blocks on a full pipe.
  child.stdout.resume();

  const deadlineMs = options.announceDeadlineMs ?? ANNOUNCE_DEADLINE_MS;
  let deadlineTimer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    deadlineTimer = setTimeout(() => {
      reject(
        new Error(`${command.name} did not announce within ${String(deadlineMs)}ms\n${stderr}`),
      );
    }, deadlineMs);
  });
  let announcement: HostAnnouncement | undefined;
  try {
    announcement = await Promise.race([announced, failed, deadline]);
  } catch (error) {
    kill();
    throw error;
  } finally {
    clearTimeout(deadlineTimer);
  }
  if (announcement?.kind !== 'listening') {
    // A host that refused exits by itself; one that stays up has broken the contract.
    const timer = setTimeout(kill, REFUSED_EXIT_DEADLINE_MS);
    try {
      const exitCode = await Promise.race([exited, failed]);
      return { kind: 'refused', message: announcement?.message, exitCode, stderr };
    } finally {
      clearTimeout(timer);
    }
  }

  const { port, secret } = announcement;
  const hostHeader = `127.0.0.1:${String(port)}`;
  const sendRaw = (wire: WireRequest): Promise<Response> => sendOnWire(port, wire);
  let cookie: string | undefined;
  if (secret !== undefined) {
    let launchTimer: NodeJS.Timeout | undefined;
    const launchDeadline = new Promise<never>((_, reject) => {
      launchTimer = setTimeout(() => {
        reject(
          new Error(
            `${command.name} did not answer its launch secret within ${String(deadlineMs)}ms\n${stderr}`,
          ),
        );
      }, deadlineMs);
    });
    try {
      const launched = await Promise.race([
        sendRaw({
          method: 'GET',
          target: `/?launch=${encodeURIComponent(secret)}`,
          headers: { host: hostHeader },
        }),
        launchDeadline,
      ]);
      cookie = sessionCookieOf(launched);
      if (launched.status !== 302 || cookie === undefined) {
        throw new Error(
          `${command.name} answered ${String(launched.status)} to its own launch secret`,
        );
      }
    } catch (error) {
      kill();
      throw error;
    } finally {
      clearTimeout(launchTimer);
    }
  }
  const exchange: Exchange = async (request) => {
    const url = new URL(request.url);
    const headers = headersOf(request);
    headers['host'] = hostHeader;
    if (cookie !== undefined) headers['cookie'] = cookie;
    const body = request.body === null ? undefined : new Uint8Array(await request.arrayBuffer());
    const wire: WireRequest = {
      method: request.method,
      target: url.pathname + url.search,
      headers,
    };
    return sendRaw(body === undefined ? wire : { ...wire, body });
  };
  return {
    kind: 'listening',
    host: {
      origin: `http://${hostHeader}`,
      exchange,
      port,
      secret,
      sessionCookie: cookie,
      hostHeader,
      sendRaw,
      closeStdin: () => child.stdin.end(),
      signal: (name) => child.kill(name),
      exited,
      stderr: () => stderr,
      kill,
    },
  };
};
