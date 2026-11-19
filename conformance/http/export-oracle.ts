import { cp } from 'node:fs/promises';
import { join } from 'node:path';
import { newUuid } from '@project/core';
import { startRun } from '../../src/run/run';
import { readFileTree, temporaryDirectory, type FileTree } from './fixture';
import type { ConformanceHost } from './host';

/**
 * What a directory should hold after a host has run an edit on it: the files,
 * byte for byte, that the TypeScript Export writes for the same edit, as a run
 * performs it (`src/run/run.ts`). A copy of `base`, the directory as it was
 * before the host ran, is run in process, `edit` is sent to the run's own
 * application, and the run is stopped, which writes the copy as every run
 * does.
 *
 * The production Node host runs this same code, so against it the Export
 * cases catch a missing or mistimed write rather than wrong bytes.
 */
export const typescriptExportOracle = async (
  base: string,
  edit: (host: ConformanceHost) => Promise<void>,
): Promise<FileTree> => {
  const directory = join(await temporaryDirectory(), 'expected');
  await cp(base, directory, { recursive: true });
  const started = await startRun(directory, {
    newId: newUuid,
    // Only the stop writes: the oracle has no quiet period to wait out.
    schedule: () => () => undefined,
    report: () => undefined,
  });
  if (started.kind !== 'running') throw new Error(`The oracle refused ${base}: ${started.kind}`);
  const { run } = started;
  await edit({ origin: 'http://127.0.0.1', exchange: async (request) => run.host.fetch(request) });
  const stopped = await run.stop();
  if (stopped.kind !== 'stopped') throw new Error('The oracle could not write its copy');
  return readFileTree(directory);
};
