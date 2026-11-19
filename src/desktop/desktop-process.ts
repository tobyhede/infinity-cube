import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { newUuid } from '@project/core';
import { describeError } from '../cli/describe-error';
import {
  exitUncleanStop,
  exitWithoutWaiting,
  processRunOptions,
  stopAndWrite,
} from '../cli/run-lifecycle';
import { describeRunRefusal } from '../cli/run-refusal';
import { startRun, type RunRefusal } from '../run/run';
import type { SidecarAnnouncement } from './announcement';
import { createDesktopHandler } from './desktop-handler';
import { builtFiles, desktopContentSecurityPolicy } from './static-files';

/**
 * The desktop sidecar (ADR 0155): runs one Aggregate directory for one window
 * of the desktop application.
 *
 * `desktop-sidecar <directory> <built-application-directory>`
 *
 * It answers on `127.0.0.1` at a port the system picks, and writes exactly one
 * JSON line to standard output: `{"kind":"listening","port":…,"secret":…}`
 * once it can be reached, or `{"kind":"refused","message":…}` when the
 * directory cannot be run. Everything else goes to standard error. When its
 * standard input closes, which is how whatever starts it stops it, it stops
 * serving, writes any edit not yet on disk, and exits; SIGINT, SIGTERM and
 * SIGHUP do the same, as they do for a run, and a second one exits at once.
 */

/**
 * Write the announcement, resolving once standard output has taken all of it.
 * A pipe is written asynchronously, so exiting straight after the write would
 * cut a refusal longer than the pipe holds.
 */
const announce = (announcement: SidecarAnnouncement): Promise<void> =>
  new Promise((resolve) => {
    process.stdout.write(`${JSON.stringify(announcement)}\n`, () => resolve());
  });

/** Announce a refusal, then exit non-zero once it is written. */
const refuse = async (message: string): Promise<never> => {
  await announce({ kind: 'refused', message });
  process.exit(1);
};

/**
 * Why the directory was not run, for a presenter: they have the desktop
 * application, not a clone with `pnpm cube init` in it.
 */
const describeRefusal = (refusal: RunRefusal, directory: string): string =>
  refusal.kind === 'empty'
    ? `${directory} holds no talk: the folder is missing or empty. Choose a folder that holds an InfinityCube talk.\n`
    : describeRunRefusal(refusal, directory);

/**
 * Close the server and wait for it: it stops accepting at once, closes idle
 * connections, and closes each busy one once its response is sent, so an edit
 * already being committed lands before the last write.
 */
const closeServer = (server: ReturnType<typeof serve>): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) resolve();
      else reject(error);
    });
    if ('closeIdleConnections' in server) server.closeIdleConnections();
  });

const main = async (): Promise<void> => {
  const [directoryArgument, builtArgument] = process.argv.slice(2);
  if (directoryArgument === undefined || builtArgument === undefined) {
    process.stderr.write('Usage: desktop-sidecar <directory> <built-application-directory>\n');
    process.exit(2);
  }
  const directory = resolve(directoryArgument);
  const built = resolve(builtArgument);

  const started = await startRun(directory, processRunOptions(newUuid));
  if (started.kind !== 'running') return refuse(describeRefusal(started, directory));
  const { run } = started;

  const pageText = await readFile(join(built, 'index.html'), 'utf8');
  const secret = randomBytes(32).toString('base64url');
  let port = 0;
  const handler = createDesktopHandler({
    host: run.host,
    staticFile: builtFiles(built),
    page: { bytes: new TextEncoder().encode(pageText), contentType: 'text/html; charset=utf-8' },
    contentSecurityPolicy: desktopContentSecurityPolicy(pageText),
    secret,
    expectedHost: () => `127.0.0.1:${String(port)}`,
  });

  const server = serve({ fetch: handler, hostname: '127.0.0.1', port: 0 }, (info: AddressInfo) => {
    port = info.port;
    void announce({ kind: 'listening', port, secret });
  });

  let stopping = false;
  const stop = (): void => {
    if (stopping) exitWithoutWaiting();
    stopping = true;
    stopAndWrite(() => closeServer(server), run).then(() => process.exit(0), exitUncleanStop);
  };
  // Standard input ending is one request however many events report it.
  const stopFromInput = (): void => {
    if (!stopping) stop();
  };
  process.stdin.on('end', stopFromInput);
  process.stdin.on('close', stopFromInput);
  process.stdin.resume();
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  process.on('SIGHUP', stop);
};

try {
  await main();
} catch (error) {
  await refuse(describeError(error));
}
