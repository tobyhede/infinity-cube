import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EMPTY_ASSET_REF,
  isMissingKindId,
  newUuid,
  uuidSchema,
  type MissingKind,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import { assetPath, type LoadedSpace, type StoredAsset } from '@project/persistence';
import { MemorySpaceRepository } from '@project/aggregate';
import { afterEach, describe, expect, it } from 'vitest';
import { exportAggregate } from '../../src/export/export-aggregate';
import { importAggregate } from '../../src/import/import-aggregate';
import { admitted } from '../support/stored-assets';

/**
 * ADR 0142: a stored Resource whose kind names no plugin in this build is the
 * same Resource as any other. Import, the store and Export carry it whole
 * without reading its content or Map content, the assets it references travel
 * by the walk, and a rename and a Delete are ordinary Edits.
 */

const META = uuidSchema.parse('11111111-1111-4111-8111-111111111111');
const HELD = uuidSchema.parse('22222222-2222-4222-8222-222222222222');
const MAP = uuidSchema.parse('33333333-3333-4333-8333-333333333333');
const GRAPH = uuidSchema.parse('44444444-4444-4444-8444-444444444444');
const NOTE = uuidSchema.parse('55555555-5555-4555-8555-555555555555');
const UNPLUGGED = uuidSchema.parse('66666666-6666-4666-8666-666666666666');
const SHARING = uuidSchema.parse('77777777-7777-4777-8777-777777777777');
const HELD_NOTE = uuidSchema.parse('88888888-8888-4888-8888-888888888888');
const SECOND_UNPLUGGED = uuidSchema.parse('99999999-9999-4999-8999-999999999999');

/** A kind id no plugin in this build draws. */
const missing = (kind: string): MissingKind => {
  if (!isMissingKindId(kind)) throw new Error(`${kind} is not a missing kind`);
  return kind;
};

const KIND = missing('vnd.example.diagram');
/** Map content its plugin would read, which no host here does. */
const MAP_CONTENT = { zoom: 2, layers: ['ink', { id: 7, hidden: true }] };

/** Bytes that are not valid UTF-8, so a text decode anywhere on the way would change them. */
const binary = Uint8Array.from([0xff, 0xfe, 0x00, 0xc3, 0x28, 0xa0, 0xa1]);

const temporaryDirectories: string[] = [];

const makeDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'infinity-cube-missing-plugin-'));
  temporaryDirectories.push(directory);
  return join(directory, 'aggregate');
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((d) => rm(d, { recursive: true })));
});

interface Assets {
  readonly own: StoredAsset;
  readonly shared: StoredAsset;
}

const assets = async (): Promise<Assets> => ({
  own: await admitted(Uint8Array.from(binary), 'application/pdf'),
  shared: await admitted(new TextEncoder().encode('# Shared\n'), 'text/markdown'),
});

/** Meta: a Markdown note, a Resource of a missing kind, and a Markdown Resource sharing its asset. */
const meta = (
  { own, shared }: Assets,
  extra: readonly SpaceSnapshot['resources'][number][] = [],
): SpaceSnapshot =>
  ({
    id: META,
    document: {
      version: 1,
      title: 'Talk',
      maps: [
        {
          id: MAP,
          title: 'Map 1',
          kind: 'positioned',
          positions: {
            [NOTE]: { x: 0, y: 0 },
            [UNPLUGGED]: { x: 400, y: 0, content: MAP_CONTENT, size: { width: 320, height: 200 } },
            [SHARING]: { x: 800, y: 0 },
          },
          graphs: [{ id: GRAPH, title: 'Graph 1', edges: [{ from: NOTE, to: UNPLUGGED }] }],
        },
      ],
      defaultMap: MAP,
    },
    resources: [
      {
        id: NOTE,
        document: { title: 'Note', kind: 'markdown', content: { url: EMPTY_ASSET_REF } },
      },
      {
        id: UNPLUGGED,
        document: {
          title: 'Diagram',
          kind: KIND,
          content: {
            source: assetPath(own.hash),
            legend: assetPath(shared.hash),
            options: { direction: 'TD', nodes: [1, 2, 3] },
          },
        },
      },
      {
        id: SHARING,
        document: { title: 'Shared', kind: 'markdown', content: { url: assetPath(shared.hash) } },
      },
      ...extra,
    ],
  }) satisfies SpaceSnapshot;

