import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { uuidSchema, type UUID } from '@project/core';
import { initAggregate } from '../../src/run/run';

/*
 * The init conformance case (`conformance/init/README.md`), run against the
 * TypeScript generator: `initAggregate` with ids counted up from one writes
 * exactly `expected/`. `crates/host/tests/init.rs` runs the Rust one against
 * the same directory.
 */

const EXPECTED = fileURLToPath(new URL('../../conformance/init/expected', import.meta.url));

const countedIds = (): (() => UUID) => {
  let count = 0;
  return () => {
    count += 1;
    return uuidSchema.parse(`00000000-0000-4000-8000-${count.toString(16).padStart(12, '0')}`);
  };
};

/** Every file under `root`, by path relative to it with `/` between segments, and its bytes. */
const tree = async (root: string): Promise<Map<string, Buffer>> => {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const files = new Map<string, Buffer>();
  for (const entry of entries.filter((found) => found.isFile())) {
    const path = join(entry.parentPath, entry.name);
    files.set(relative(root, path).split(sep).join('/'), await readFile(path));
  }
  return files;
};

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('The init conformance case', () => {
  it('writes the files of conformance/init/expected, byte for byte', async () => {
    const root = await mkdtemp(join(tmpdir(), 'infinity-cube-init-conformance-'));
    roots.push(root);
    const directory = join(root, 'space');

    await expect(initAggregate(directory, countedIds())).resolves.toEqual({
      kind: 'initialized',
    });

    expect(await tree(directory)).toEqual(await tree(EXPECTED));
  });
});
