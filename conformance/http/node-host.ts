import { z } from 'zod';
import { REPOSITORY_ROOT } from './fixture';
import type { HostCommand } from './host-process';

/**
 * The production Node host (`src/desktop/`), the host every other one is held
 * to: the desktop sidecar's process, run from source.
 */
export const NODE_HOST_COMMAND: HostCommand = {
  name: 'production Node host',
  argv: [
    process.execPath,
    '--import',
    'tsx',
    'src/desktop/desktop-process.ts',
    '{directory}',
    '{built}',
  ],
  cwd: REPOSITORY_ROOT,
  stopsOnStdinClose: true,
  keepsLock: true,
};

/**
 * The environment variable naming another host command, as JSON:
 * `{ "name", "argv", "cwd"?, "env"?, "stopsOnStdinClose", "keepsLock"? }`,
 * with the placeholders `README.md` names and `keepsLock` false when absent.
 * The suite then runs against that host instead.
 */
export const HOST_COMMAND_VARIABLE = 'INFINITY_CUBE_HTTP_CONFORMANCE_HOST';

/**
 * A host command as JSON names it. An unknown key fails rather than being
 * dropped. The SQLite restart proof reads its own host command through this
 * schema too, less the keys it does not read (`test/support/restart-proof-host.ts`).
 */
export const hostCommandSchema = z.strictObject({
  name: z.string().min(1),
  argv: z.array(z.string()).min(1),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
  stopsOnStdinClose: z.boolean(),
  keepsLock: z.boolean().default(false),
});

type MutableHostCommand = { -readonly [K in keyof HostCommand]: HostCommand[K] };

/**
 * The `HostCommand` a parsed command describes, with `cwd` and `env` present
 * only when it names them.
 */
export const hostCommandOf = (parsed: {
  readonly name: string;
  readonly argv: readonly string[];
  readonly cwd?: string | undefined;
  readonly env?: Readonly<Record<string, string>> | undefined;
  readonly stopsOnStdinClose: boolean;
  readonly keepsLock: boolean;
}): HostCommand => {
  const command: MutableHostCommand = {
    name: parsed.name,
    argv: parsed.argv,
    stopsOnStdinClose: parsed.stopsOnStdinClose,
    keepsLock: parsed.keepsLock,
  };
  if (parsed.cwd !== undefined) command.cwd = parsed.cwd;
  if (parsed.env !== undefined) command.env = parsed.env;
  return command;
};

/** The host command the environment names, or the production Node host. */
export const hostCommandFromEnvironment = (variable: string | undefined): HostCommand => {
  if (variable === undefined || variable === '') return NODE_HOST_COMMAND;
  let parsed: unknown;
  try {
    parsed = JSON.parse(variable);
  } catch {
    throw new Error(`${HOST_COMMAND_VARIABLE} is not valid JSON: ${variable}`);
  }
  // An unknown key fails rather than being dropped, so a misspelt `keepsLock`
  // cannot leave the lock cases expecting no lock.
  return hostCommandOf(hostCommandSchema.parse(parsed));
};
