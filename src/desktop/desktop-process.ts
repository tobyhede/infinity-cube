import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { newUuid } from '@project/core';
import { describeRunRefusal } from '../cli/run-refusal';
import { describeError } from '../cli/describe-error';
import { startRun, type RunEvent } from '../run/run';
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
 * standard input closes, which is how the desktop shell stops it, it stops
 * serving, writes any edit not yet on disk, and exits; SIGINT, SIGTERM and
 * SIGHUP do the same, as they do for a run, and a second one exits at once.
 */

const announce = (announcement: SidecarAnnouncement): void => {
  process.stdout.write(`${JSON.stringify(announcement)}\n`);
};

const report = (event: RunEvent): void => {
  if (event.kind === 'write-failed') {
    process.stderr.write(`Could not write the directory: ${describeError(event.reason)}\n`);
  }
};

const main = async (): Promise<void> => {
  const [directoryArgument, builtArgument] = process.argv.slice(2);
  if (directoryArgument === undefined || builtArgument === undefined) {
    process.stderr.write('Usage: desktop-sidecar <directory> <built-application-directory>\n');
    process.exit(2);
  }
  const directory = resolve(directoryArgument);
  const built = resolve(builtArgument);

  const started = await startRun(directory, {
    newId: newUuid,
    schedule: (callback, milliseconds) => {
      const timer = setTimeout(callback, milliseconds);
      return () => clearTimeout(timer);
    },
    report,
  });
  if (started.kind !== 'running') {
    announce({ kind: 'refused', message: describeRunRefusal(started, directory) });
    process.exit(1);
  }
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
    announce({ kind: 'listening', port, secret });
  });

  let stopping = false;
  const stop = (): void => {
    if (stopping) {
      process.stderr.write('Exiting without waiting for the last write.\n');
      process.exit(1);
    }
    stopping = true;
    // The server closes first, so no edit can be committed behind the last write.
    server.close();
    if ('closeAllConnections' in server) server.closeAllConnections();
    void run.stop().then(
      (stopped) => {
        if (stopped.kind === 'unwritten') {
          process.stderr.write(
            `Stopped, but the last edits were not written: ${describeError(stopped.reason)}\n`,
          );
          process.exit(1);
        }
        process.exit(0);
      },
      (error: unknown) => {
        process.stderr.write(`Could not stop cleanly: ${describeError(error)}\n`);
        process.exit(1);
      },
    );
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

main().catch((error: unknown) => {
  announce({ kind: 'refused', message: describeError(error) });
  process.exit(1);
});
