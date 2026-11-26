import {
  DIRECTORY_PLACEHOLDER,
  startHost,
  STORE_BACKED_LAUNCH,
  type HostCommand,
  type HostStartOptions,
} from '../../conformance/http/host-process';
import { hostCommandOf, hostCommandSchema } from '../../conformance/http/node-host';

/**
 * Which host a restart proof starts, twice in sequence: the SQLite proof
 * (`test/e2e/sqlite-persistence.spec.ts`) against the file `SQLITE_PATH`
 * names, and the PostgreSQL proof (`test/e2e/postgres-persistence.spec.ts`)
 * against the database `DATABASE_URL` names. The Vite host by default, or a
 * host process started by command, so the same proof runs against another
 * runtime's host unchanged.
 */

/**
 * The environment variable naming the host command, as JSON:
 * `{ "name", "argv", "cwd"?, "env"? }`. `argv` is the program and its
 * arguments, in which `{port}` is replaced with a free loopback port; `env`
 * sets variables over the proof's own environment, which the host otherwise
 * inherits (`SQLITE_PATH` or `DATABASE_URL` among them). The host announces itself on standard
 * output as the HTTP conformance suite's hosts do
 * (`conformance/http/README.md`), with no launch secret, and stops on SIGINT,
 * exiting zero.
 */
export const RESTART_PROOF_HOST_VARIABLE = 'INFINITY_CUBE_RESTART_PROOF_HOST';

export type RestartProofHost =
  { readonly kind: 'vite' } | { readonly kind: 'command'; readonly command: HostCommand };

// The conformance suite's command schema, less the two keys this proof fixes:
// a key copied from the suite's description (`stopsOnStdinClose`, `keepsLock`)
// fails rather than being read as doing something here.
const commandSchema = hostCommandSchema
  .omit({ stopsOnStdinClose: true, keepsLock: true })
  .refine((command) => !command.argv.some((argument) => DIRECTORY_PLACEHOLDER.test(argument)), {
    message: 'A restart proof host command takes only {port}: it runs no directory or build',
    path: ['argv'],
  });

/** The host the environment names, or the Vite host when it names none. */
export const restartProofHostFromEnvironment = (variable: string | undefined): RestartProofHost => {
  if (variable === undefined || variable === '') return { kind: 'vite' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(variable);
  } catch {
    throw new Error(`${RESTART_PROOF_HOST_VARIABLE} is not valid JSON: ${variable}`);
  }
  return {
    kind: 'command',
    command: hostCommandOf({
      ...commandSchema.parse(parsed),
      stopsOnStdinClose: false,
      keepsLock: false,
    }),
  };
};

/** A host the proof started, reachable at `baseURL`. */
export interface StartedRestartProofHost {
  readonly baseURL: string;
  /**
   * Stop the host and answer once its process is gone, so nothing holds the
   * store when the proof opens it next. Fails when the host exits
   * non-zero, or has to be killed.
   */
  readonly stop: () => Promise<void>;
}

/** How long a host is given to exit on SIGINT before it is killed: well inside the proof's 120s timeout (`playwright.sqlite.config.ts`). */
const STOP_DEADLINE_MS = 15_000;

/**
 * Start the host `command` names, through the HTTP conformance suite's driver
 * (`conformance/http/host-process.ts`): spawned with `{port}` filled, found
 * through the line it announces, stopped by SIGINT. `onSpawn` is handed a way
 * to kill the host as soon as it is spawned, so a proof abandoned while the
 * host starts can still kill it.
 *
 * A host that announces a launch secret is stopped and fails the start: the
 * driver trades the secret for a session cookie that only its own requests
 * carry, and the proof's browser would hold none.
 */
export const startCommandHost = async (
  command: HostCommand,
  options: Pick<HostStartOptions, 'onSpawn'> & { readonly stopDeadlineMs?: number } = {},
): Promise<StartedRestartProofHost> => {
  const started = await startHost(command, STORE_BACKED_LAUNCH, options);
  if (started.kind === 'refused') {
    throw new Error(
      `${command.name} refused to start: ${started.message ?? '(no announcement)'} (exit ${String(started.exitCode)})\n${started.stderr}`,
    );
  }
  const { host } = started;
  if (host.secret !== undefined) {
    host.kill();
    await host.exited;
    throw new Error(
      `${command.name} announced a launch secret, which the restart proof cannot present: its browser would hold no session cookie`,
    );
  }
  const stopDeadlineMs = options.stopDeadlineMs ?? STOP_DEADLINE_MS;
  const stop = async (): Promise<void> => {
    host.signal('SIGINT');
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<'timed-out'>((resolve) => {
      timer = setTimeout(() => resolve('timed-out'), stopDeadlineMs);
    });
    const outcome = await Promise.race([host.exited, timedOut]);
    clearTimeout(timer);
    if (outcome === 'timed-out') {
      host.kill();
      await host.exited;
      throw new Error(
        `${command.name} did not exit within ${String(stopDeadlineMs)}ms of SIGINT, and was killed\n${host.stderr()}`,
      );
    }
    if (outcome !== 0) {
      throw new Error(`${command.name} exited ${String(outcome)} on SIGINT\n${host.stderr()}`);
    }
  };
  return { baseURL: host.origin, stop };
};

/**
 * Start the host `host` names: `startVite` for the Vite host, and otherwise
 * the command, handing `onSpawn` its kill. Both restart proofs start their
 * hosts through this, so neither can start Vite when a command is named.
 */
export const startRestartProofHost = (
  host: RestartProofHost,
  {
    startVite,
    onSpawn,
  }: {
    readonly startVite: () => Promise<StartedRestartProofHost>;
    readonly onSpawn: (kill: () => void) => void;
  },
): Promise<StartedRestartProofHost> =>
  host.kind === 'vite' ? startVite() : startCommandHost(host.command, { onSpawn });
