import { describe, expect, it } from 'vitest';
import {
  loadSpace,
  loadSpaceSnapshot,
  locateSnapshotIssue,
  type LoadSpaceSnapshotResult,
} from '../src/index';
import { uuid } from './resource-files';
import { textRef } from './text-asset';

/*
 * Where intake says a refusal is (ADR 0156): the file, relative to the Space
 * directory, the id of the entity holding the fault, and the field. The
 * expected locations are written from the corpus README's rules, not read off
 * the implementation.
 */

const SPACE_ID = uuid('00000000-0000-4000-8000-000000000001');
const RESOURCE_A = uuid('00000000-0000-4000-8000-000000000002');
const RESOURCE_B = uuid('00000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuid('00000000-0000-4000-8000-000000000004');
const MISSING = uuid('00000000-0000-4000-8000-000000000009');
const MAP_ID = uuid('00000000-0000-4000-8000-000000000022');

// Test input is plain JSON intake is about to refuse, so every builder below
// keeps the type it infers rather than claiming a domain type.
const baseMap = {
  id: MAP_ID,
  title: 'Working',
  kind: 'positioned',
  positions: { [RESOURCE_A]: { x: 0, y: 0 }, [RESOURCE_B]: { x: 320, y: 0 } },
  graphs: [{ id: GRAPH_ID, title: 'Main', edges: [{ from: RESOURCE_A, to: RESOURCE_B }] }],
};

const baseDocument = { version: 1, title: 'Located', defaultMap: MAP_ID, maps: [baseMap] };

const markdown = (id: string, title: string) => ({
  id,
  document: { title, kind: 'markdown', content: { url: textRef(title) } },
});

const snapshot = <D, R>(edit: (document: typeof baseDocument) => D, resources: readonly R[]) => ({
  id: SPACE_ID,
  document: edit(baseDocument),
  resources,
});

const unedited = <D>(document: D): D => document;

/** A Resource as a snapshot carries it, with whatever content intake is about to judge. */
interface ResourceInput {
  readonly id: string;
  readonly document: { readonly title: string; readonly kind: string; readonly content: object };
}
const twoMarkdown = [markdown(RESOURCE_A, 'A'), markdown(RESOURCE_B, 'B')];

const errorsOf = (result: LoadSpaceSnapshotResult) => {
  if (result.ok) throw new Error('expected a refusal');
  return result.errors.map(({ kind, at }) => ({ kind, at }));
};

const withMap =
  <M>(edit: (subject: typeof baseMap) => M) =>
  (document: typeof baseDocument) => ({ ...document, maps: [edit(baseMap)] });

/** `snapshot` with its document edited and the two Markdown Resources, refused, as located errors. */
const refusedDocument = (edit: (document: typeof baseDocument) => object) =>
  errorsOf(loadSpaceSnapshot(snapshot(edit, twoMarkdown)));

/** `snapshot` with its document as it is and these Resources, refused, as located errors. */
const refusedResources = (resources: readonly ResourceInput[]) =>
  errorsOf(loadSpaceSnapshot(snapshot(unedited, resources)));

describe('intake locates each refusal', () => {
  it('locates a shape fault in space.json by its Zod path', () => {
    expect(refusedDocument((d) => ({ ...d, title: 7 }))).toEqual([
      { kind: 'invalid-shape', at: { file: 'space.json', field: 'title' } },
    ]);
  });

  it('locates a shape fault in a Resource by its file and its path inside it', () => {
    expect(
      refusedResources([
        { id: RESOURCE_A, document: { title: 'A', kind: 'markdown', content: { url: 7 } } },
        markdown(RESOURCE_B, 'B'),
      ]),
    ).toEqual([
      { kind: 'invalid-shape', at: { file: `resources/${RESOURCE_A}.json`, field: 'content.url' } },
    ]);
  });

  it('locates an unsupported version and a retired space-level graphs array', () => {
    expect(refusedDocument((d) => ({ ...d, version: 2 }))).toEqual([
      { kind: 'unsupported-version', at: { file: 'space.json', field: 'version' } },
    ]);
    expect(refusedDocument((d) => ({ ...d, graphs: [] }))).toEqual([
      { kind: 'retired-space-graphs', at: { file: 'space.json', field: 'graphs' } },
    ]);
  });

  it('locates an Edge by its Graph id, its endpoints and the endpoint field', () => {
    expect(
      refusedDocument(
        withMap((subject) => ({
          ...subject,
          graphs: [{ id: GRAPH_ID, title: 'Main', edges: [{ from: RESOURCE_A, to: MISSING }] }],
        })),
      ),
    ).toEqual([
      {
        kind: 'graph-edge-missing-resource',
        at: {
          file: 'space.json',
          id: GRAPH_ID,
          edge: { from: RESOURCE_A, to: MISSING },
          field: 'to',
        },
      },
    ]);
  });

  it('locates a repeated Edge by its Graph id and endpoints', () => {
    const edge = { from: RESOURCE_A, to: RESOURCE_B };
    expect(
      refusedDocument(
        withMap((subject) => ({
          ...subject,
          graphs: [{ id: GRAPH_ID, title: 'Main', edges: [edge, edge] }],
        })),
      ),
    ).toEqual([{ kind: 'duplicate-graph-edge', at: { file: 'space.json', id: GRAPH_ID, edge } }]);
  });

  it('locates a Map fault by the Map id and the field naming the Resource', () => {
    expect(
      refusedDocument(
        withMap((subject) => ({
          ...subject,
          positions: { ...subject.positions, [MISSING]: { x: 0, y: 0 } },
        })),
      ),
    ).toEqual([
      {
        kind: 'map-member-missing-resource',
        at: { file: 'space.json', id: MAP_ID, field: `positions.${MISSING}` },
      },
    ]);
    expect(
      refusedDocument(
        withMap((subject) => ({
          ...subject,
          positions: {
            ...subject.positions,
            [RESOURCE_A]: { x: 0, y: 0, content: { open: 'yes' } },
          },
        })),
      ),
    ).toEqual([
      {
        kind: 'map-content-invalid',
        at: { file: 'space.json', id: MAP_ID, field: `positions.${RESOURCE_A}.content` },
      },
    ]);
    expect(refusedDocument(withMap((subject) => ({ ...subject, activeGraph: MISSING })))).toEqual([
      {
        kind: 'map-active-graph-missing',
        at: { file: 'space.json', id: MAP_ID, field: 'activeGraph' },
      },
    ]);
  });

  it('locates an unresolved defaultMap on the Space', () => {
    expect(refusedDocument((d) => ({ ...d, defaultMap: MISSING }))).toEqual([
      {
        kind: 'unresolved-default-map',
        at: { file: 'space.json', id: SPACE_ID, field: 'defaultMap' },
      },
    ]);
  });

  it('locates a Resource reference fault in the Resource file declaring it', () => {
    expect(
      refusedResources([
        {
          id: RESOURCE_A,
          document: { title: 'A', kind: 'reference', content: { target: MISSING } },
        },
        markdown(RESOURCE_B, 'B'),
      ]),
    ).toEqual([
      {
        kind: 'reference-target-missing',
        at: { file: `resources/${RESOURCE_A}.json`, id: RESOURCE_A },
      },
    ]);
  });

  it('locates a repeated Resource id at the Resource file Export writes for it', () => {
    expect(
      refusedResources([
        markdown(RESOURCE_A, 'A'),
        markdown(RESOURCE_A, 'A'),
        markdown(RESOURCE_B, 'B'),
      ]),
    ).toEqual([
      {
        kind: 'duplicate-resource-id',
        at: { file: `resources/${RESOURCE_A}.json`, id: RESOURCE_A },
      },
    ]);
  });

  it('locates a Resource file fault in loadSpace at the file it was given', () => {
    const result = loadSpace({ version: 1, id: SPACE_ID, title: 'Files' }, [
      { path: 'resources/a.json', text: '{"id": 1, "title": "A", "kind": "ur", "content": {}}' },
    ]);
    if (result.ok) throw new Error('expected a refusal');
    expect(result.errors.map(({ kind, at }) => ({ kind, at }))).toEqual([
      { kind: 'invalid-resource-file', at: { file: 'resources/a.json', field: 'id' } },
    ]);
  });

  it('locates a repeated Resource id in loadSpace at the file Export writes, whatever its files are named', () => {
    const file = (name: string, id: string) => ({
      path: `/spaces/demo/resources/${name}.json`,
      text: JSON.stringify({ id, title: name, kind: 'ur', content: {} }),
    });
    const result = loadSpace({ version: 1, id: SPACE_ID, title: 'Files' }, [
      file('first', RESOURCE_A),
      file('second', RESOURCE_A),
    ]);
    if (result.ok) throw new Error('expected a refusal');
    expect(result.errors.map(({ kind, at }) => ({ kind, at }))).toEqual([
      {
        kind: 'duplicate-resource-id',
        at: { file: `resources/${RESOURCE_A}.json`, id: RESOURCE_A },
      },
    ]);
  });

  it("locates a fault in the snapshot's resources themselves at the resources directory", () => {
    const input = { id: SPACE_ID, document: baseDocument };
    expect(locateSnapshotIssue(input, ['resources'])).toEqual({ file: 'resources' });
    expect(errorsOf(loadSpaceSnapshot(input))).toEqual([
      { kind: 'invalid-shape', at: { file: 'resources' } },
    ]);
    expect(errorsOf(loadSpaceSnapshot({ ...input, resources: {} }))).toEqual([
      { kind: 'invalid-shape', at: { file: 'resources' } },
    ]);
  });

  it('names the file a snapshot path falls in', () => {
    const input = snapshot(unedited, twoMarkdown);
    expect(locateSnapshotIssue(input, [])).toEqual({ file: 'space.json' });
    expect(locateSnapshotIssue(input, ['id'])).toEqual({ file: 'space.json', field: 'id' });
    expect(locateSnapshotIssue(input, ['document', 'maps', 0, 'title'])).toEqual({
      file: 'space.json',
      field: 'maps.0.title',
    });
    expect(locateSnapshotIssue(input, ['resources', 1, 'document', 'title'])).toEqual({
      file: `resources/${RESOURCE_B}.json`,
      field: 'title',
    });
    expect(locateSnapshotIssue(input, ['resources', 1, 'id'])).toEqual({
      file: `resources/${RESOURCE_B}.json`,
      field: 'id',
    });
    expect(locateSnapshotIssue(input, ['resources', 5])).toEqual({ file: 'resources/[5].json' });
  });
});
