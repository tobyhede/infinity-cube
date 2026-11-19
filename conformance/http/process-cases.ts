import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spaceFileSchema, uuidSchema } from '@project/core';
import { MAX_COMMIT_BODY_BYTES } from '@project/http';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { typescriptExportOracle } from './export-oracle';
import {
  fileTreeDifferences,
  fixtureCopy,
  readFileTree,
  removeTemporaryDirectories,
  temporaryDirectory,
  standInBuild,
  type FileTree,
} from './fixture';
import { send, type ConformanceHost } from './host';
import {
  startHost,
  takesStandInBuild,
  type HostCommand,
  type HostStart,
  type RunningHost,
} from './host-process';
import { describeWireConformance } from './wire-cases';
import {
  expectApiPolicy,
  expectProblem,
  loadSpace,
  META,
  renameCommitText,
  renameSpace,
  spaceAddress,
} from './wire';

/**
 * The HTTP conformance suite against a host process: the cases every host is
 * held to (`wire-cases.ts`), then what only a process shows — the `Host` check
 * and the launch lock, a refusal, and the directory a host leaves behind on
 * quiet and on stop, byte for byte as the TypeScript Export writes it.
 *
 * `command` is the only thing that names the host, so the same suite runs
 * against any host that keeps the contract in `README.md`.
 */

export interface HostProcessConformanceOptions {
  readonly command: HostCommand;
}

/** Long enough for a host to start, and for a quiet period and a write after it. */
const PROCESS_TIMEOUT_MS = 60_000;
/** How long the suite waits for a write on quiet: the quiet period is about a second (ADR 0117). */
const QUIET_WRITE_DEADLINE_MS = 15_000;
/** Well short of the quiet period, so a host that keeps it has not yet written. */
const WELL_INSIDE_THE_QUIET_PERIOD_MS = 250;
/**
 * Half the quiet period: a read of the directory that has finished this soon
 * after the commit was sent cannot have seen a write the host made on time.
 */
const SURELY_INSIDE_THE_QUIET_PERIOD_MS = 500;
/** Longer than the quiet period, so a write it would have scheduled has had its chance. */
const PAST_THE_QUIET_PERIOD_MS = 2_500;

const OTHER_SPACE = uuidSchema.parse('00000000-0000-4000-8000-000000000080');

/** The name of a `name=value` cookie, or of a `Set-Cookie` value. */
const cookieName = (cookie: string): string => cookie.split(';')[0]?.split('=')[0]?.trim() ?? '';

/** ST-114: the lock's refusals are plain text that is never cached. */
const expectPlainRefusal = (response: Response): void => {
  expect(response.headers.get('content-type')).toMatch(/^text\/plain(;|$)/);
  expect(response.headers.get('cache-control')).toBe('no-store');
};

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const expectSameFiles = (actual: FileTree, expected: FileTree): void => {
  expect(fileTreeDifferences(actual, expected)).toEqual([]);
};

/**
 * Expect the directory still to hold `before`, a commit having been sent at
 * `sentAt` (a `Date.now()` taken before sending it). A read that finishes past
 * {@link SURELY_INSIDE_THE_QUIET_PERIOD_MS} could see a write the host made on
 * time, so on a runner that slow nothing is checked rather than the host
 * failed. Answers whether the directory was checked.
 */
export const expectUnwrittenInsideTheQuietPeriod = async (
  directory: string,
  before: FileTree,
  sentAt: number,
): Promise<boolean> => {
  const tree = await readFileTree(directory);
  if (Date.now() - sentAt > SURELY_INSIDE_THE_QUIET_PERIOD_MS) return false;
  expectSameFiles(tree, before);
  return true;
};

/** Resolves once the directory holds `expected`, or fails naming what still differs. */
const waitForFiles = async (directory: string, expected: FileTree): Promise<void> => {
  const deadline = Date.now() + QUIET_WRITE_DEADLINE_MS;
  for (;;) {
    const differences = fileTreeDifferences(await readFileTree(directory), expected);
    if (differences.length === 0) return;
    if (Date.now() > deadline) {
      throw new Error(`The directory was not written on quiet:\n${differences.join('\n')}`);
    }
    await delay(100);
  }
};

/**
 * The fixture copy with its Meta Space's Maps removed, so the first working
 * read of it initializes one (MG-74).
 */
const withMaplessMeta = async (directory: string): Promise<string> => {
  const path = join(directory, META, 'space.json');
  const space: unknown = JSON.parse(await readFile(path, 'utf8'));
  const { maps: _maps, defaultMap: _defaultMap, ...mapless } = spaceFileSchema.parse(space);
  await writeFile(path, `${JSON.stringify(mapless, null, 2)}\n`);
  return directory;
};

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

/**
 * A tree with every id the base did not hold spelled as its order of first
 * appearance, so two writes that minted different ids for the same Map compare
 * byte for byte everywhere else.
 */
