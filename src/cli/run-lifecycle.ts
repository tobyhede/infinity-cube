import type { UUID } from '@project/core';
import type { Run, RunEvent, RunOptions } from '../run/run';
import { describeError } from './describe-error';

/**
 * What a process that runs an Aggregate directory does around the Run module:
 * `cube run`'s process (`run-process.ts`) and the desktop sidecar
 * (`src/desktop/desktop-process.ts`). Each names its own server and streams;
 * the clock, the report and the order a stop takes are this module's.
 *
 * It imports the Run module for its types alone, so `run-process.ts` can take
 * its signals before the heavy imports load.
 */

const report = (event: RunEvent): void => {
  if (event.kind === 'write-failed') {
    process.stderr.write(`Could not write the directory: ${describeError(event.reason)}\n`);
  }
};

/** A run's options in a process: the process's timers and its standard error. */
export const processRunOptions = (newId: () => UUID): RunOptions => ({
  newId,
  schedule: (callback, milliseconds) => {
    const timer = setTimeout(callback, milliseconds);
    return () => clearTimeout(timer);
  },
  report,
});

/** A stop request while a stop is under way: exit now, non-zero. */
export const exitWithoutWaiting = (): never => {
  process.stderr.write('Exiting without waiting for the last write.\n');
  process.exit(1);
};

/**
 * Stop serving, then write any edit not yet on disk. The server closes first,
 * so no edit can be committed behind the last write; its failing to close is no
 * reason to skip the write. Exits non-zero when the write fails, and resolves
 * once the directory holds every edit.
 */
export const stopAndWrite = async (closeServer: () => Promise<void>, run: Run): Promise<void> => {
  await closeServer().catch((error: unknown) => {
    process.stderr.write(`Could not close the server: ${describeError(error)}\n`);
  });
  const stopped = await run.stop();
  if (stopped.kind === 'unwritten') {
    process.stderr.write(
      `Stopped, but the last edits were not written: ${describeError(stopped.reason)}\n`,
    );
    process.exit(1);
  }
};

/** A stop that threw rather than answering: say so and exit non-zero. */
export const exitUncleanStop = (error: unknown): never => {
  process.stderr.write(`Could not stop cleanly: ${describeError(error)}\n`);
  process.exit(1);
};