const loaded = (snapshot: SpaceSnapshot): LoadedSpace => ({
  snapshot,
  revision: 0n,
  exportedRevision: null,
});

const holding = async (snapshots: readonly SpaceSnapshot[], stored: Assets) => {
  const repository = new MemorySpaceRepository(snapshots.map(loaded), META);
  await repository.storeAsset(stored.own);
  await repository.storeAsset(stored.shared);
  return repository;
};

const exportTo = async (repository: MemorySpaceRepository, destination: string) => {
  const result = await exportAggregate(repository, destination);
  if (result.kind !== 'exported') throw new Error(`Export answered ${result.kind}`);
};

const importFrom = async (source: string): Promise<MemorySpaceRepository> => {
  const target = new MemorySpaceRepository();
  const result = await importAggregate(source, target, { replace: false, newId: newUuid });
  if (result.kind !== 'imported') {
    throw new Error(
      result.kind === 'aggregate-refused'
        ? result.errors.map(({ kind }) => kind).join(', ')
        : `Import answered ${result.kind}`,
    );
  }
  return target;
};

const metaOf = async (repository: MemorySpaceRepository): Promise<LoadedSpace> => {
  const space = await repository.loadSpace(META);
  if (space === undefined) throw new Error('No Meta Space');
  return space;
};

/** Commit `change` to Meta's snapshot as an ordinary Edit would. */
const editMeta = async (
  repository: MemorySpaceRepository,
  change: (snapshot: SpaceSnapshot) => SpaceSnapshot,
) => {
  const current = await metaOf(repository);
  return repository.commit({
    changes: [
      {
        kind: 'update',
        spaceId: META,
        snapshot: change(current.snapshot),
        expectedRevision: current.revision,
      },
    ],
  });
};

const renamed = (id: UUID, title: string) => (snapshot: SpaceSnapshot) => ({
  ...snapshot,
  resources: snapshot.resources.map((resource) =>
    resource.id === id ? { ...resource, document: { ...resource.document, title } } : resource,
  ),
});

const deleted = (id: UUID) => (snapshot: SpaceSnapshot) => ({
  ...snapshot,
  document: {
    ...snapshot.document,
    maps: (snapshot.document.maps ?? []).map((map) => ({
      ...map,
      positions: Object.fromEntries(Object.entries(map.positions).filter(([key]) => key !== id)),
      graphs: map.graphs.map((graph) => ({
        ...graph,
        edges: graph.edges.filter(({ from, to }) => from !== id && to !== id),
      })),
    })),
  },
  resources: snapshot.resources.filter((resource) => resource.id !== id),
});

const assetFiles = async (directory: string): Promise<readonly string[]> =>
  (await readdir(join(directory, 'assets'))).toSorted();

const resourceFile = (directory: string, id: UUID) =>
  readFile(join(directory, META, 'resources', `${id}.json`));

