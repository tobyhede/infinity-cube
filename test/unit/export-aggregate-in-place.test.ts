import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uuidSchema } from '@project/core';
import type { LoadedSpace } from '@project/persistence';
import { afterEach, describe, expect, it } from 'vitest';
import { exportAggregate } from '../../src/export/export-aggregate';
import { MemorySpaceRepository } from '@project/aggregate';
import { textAssetFiles, textAssetRef } from '../support/aggregate-directory';
import { admitted, directoryTree } from '../support/stored-assets';

const SPACE_ID = uuidSchema.parse('11111111-1111-4111-8111-111111111111');
const RESOURCE_A = uuidSchema.parse('22222222-2222-4222-8222-222222222222');
const RESOURCE_B = uuidSchema.parse('33333333-3333-4333-8333-333333333333');

const A_TEXT = 'A body.\n';
const B_TEXT = 'B body.\n';
const B_EDITED = 'B edited.\n';

/** One Meta Space holding two Markdown Resources, with Resource B's text chosen by the test. */
const storedSpace = (bodyB = B_TEXT): LoadedSpace => ({
  snapshot: {
    id: SPACE_ID,
    document: { version: 1, title: 'Stored talk' },
    resources: [
      {
        id: RESOURCE_A,
        document: { title: 'A', kind: 'markdown', content: { url: textAssetRef(A_TEXT) } },
      },
      {
        id: RESOURCE_B,
        document: { title: 'B', kind: 'markdown', content: { url: textAssetRef(bodyB) } },
      },
    ],
  },
  revision: 7n,
  exportedRevision: null,
});

/**
 * A store holding `space` and every text these tests write (ADR 0142). Export
 * carries a text only while a Resource names it, so holding more is harmless.
 */
const holding = async (space: LoadedSpace): Promise<MemorySpaceRepository> => {
  const repository = new MemorySpaceRepository([space], SPACE_ID);
  for (const text of [A_TEXT, B_TEXT, B_EDITED]) {
    await repository.storeAsset(await admitted(new TextEncoder().encode(text), 'text/markdown'));
  }
  return repository;
};

const temporaryDirectories = new Set<string>();

const makeTemporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'infinity-cube-export-in-place-'));
  temporaryDirectories.add(directory);
  return directory;
};

afterEach(async () => {
  for (const directory of temporaryDirectories) {
    await chmod(join(directory, 'exported', SPACE_ID, 'resources'), 0o755).catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
  }
  temporaryDirectories.clear();
});

const exportTo = async (repository: MemorySpaceRepository, destination: string): Promise<void> => {
  const result = await exportAggregate(repository, destination);
  if (result.kind !== 'exported') throw new Error(`Export answered ${result.kind}`);
};

const resourceFile = (destination: string, id: string): string =>
  join(destination, SPACE_ID, 'resources', `${id}.json`);

/** The file under `assets/` that carries `text`. */
const textFile = (destination: string, text: string): string =>
  join(destination, 'assets', ...Object.keys(textAssetFiles(text)));

/** What identifies a file or directory on disk, and when its contents last changed. */
const identity = async (path: string) => {
  const { ino, mtimeMs } = await stat(path);
  return { ino, mtimeMs };
};

