import { z } from 'zod';
import { startHost, type HostCommand } from '../../conformance/http/host-process';

/**
 * Which host the SQLite restart proof (`test/e2e/sqlite-persistence.spec.ts`)
 * starts, twice in sequence, against the file `SQLITE_PATH` names: the Vite
 * host it has always started, or a host process started by command, so the
 * same proof runs against another runtime's host unchanged.
 */

/**
 * The environment variable naming the host command, as JSON:
 * `{ "name", "argv", "cwd"?, "env"? }`. `argv` is the program and its
 * arguments, in which `{port}` is replaced with a free loopback port; `env`
 * sets variables over the proof's own environment, which the host otherwise
 * inherits (`SQLITE_PATH` among them). The host announces itself on standard
 * output as the HTTP conformance suite's hosts do
 * (`conformance/http/README.md`), and stops on SIGINT, exiting zero.
 */
export const RESTART_PROOF_HOST_VARIABLE = 'INFINITY_CUBE_RESTART_PROOF_HOST';

export type RestartProofHost =
  { readonly kind: 'vite' } | { readonly kind: 'command'; readonly command: HostCommand };

/** A placeholder of the conformance suite's other than `{port}`, which a store-backed host has no value for. */
const UNFILLED_PLACEHOLDER = /\{(directory|built)\}/;

const commandSchema = z.strictObject({
  name: z.string().min(1),
  argv: z
    .array(z.string())
    .min(1)
    .refine((argv) => !argv.some((argument) => UNFILLED_PLACEHOLDER.test(argument)), {
      message: 'A restart proof host command takes only {port}: it runs no directory or build',
    }),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
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
  // An unknown key fails rather than being dropped, so a key copied from the
  // conformance suite's description (`stopsOnStdinClose`, `keepsLock`) is not
  // read as doing something here.
  const { cwd, env, ...command } = commandSchema.parse(parsed);
  return {
    kind: 'command',
    command: {
      ...command,
      ...(cwd === undefined ? {} : { cwd }),
      ...(env === undefined ? {} : { env }),
      stopsOnStdinClose: false,
      keepsLock: false,
    },
  };
};

/** A host the proof started, reachable at `baseURL`. */
export interface StartedRestartProofHost {
  readonly baseURL: string;
  /**
   * Stop the host and answer once its process is gone, so nothing holds the
   * SQLite file when the proof opens it next. Fails when the host exits
   * non-zero, or has to be killed.
   */
  readonly stop: () => Promise<void>;
}

/** Long enough for a host to write and close its file, and well inside the proof's timeout. */
const STOP_DEADLINE_MS = 15_000;

/**
 * Start the host `command` names, through the HTTP conformance suite's driver
 * (`conformance/http/host-process.ts`): spawned with `{port}` filled, found
 * through the line it announces, stopped by SIGINT.
 */
export const startCommandHost = async (
  command: HostCommand,
  options: { readonly stopDeadlineMs?: number } = {},
): Promise<StartedRestartProofHost> => {
  const started = await startHost(command, {});
  if (started.kind === 'refused') {
    throw new Error(
      `${command.name} refused to start: ${started.message ?? '(no announcement)'} (exit ${String(started.exitCode)})\n${started.stderr}`,
    );
  }
  const { host } = started;
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