const withMintedIdsNumbered = (tree: FileTree, base: FileTree): FileTree => {
  const known = new Set(
    [...base.values()].flatMap((bytes) => bytes.toString('utf8').match(UUID_PATTERN) ?? []),
  );
  return new Map(
    [...tree].map(([name, bytes]): [string, Buffer] => {
      const minted: string[] = [];
      const text = bytes.toString('utf8').replaceAll(UUID_PATTERN, (id) => {
        if (known.has(id)) return id;
        if (!minted.includes(id)) minted.push(id);
        return `minted-${String(minted.indexOf(id))}`;
      });
      return [name, Buffer.from(text)];
    }),
  );
};

export const describeHostProcessConformance = (options: HostProcessConformanceOptions): void => {
  const { command } = options;
  const oracle = typescriptExportOracle;
  /** A way to kill each host a case started, registered as soon as it is spawned. */
  const caseKills: (() => void)[] = [];
  /** The same for the hosts that outlive a case: the wire group's. */
  const groupKills: (() => void)[] = [];

  /**
   * Start the host on `directory`, failing the case if it does not listen.
   * The host is killed when the case ends, if it has not exited by then, even
   * when the case ends before the host has announced itself.
   */
  const start = (directory: string): Promise<RunningHost> => startOn(directory, caseKills);

  /** Spawn the host on `directory`, registering its kill in `kills` as soon as it is spawned. */
  const launch = async (directory: string, kills: (() => void)[]): Promise<HostStart> => {
    const built = takesStandInBuild(command) ? await standInBuild() : '';
    return startHost(command, { directory, built }, { onSpawn: (kill) => kills.push(kill) });
  };

  const startOn = async (directory: string, kills: (() => void)[]): Promise<RunningHost> => {
    const started = await launch(directory, kills);
    if (started.kind !== 'listening') {
      throw new Error(
        `${command.name} did not listen on ${directory}: ${started.message ?? ''}\n${started.stderr}`,
      );
    }
    return started.host;
  };

  /**
   * The host's launch secret, or `undefined` for a host that keeps no lock. A
   * host whose command declares the lock and announces no secret fails here
   * rather than skipping every cookie case.
   */
  const lockSecret = (host: RunningHost): string | undefined => {
    if (command.keepsLock) {
      expect(
        host.secret,
        `${command.name} keeps the launch lock but announced no secret`,
      ).toBeDefined();
    }
    return host.secret;
  };

  const stopBySignal = async (host: RunningHost): Promise<void> => {
    host.signal('SIGINT');
    expect(await host.exited, host.stderr()).toBe(0);
  };

  afterAll(async () => {
    for (const kill of groupKills.splice(0)) kill();
    await removeTemporaryDirectories();
  });

  describeWireConformance({
    name: command.name,
    builtApplication: takesStandInBuild(command) ? 'stand-in' : 'embedded',
    openTimeoutMs: PROCESS_TIMEOUT_MS,
    open: async () => {
      const host = await startOn(await fixtureCopy(), groupKills);
      return {
        host,
        close: () => {
          host.kill();
          return Promise.resolve();
        },
      };
    },
  });

  describe(`HTTP conformance: the host process (${command.name})`, () => {
    afterEach(() => {
      for (const kill of caseKills.splice(0)) kill();
    });

    // The `Host` check and the launch lock (ADR 0155): `src/desktop/desktop-handler.ts`.
    describe('the lock', () => {
      it(
        'answers 421 to a request naming any Host but its own',
        async () => {
          const host = await start(await fixtureCopy());
          const others = [
            `localhost:${String(host.port)}`,
            '127.0.0.1',
            `127.0.0.1:${String(host.port + 1)}`,
            'attacker.example',
          ];
          for (const other of others) {
            const response = await host.sendRaw({
              method: 'GET',
              target: '/api/spaces',
              headers: { host: other },
            });
            expect(response.status, other).toBe(421);
            expectPlainRefusal(response);
          }
          // The same request naming its own Host is answered.
          expect((await send(host, '/api/spaces')).status).toBe(200);
        },
        PROCESS_TIMEOUT_MS,
      );

      it(
        'answers 403 to a request without the session cookie, and to a wrong launch secret',
        async (context) => {
          const host = await start(await fixtureCopy());
          if (lockSecret(host) === undefined) {
            context.skip();
            return;
          }
          const bare = { host: host.hostHeader };
          for (const target of ['/', '/api/spaces', spaceAddress(META), '/somewhere']) {
            const response = await host.sendRaw({ method: 'GET', target, headers: bare });
            expect(response.status, target).toBe(403);
            expectPlainRefusal(response);
          }
          // The cookie the host itself set, holding another value.
          const name = cookieName(host.sessionCookie ?? '');
          const wrongCookie = await host.sendRaw({
            method: 'GET',
            target: '/api/spaces',
            headers: { ...bare, cookie: `${name}=wrong` },
          });
          expect(wrongCookie.status).toBe(403);
          expectPlainRefusal(wrongCookie);
          const wrongSecret = await host.sendRaw({
            method: 'GET',
            target: '/?launch=wrong',
            headers: bare,
          });
          expect(wrongSecret.status).toBe(403);
          expectPlainRefusal(wrongSecret);
          expect(wrongSecret.headers.getSetCookie()).toEqual([]);
        },
        PROCESS_TIMEOUT_MS,
      );

      it(
        'trades the launch secret for an HttpOnly, SameSite=Strict session cookie by a redirect',
        async (context) => {
          const host = await start(await fixtureCopy());
          const secret = lockSecret(host);
          if (secret === undefined) {
            context.skip();
            return;
          }
          const response = await host.sendRaw({
            method: 'GET',
            target: `/?launch=${encodeURIComponent(secret)}`,
            headers: { host: host.hostHeader },
          });
          expect(response.status).toBe(302);
          expect(response.headers.get('location')).toBe('/');
          const [cookie] = response.headers.getSetCookie();
          const attributes = (cookie ?? '').split(';').map((part) => part.trim().toLowerCase());
          expect(attributes).toEqual(
            expect.arrayContaining(['httponly', 'samesite=strict', 'path=/']),
          );
          // ST-114: a webview scopes a cookie by host, not port, so its name carries the port.
          expect(cookieName(cookie ?? '')).toContain(String(host.port));
          const presented = await host.sendRaw({
            method: 'GET',
            target: '/api/spaces',
            headers: { host: host.hostHeader, cookie: (cookie ?? '').split(';')[0] ?? '' },
          });
          expect(presented.status).toBe(200);
          const elsewhere = await host.sendRaw({
            method: 'GET',
            target: `/?launch=${encodeURIComponent(secret)}`,
            headers: { host: 'attacker.example' },
          });
          expect(elsewhere.status).toBe(421);
        },
        PROCESS_TIMEOUT_MS,
      );
    });

    describe('refusal', () => {
      it(
        'refuses a missing directory without listening, announcing why and exiting non-zero',
        async () => {
          const started = await launch(join(await temporaryDirectory(), 'missing'), caseKills);
          // `startHost` answers `listening` for a host that announced it was listening.
          expect(started.kind).toBe('refused');
          if (started.kind !== 'refused') return;
          // ST-113: the refusal is announced as one line, then the host exits non-zero.
          expect(started.message ?? '', started.stderr).not.toBe('');
          expect(started.exitCode).not.toBe(0);
          expect(started.exitCode).not.toBeNull();
        },
        PROCESS_TIMEOUT_MS,
      );
    });

    // A body declaring no length is measured as it arrives
    // (`MAX_COMMIT_BODY_BYTES`, `packages/http/src/index.ts`), which a
    // `Request -> Response` function cannot show: a client there sends no
    // chunked encoding.
    describe('a chunked body', () => {
      /** A commit sent chunked, declaring no length, with the `Host` and any cookie the host requires. */
      const postChunked = (host: RunningHost, body: Uint8Array): Promise<Response> => {
        const headers = {
          host: host.hostHeader,
          'content-type': 'application/json',
          'transfer-encoding': 'chunked',
        };
        const { sessionCookie } = host;
        return host.sendRaw({
          method: 'POST',
          target: '/api/spaces',
          headers: sessionCookie === undefined ? headers : { ...headers, cookie: sessionCookie },
          body,
        });
      };

      it(
        'commits a chunked body that declares no length',
        async () => {
          const host = await start(await fixtureCopy());
          const loaded = await loadSpace(host, META);
          const body = new TextEncoder().encode(renameCommitText(loaded, 'Sent chunked'));
          expect((await postChunked(host, body)).status).toBe(200);
          const reloaded = await loadSpace(host, META);
          expect(reloaded.snapshot.document.title).toBe('Sent chunked');
        },
        PROCESS_TIMEOUT_MS,
      );

      it(
        `answers 413 payload-too-large to a chunked body of ${String(MAX_COMMIT_BODY_BYTES + 1)} bytes that declares no length`,
        async () => {
          const host = await start(await fixtureCopy());
          const loaded = await loadSpace(host, META);
          const text = new TextEncoder().encode(renameCommitText(loaded, 'Too large'));
          // Trailing whitespace, which JSON ignores, so only the size refuses it.
          const body = new Uint8Array(MAX_COMMIT_BODY_BYTES + 1).fill(0x20);
          body.set(text);
          const response = await postChunked(host, body);
          expectApiPolicy(response);
          await expectProblem(response, 'payload-too-large');
          expect((await loadSpace(host, META)).revision).toBe(loaded.revision);
        },
        PROCESS_TIMEOUT_MS,
      );
    });

    // Export on quiet and on stop: `src/run/run.ts`, `src/cli/run-process.ts`
    // and `src/desktop/desktop-process.ts`, held byte for byte to the
    // TypeScript Export (`export-oracle.ts`).
    describe('Export', () => {
      const rename = (title: string) => (host: ConformanceHost) => renameSpace(host, META, title);

      it(
        'writes an edit once edits have been quiet, and keeps it on SIGINT',
        async () => {
          const directory = await fixtureCopy();
          const before = await readFileTree(directory);
          const expected = await oracle(directory, rename('Written on quiet'));
          const host = await start(directory);
          const sentAt = Date.now();
          await rename('Written on quiet')(host);
          // The write waits for the quiet period (about a second, ADR 0117):
          // nothing is written as the commit is answered, nor a moment after.
          await expectUnwrittenInsideTheQuietPeriod(directory, before, sentAt);
          await delay(WELL_INSIDE_THE_QUIET_PERIOD_MS);
          await expectUnwrittenInsideTheQuietPeriod(directory, before, sentAt);
          await waitForFiles(directory, expected);
          await stopBySignal(host);
          expectSameFiles(await readFileTree(directory), expected);
        },
        PROCESS_TIMEOUT_MS,
      );

      it(
        'writes an edit not yet written when stopped by SIGINT, and exits zero',
        async () => {
          const directory = await fixtureCopy();
          const expected = await oracle(directory, rename('Written on stop'));
          const host = await start(directory);
          await rename('Written on stop')(host);
          await stopBySignal(host);
          expectSameFiles(await readFileTree(directory), expected);
        },
        PROCESS_TIMEOUT_MS,
      );

      it.skipIf(!command.stopsOnStdinClose)(
        'writes an edit not yet written when its standard input closes, and exits zero',
        async () => {
          const directory = await fixtureCopy();
          const expected = await oracle(directory, rename('Written on close'));
          const host = await start(directory);
          await rename('Written on close')(host);
          host.closeStdin();
          expect(await host.exited, host.stderr()).toBe(0);
          expectSameFiles(await readFileTree(directory), expected);
        },
        PROCESS_TIMEOUT_MS,
      );

      // ST-65 at the wire (Storage ST-65, Maps and Graphs MG-74).
      it(
        'leaves the directory byte for byte unchanged when opening a Space initializes it (ST-65)',
        async () => {
          const directory = await withMaplessMeta(await fixtureCopy());
          const before = await readFileTree(directory);
          const host = await start(directory);
          const loaded = await loadSpace(host, META);
          expect(loaded.snapshot.document.maps?.map(({ title }) => title)).toEqual(['Map 1']);
          expect((await send(host, spaceAddress(META))).status).toBe(200);
          expect((await send(host, spaceAddress(META), { method: 'HEAD' })).status).toBe(200);
          await delay(PAST_THE_QUIET_PERIOD_MS);
          expectSameFiles(await readFileTree(directory), before);
          await stopBySignal(host);
          expectSameFiles(await readFileTree(directory), before);
        },
        PROCESS_TIMEOUT_MS,
      );

      it(
        'initializes the Space again on a second run over the directory the first run left unchanged (ST-65)',
        async () => {
          const directory = await withMaplessMeta(await fixtureCopy());
          const before = await readFileTree(directory);
          for (const run of ['first run', 'second run']) {
            const host = await start(directory);
            const loaded = await loadSpace(host, META);
            expect(loaded.snapshot.document.maps?.map(({ title }) => title), run).toEqual([
              'Map 1',
            ]);
            await stopBySignal(host);
            expectSameFiles(await readFileTree(directory), before);
          }
        },
        PROCESS_TIMEOUT_MS,
      );

      it(
        'writes the initialization with the next Edit (ST-65)',
        async () => {
          const directory = await withMaplessMeta(await fixtureCopy());
          const before = await readFileTree(directory);
          const edit = async (host: ConformanceHost): Promise<void> => {
            await loadSpace(host, META);
            await renameSpace(host, OTHER_SPACE, 'Edited after opening');
          };
          const expected = await oracle(directory, edit);
          const host = await start(directory);
          await edit(host);
          await stopBySignal(host);
          const written = await readFileTree(directory);
          const meta = spaceFileSchema.parse(
            JSON.parse(written.get(join(META, 'space.json'))?.toString('utf8') ?? 'null'),
          );
          expect(meta.maps?.map(({ title }) => title)).toEqual(['Map 1']);
          expect(meta.defaultMap).toBe(meta.maps?.[0]?.id);
          expectSameFiles(
            withMintedIdsNumbered(written, before),
            withMintedIdsNumbered(expected, before),
          );
        },
        PROCESS_TIMEOUT_MS,
      );
    });
  });
};