describe('Export writes in place', () => {
  it('keeps the destination and each Space directory, and stages nothing beside them', async () => {
    const parent = await makeTemporaryDirectory();
    const destination = join(parent, 'exported');
    await exportTo(await holding(storedSpace()), destination);
    const before = {
      destination: (await stat(destination)).ino,
      space: (await stat(join(destination, SPACE_ID))).ino,
      resources: (await stat(join(destination, SPACE_ID, 'resources'))).ino,
    };

    await exportTo(await holding(storedSpace(B_EDITED)), destination);

    expect({
      destination: (await stat(destination)).ino,
      space: (await stat(join(destination, SPACE_ID))).ino,
      resources: (await stat(join(destination, SPACE_ID, 'resources'))).ino,
    }).toEqual(before);
    await expect(readdir(parent)).resolves.toEqual(['exported']);
    await expect(readFile(textFile(destination, B_EDITED), 'utf8')).resolves.toBe(B_EDITED);
  });

  it('leaves a file whose bytes are unchanged exactly as it was', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    await exportTo(await holding(storedSpace()), destination);
    const unchangedFiles = async () => ({
      resource: await identity(resourceFile(destination, RESOURCE_A)),
      text: await identity(textFile(destination, A_TEXT)),
      space: await identity(join(destination, SPACE_ID, 'space.json')),
      aggregate: await identity(join(destination, 'aggregate.json')),
    });
    const unchanged = await unchangedFiles();
    // Editing B's text names a new asset, so B's Resource file changes too.
    const changed = await identity(resourceFile(destination, RESOURCE_B));

    await exportTo(await holding(storedSpace(B_EDITED)), destination);

    expect(await unchangedFiles()).toEqual(unchanged);
    expect((await identity(resourceFile(destination, RESOURCE_B))).ino).not.toBe(changed.ino);
    await expect(readFile(textFile(destination, B_EDITED), 'utf8')).resolves.toBe(B_EDITED);
    await expect(stat(textFile(destination, B_TEXT))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  /*
   * A Resource that leaves takes its own Resource file with it, and a Markdown
   * Resource the text no other Resource names; every other Resource's files,
   * and a file Import does not read in `resources/`, stay.
   */
  it("removes a deleted Resource's own files and nothing else", async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const RESOURCE_C = uuidSchema.parse('44444444-4444-4444-8444-444444444444');
    const holdingAll = storedSpace();
    const withUr: LoadedSpace = {
      ...holdingAll,
      snapshot: {
        ...holdingAll.snapshot,
        resources: [
          ...holdingAll.snapshot.resources,
          { id: RESOURCE_C, document: { title: 'C', kind: 'ur', content: {} } },
        ],
      },
    };
    const without = (id: string): LoadedSpace => ({
      ...withUr,
      snapshot: {
        ...withUr.snapshot,
        resources: withUr.snapshot.resources.filter((resource) => resource.id !== id),
      },
    });
    const resources = join(destination, SPACE_ID, 'resources');
    await exportTo(await holding(withUr), destination);
    await writeFile(join(resources, 'notes.txt'), 'kept\n');
    const kept = await identity(textFile(destination, A_TEXT));

    await exportTo(await holding(without(RESOURCE_B)), destination);

    expect((await readdir(resources)).sort()).toEqual(
      [`${RESOURCE_A}.json`, `${RESOURCE_C}.json`, 'notes.txt'].sort(),
    );
    await expect(identity(textFile(destination, A_TEXT))).resolves.toEqual(kept);
    await expect(stat(textFile(destination, B_TEXT))).rejects.toMatchObject({ code: 'ENOENT' });

    await exportTo(await holding(without(RESOURCE_C)), destination);

    expect((await readdir(resources)).sort()).toEqual(
      [`${RESOURCE_A}.json`, `${RESOURCE_B}.json`, 'notes.txt'].sort(),
    );
  });

  /*
   * InfinityCube owns what Import reads and nothing else. A `.git` tree, a README
   * beside `aggregate.json`, a notes directory and whatever an author keeps in
   * `assets/` that Import does not own are neither read, copied nor touched.
   */
  it('never touches what Import does not read', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    await exportTo(await holding(storedSpace()), destination);
    await mkdir(join(destination, '.git', 'objects', 'ab'), { recursive: true });
    await writeFile(join(destination, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    await writeFile(join(destination, '.git', 'objects', 'ab', 'cdef'), 'object\n');
    await writeFile(join(destination, 'README.md'), '# My talk\n');
    await mkdir(join(destination, 'notes'));
    await writeFile(join(destination, 'notes', 'ideas.md'), 'ideas\n');
    await mkdir(join(destination, 'assets', 'drafts'), { recursive: true });
    await writeFile(join(destination, 'assets', '.gitkeep'), '');
    await writeFile(join(destination, 'assets', 'drafts', 'sketch.txt'), 'sketch\n');
    await writeFile(join(destination, SPACE_ID, 'notes.txt'), 'space note\n');
    const authored = [
      '.git',
      join('.git', 'HEAD'),
      join('.git', 'objects', 'ab', 'cdef'),
      'README.md',
      join('notes', 'ideas.md'),
      join('assets', '.gitkeep'),
      join('assets', 'drafts', 'sketch.txt'),
      join(SPACE_ID, 'notes.txt'),
    ];
    const before = await Promise.all(authored.map((path) => identity(join(destination, path))));
    const tree = await directoryTree(destination);

    await exportTo(await holding(storedSpace(B_EDITED)), destination);

    await expect(
      Promise.all(authored.map((path) => identity(join(destination, path)))),
    ).resolves.toEqual(before);
    const after = await directoryTree(destination);
    for (const path of authored.slice(1)) expect(after[path]).toEqual(tree[path]);
  });

  /*
   * The check that the files would read back as the aggregate runs over the
   * bytes in memory, so a refusal reaches no file at all.
   */
  it('writes nothing when the files would not read back as a valid aggregate', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    await exportTo(await holding(storedSpace()), destination);
    const tree = await directoryTree(destination);
    const repository = await holding(storedSpace(B_EDITED));
    const orphan = uuidSchema.parse('c0000000-0000-4000-8000-0000000000aa');
    repository.loadAggregate = () =>
      Promise.resolve({
        kind: 'loaded',
        aggregate: {
          metaSpaceId: SPACE_ID,
          spaces: [
            storedSpace(B_EDITED),
            {
              snapshot: { id: orphan, document: { version: 1, title: 'Orphan' }, resources: [] },
              revision: 0n,
              exportedRevision: null,
            },
          ],
        },
      });

    await expect(exportAggregate(repository, destination)).resolves.toMatchObject({
      kind: 'would-not-read-back',
    });

    expect(await directoryTree(destination)).toEqual(tree);
    await expect(readdir(destination)).resolves.not.toContain(orphan);
  });

  /*
   * A Space directory the aggregate no longer holds is removed, but a link
   * inside it leads outside the destination. Removing through it would delete
   * the author's files elsewhere, so Export refuses before writing anything.
   */
  it('refuses to remove files through a linked resources directory', async () => {
    const parent = await makeTemporaryDirectory();
    const destination = join(parent, 'exported');
    await exportTo(await holding(storedSpace()), destination);
    const removed = join(destination, 'c0000000-0000-4000-8000-0000000000bb');
    await mkdir(removed);
    await writeFile(join(removed, 'space.json'), '{}\n');
    const outside = join(parent, 'outside');
    await mkdir(outside);
    await writeFile(join(outside, 'kept.md'), "# Not InfinityCube's\n");
    await symlink(outside, join(removed, 'resources'));
    const tree = await directoryTree(destination);

    await expect(
      exportAggregate(await holding(storedSpace(B_EDITED)), destination),
    ).rejects.toThrow(/symbolic link/);

    await expect(readFile(join(outside, 'kept.md'), 'utf8')).resolves.toBe(
      "# Not InfinityCube's\n",
    );
    expect(await directoryTree(destination)).toEqual(tree);
  });

  it('refuses to remove assets through a linked assets directory', async () => {
    const parent = await makeTemporaryDirectory();
    const destination = join(parent, 'exported');
    await exportTo(await holding(storedSpace()), destination);
    const outside = join(parent, 'outside');
    // The texts' own `assets/` moves outside, and a link to it takes its place.
    await rename(join(destination, 'assets'), outside);
    await writeFile(join(outside, 'picture.png'), "not infinity-cube's\n");
    await symlink(outside, join(destination, 'assets'));

    await expect(exportAggregate(await holding(storedSpace()), destination)).rejects.toThrow(
      /symbolic link/,
    );

    await expect(readFile(join(outside, 'picture.png'), 'utf8')).resolves.toBe(
      "not infinity-cube's\n",
    );
  });

  /*
   * The temporary file a replacement is written through must be new. A link
   * already sitting at a temporary name is never written through.
   */
  it('never writes through a link left where a temporary file would go', async () => {
    const parent = await makeTemporaryDirectory();
    const destination = join(parent, 'exported');
    await exportTo(await holding(storedSpace()), destination);
    const outside = join(parent, 'outside.txt');
    await writeFile(outside, 'outside\n');
    await symlink(outside, join(destination, '.aggregate.json.export-write'));
    await writeFile(join(destination, 'aggregate.json'), '{}\n');

    await exportTo(await holding(storedSpace()), destination);

    await expect(readFile(outside, 'utf8')).resolves.toBe('outside\n');
    await expect(readFile(join(destination, 'aggregate.json'), 'utf8')).resolves.toContain(
      SPACE_ID,
    );
  });

  /*
   * A write that fails part-way reports the failure and records nothing. The
   * file it could not replace keeps its previous bytes whole, and no temporary
   * file is left where Import would read it. Git restores the rest.
   */
  it.skipIf(process.getuid?.() === 0)(
    'reports a write that fails part-way, leaving the file it could not replace whole',
    async () => {
      const destination = join(await makeTemporaryDirectory(), 'exported');
      await exportTo(await holding(storedSpace()), destination);
      const previous = await readFile(resourceFile(destination, RESOURCE_B), 'utf8');
      await chmod(join(destination, SPACE_ID, 'resources'), 0o555);
      const repository = await holding(storedSpace(B_EDITED));

      await expect(exportAggregate(repository, destination)).rejects.toMatchObject({
        code: 'EACCES',
      });

      await expect(readFile(resourceFile(destination, RESOURCE_B), 'utf8')).resolves.toBe(previous);
      expect((await readdir(join(destination, SPACE_ID, 'resources'))).sort()).toEqual(
        [`${RESOURCE_A}.json`, `${RESOURCE_B}.json`].sort(),
      );
      await expect(repository.loadSpace(SPACE_ID)).resolves.toMatchObject({
        exportedRevision: null,
      });
    },
  );
});
