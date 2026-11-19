import { rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  readFileTree,
  removeTemporaryDirectories,
  temporaryDirectory,
} from '../../conformance/http/fixture';
import { expectUnwrittenInsideTheQuietPeriod } from '../../conformance/http/process-cases';

/**
 * How the conformance suite reads back the directory a host writes
 * (`conformance/http/fixture.ts`), while the host may still be writing it.
 */

afterAll(removeTemporaryDirectories);

describe('reading a directory a host is writing', () => {
  it('reads a tree while a file is written beside its target and renamed over it', async () => {
    // Export writes each changed file to a temporary name and renames it over
    // its target, so a read can list the temporary file and find it gone.
    const directory = await temporaryDirectory();
    await writeFile(join(directory, 'space.json'), '{}\n');
    const state = { writing: true };
    const writer = (async () => {
      for (let round = 0; state.writing; round += 1) {
        const temporary = join(directory, `.space.json.${String(round)}.tmp`);
        await writeFile(temporary, `{"round":${String(round)}}\n`);
        await rename(temporary, join(directory, 'space.json'));
      }
    })();
    try {
      for (let read = 0; read < 2_000; read += 1) {
        const tree = await readFileTree(directory);
        expect(tree.has('space.json')).toBe(true);
      }
    } finally {
      state.writing = false;
      await writer;
    }
  });
});

describe('expecting a directory unwritten inside the quiet period', () => {
  const writtenDirectory = async () => {
    const directory = await temporaryDirectory();
    const before = await readFileTree(directory);
    await writeFile(join(directory, 'space.json'), '{}\n');
    return { directory, before };
  };

  it('fails a directory written soon after the commit was sent', async () => {
    const { directory, before } = await writtenDirectory();
    await expect(
      expectUnwrittenInsideTheQuietPeriod(directory, before, Date.now()),
    ).rejects.toThrow(/unexpected space\.json/);
  });

  it('checks nothing once the read finishes too late to tell a write made on time', async () => {
    const { directory, before } = await writtenDirectory();
    await expect(
      expectUnwrittenInsideTheQuietPeriod(directory, before, Date.now() - 2_000),
    ).resolves.toBe(false);
  });
});