describe('a Resource whose plugin is missing', () => {
  it('imports, and its file, assets and Map content come back as they were written', async () => {
    const stored = await assets();
    const first = await makeDirectory();
    await exportTo(await holding([meta(stored)], stored), first);

    const imported = await importFrom(first);
    const space = await metaOf(imported);
    expect(space.snapshot).toEqual(meta(stored));
    const own = await imported.loadAsset(stored.own.hash);
    expect(own?.mediaType).toBe('application/pdf');
    expect(own?.bytes).toEqual(stored.own.bytes);
  });

  it('keeps its Resource file and assets byte-identical while another Resource is edited', async () => {
    const stored = await assets();
    const directory = await makeDirectory();
    await exportTo(await holding([meta(stored)], stored), directory);
    const fileBefore = await resourceFile(directory, UNPLUGGED);
    const namesBefore = await assetFiles(directory);
    const bytesBefore = await Promise.all(
      namesBefore.map((name) => readFile(join(directory, 'assets', name))),
    );

    const running = await importFrom(directory);
    expect((await editMeta(running, renamed(NOTE, 'Edited note'))).kind).toBe('committed');
    await exportTo(running, directory);

    expect(await resourceFile(directory, UNPLUGGED)).toEqual(fileBefore);
    expect(await assetFiles(directory)).toEqual(namesBefore);
    expect(
      await Promise.all(namesBefore.map((name) => readFile(join(directory, 'assets', name)))),
    ).toEqual(bytesBefore);
    const reread = await metaOf(await importFrom(directory));
    expect(reread.snapshot.document.maps?.[0]?.positions[UNPLUGGED]?.content).toEqual(MAP_CONTENT);
    expect(reread.snapshot.resources.find(({ id }) => id === NOTE)?.document.title).toBe(
      'Edited note',
    );
  });

  it('renames as an ordinary Edit, its content unchanged and its assets byte-identical', async () => {
    const stored = await assets();
    const directory = await makeDirectory();
    await exportTo(await holding([meta(stored)], stored), directory);

    const running = await importFrom(directory);
    expect((await editMeta(running, renamed(UNPLUGGED, 'Flow'))).kind).toBe('committed');
    await exportTo(running, directory);
    const reread = await importFrom(directory);

    const resource = (await metaOf(reread)).snapshot.resources.find(({ id }) => id === UNPLUGGED);
    expect(resource?.document).toEqual({ ...meta(stored).resources[1]?.document, title: 'Flow' });
    expect((await reread.loadAsset(stored.own.hash))?.bytes).toEqual(stored.own.bytes);
  });

  it('deletes as an ordinary Edit, leaving no asset only it referenced and keeping a shared one', async () => {
    const stored = await assets();
    const directory = await makeDirectory();
    await exportTo(await holding([meta(stored)], stored), directory);
    const ownFile = (await assetFiles(directory)).find((name) => name.startsWith(stored.own.hash));
    expect(ownFile).toBeDefined();

    const running = await importFrom(directory);
    expect((await editMeta(running, deleted(UNPLUGGED))).kind).toBe('committed');
    await exportTo(running, directory);
    const reread = await importFrom(directory);

    const ids = (await metaOf(reread)).snapshot.resources.map(({ id }) => id);
    expect(ids).toEqual([NOTE, SHARING]);
    const names = await assetFiles(directory);
    expect(names.some((name) => name.startsWith(stored.own.hash))).toBe(false);
    expect(names.some((name) => name.startsWith(stored.shared.hash))).toBe(true);
    // The store never deletes an asset (ADR 0106): only the directory leaves it out.
    expect((await running.loadAsset(stored.own.hash))?.bytes).toEqual(stored.own.bytes);
  });
});

/**
 * While any plugin is missing, a Space nothing else refers to is held, since
 * the Resource with no plugin may be what refers to it (ADR 0142). Deleting
 * the last such Resource leaves nothing to hold it, so the Edit is refused
 * naming that Space; with another still missing it is accepted, and the
 * aggregate is refused naming the Space once none is missing.
 */
describe('a Space only a Resource with no plugin may hold', () => {
  const held = (): SpaceSnapshot => ({
    id: HELD,
    document: { version: 1, title: 'Held' },
    resources: [
      {
        id: HELD_NOTE,
        document: { title: 'Inside', kind: 'markdown', content: { url: EMPTY_ASSET_REF } },
      },
    ],
  });

  it('is held through an Export and an Import', async () => {
    const stored = await assets();
    const directory = await makeDirectory();
    await exportTo(await holding([meta(stored), held()], stored), directory);

    const imported = await importFrom(directory);
    expect((await imported.loadSpace(HELD))?.snapshot).toEqual(held());
  });

  it('refuses deleting the last Resource with no plugin, naming the Space it leaves unrooted', async () => {
    const stored = await assets();
    const repository = await holding([meta(stored), held()], stored);

    expect(await editMeta(repository, deleted(UNPLUGGED))).toEqual({
      kind: 'aggregate-refused',
      errors: [{ kind: 'ordinary-space-unreferenced', spaceId: HELD }],
    });
  });

  it('accepts the deletion while another is missing, and refuses the Space once none is', async () => {
    const stored = await assets();
    const second = {
      id: SECOND_UNPLUGGED,
      document: { title: 'Other', kind: missing('vnd.example.chart'), content: {} },
    };
    const repository = await holding([meta(stored, [second]), held()], stored);

    expect((await editMeta(repository, deleted(UNPLUGGED))).kind).toBe('committed');
    expect(await editMeta(repository, deleted(SECOND_UNPLUGGED))).toEqual({
      kind: 'aggregate-refused',
      errors: [{ kind: 'ordinary-space-unreferenced', spaceId: HELD }],
    });
  });
});
