import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { HostCommand } from '../../conformance/http/host-process';
import { restartProofHostFromEnvironment, startCommandHost } from '../support/restart-proof-host';

const temporaryDirectories: string[] = [];
afterAll(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

/**
 * How the SQLite restart proof (`test/e2e/sqlite-persistence.spec.ts`) is told
 * which host to start: the Vite host by default, or the command
 * `INFINITY_CUBE_RESTART_PROOF_HOST` names.
 */

describe('naming the restart proof host', () => {
  it.each([undefined, ''])('starts the Vite host when the variable is %j', (variable) => {
    expect(restartProofHostFromEnvironment(variable)).toEqual({ kind: 'vite' });
  });

  it('reads a command, its working directory and its environment', () => {
    expect(
      restartProofHostFromEnvironment(
        JSON.stringify({
          name: 'Rust CLI',
          argv: ['target/debug/infinity-cube', 'serve', '--store', 'sqlite', '--port', '{port}'],
          cwd: '/repository',
          env: { RUST_LOG: 'debug' },
        }),
      ),
    ).toEqual({
      kind: 'command',
      command: {
        name: 'Rust CLI',
        argv: ['target/debug/infinity-cube', 'serve', '--store', 'sqlite', '--port', '{port}'],
        cwd: '/repository',
        env: { RUST_LOG: 'debug' },
        stopsOnStdinClose: false,
        keepsLock: false,
      },
    });
  });

  it('reads a command with no working directory or environment', () => {
    expect(
      restartProofHostFromEnvironment(JSON.stringify({ name: 'host', argv: ['host'] })),
    ).toEqual({
      kind: 'command',
      command: { name: 'host', argv: ['host'], stopsOnStdinClose: false, keepsLock: false },
    });
  });

  it('names the variable when its value is not JSON', () => {
    expect(() => restartProofHostFromEnvironment('{name')).toThrow(
      /INFINITY_CUBE_RESTART_PROOF_HOST is not valid JSON/,
    );
  });

  it('refuses a command naming a key it does not read', () => {
    expect(() =>
      restartProofHostFromEnvironment(
        JSON.stringify({ name: 'host', argv: ['host'], stopsOnStdinClose: true }),
      ),
    ).toThrow(/stopsOnStdinClose/);
  });

  it('refuses a command with no program', () => {
    expect(() =>
      restartProofHostFromEnvironment(JSON.stringify({ name: 'host', argv: [] })),
    ).toThrow(/at least 1 element[\s\S]*"argv"/);
  });

  it.each(['{directory}', '--built={built}'])(
    'refuses a command naming %s, which the proof has no value for',
    (argument) => {
      expect(() =>
        restartProofHostFromEnvironment(JSON.stringify({ name: 'host', argv: ['host', argument] })),
      ).toThrow(/only \{port\}/);
    },
  );
});

/**
 * A host command running a stand-in host under Node with the port as
 * `process.argv[1]`: an HTTP server on it answering `answer` (an expression),
 * announced as the conformance suite's hosts announce, with `announced` (an
 * expression) spread into the announcement.
 */
const nodeHost = ({
  answer,
  onSigint = 'process.exit(0)',
  announced = '{}',
  env,
}: {
  readonly answer: string;
  readonly onSigint?: string;
  readonly announced?: string;
  readonly env?: Record<string, string>;
}): HostCommand => {
  const command = {
    name: 'stand-in host',
    argv: [
      process.execPath,
      '-e',
      `const port = Number(process.argv[1]);
       const server = require('node:http').createServer((_, response) => response.end(${answer}));
       server.listen(port, '127.0.0.1', () => console.log(JSON.stringify({ kind: 'listening', port, ...${announced} })));
       process.on('SIGINT', () => { server.close(); ${onSigint}; });`,
      '{port}',
    ],
    stopsOnStdinClose: false,
    keepsLock: false,
  } satisfies HostCommand;
  return env === undefined ? command : { ...command, env };
};

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe('starting a restart proof host by command', () => {
  it('serves at the port it announced, with the environment the command names, and stops on SIGINT', async () => {
    const host = await startCommandHost(
      nodeHost({ answer: '`${process.env.GREETING} ${process.pid}`', env: { GREETING: 'hello' } }),
    );
    const [greeting, pid] = (await (await fetch(host.baseURL)).text()).split(' ');
    expect(greeting).toBe('hello');
    expect(new URL(host.baseURL).hostname).toBe('127.0.0.1');
    await host.stop();
    // Gone by the time `stop` answers, so the proof can open the file next.
    expect(isAlive(Number(pid))).toBe(false);
  });

  it('fails a stop the host answers with a non-zero exit, naming what it wrote', async () => {
    const host = await startCommandHost(
      nodeHost({
        answer: "'up'",
        onSigint: "console.error('the last write failed'); process.exit(1)",
      }),
    );
    await expect(host.stop()).rejects.toThrow(/exited 1[\s\S]*the last write failed/);
  });

  it('kills a host that does not exit on SIGINT, and fails the stop', async () => {
    const host = await startCommandHost(
      nodeHost({ answer: '`${process.pid}`', onSigint: 'setInterval(() => undefined, 1000)' }),
      {
        stopDeadlineMs: 500,
      },
    );
    const pid = Number(await (await fetch(host.baseURL)).text());
    await expect(host.stop()).rejects.toThrow(/did not exit within 500ms of SIGINT/);
    expect(isAlive(pid)).toBe(false);
  });

  it('fails a host that refuses to start, with its refusal', async () => {
    await expect(
      startCommandHost({
        name: 'refusing host',
        argv: [
          process.execPath,
          '-e',
          `console.log(JSON.stringify({ kind: 'refused', message: 'SQLITE_PATH must name the SQLite database file' })); process.exit(1);`,
        ],
        stopsOnStdinClose: false,
        keepsLock: false,
      }),
    ).rejects.toThrow(
      /refusing host refused to start: SQLITE_PATH must name the SQLite database file/,
    );
  });

  it('fails a host that announces a launch secret, which the browser holds no cookie for, and stops it', async () => {
    // The stand-in trades its secret for a cookie as the desktop sidecar does,
    // so the conformance driver unlocks it; the proof's browser contexts would
    // still hold no cookie.
    const directory = await mkdtemp(join(tmpdir(), 'restart-proof-host-'));
    temporaryDirectories.push(directory);
    const pidFile = join(directory, 'pid');
    const command = nodeHost({
      answer: `(() => { response.statusCode = 302; response.setHeader('set-cookie', 'session=1'); return ''; })()`,
      announced: `(require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)), { secret: 'launch' })`,
    });
    await expect(startCommandHost(command)).rejects.toThrow(
      /stand-in host announced a launch secret/,
    );
    const pid = Number(await readFile(pidFile, 'utf8'));
    expect(isAlive(pid)).toBe(false);
  });

  it('hands the caller a way to kill the host as soon as it is spawned', async () => {
    let kill: (() => void) | undefined;
    const host = await startCommandHost(nodeHost({ answer: '`${process.pid}`' }), {
      onSpawn: (spawnedKill) => {
        kill = spawnedKill;
      },
    });
    const pid = Number(await (await fetch(host.baseURL)).text());
    expect(kill).toBeTypeOf('function');
    kill?.();
    await expect.poll(() => isAlive(pid)).toBe(false);
  });
});
