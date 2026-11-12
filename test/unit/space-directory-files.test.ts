import {
  EMPTY_ASSET_REF,
  isMissingKindId,
  uuidSchema,
  type JsonValue,
  type SpaceSnapshot,
} from '@project/core';
import { describe, expect, it } from 'vitest';
import { spaceDirectoryFiles } from '../../src/aggregate-directory/write-space-directory';

const SPACE_ID = uuidSchema.parse('50000000-0000-4000-8000-000000000001');
const TARGET_ID = uuidSchema.parse('50000000-0000-4000-8000-000000000002');
const MAP_ID = uuidSchema.parse('50000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuidSchema.parse('50000000-0000-4000-8000-000000000004');
const EMBED_ID = uuidSchema.parse('50000000-0000-4000-8000-000000000005');
const PICTURE_ID = uuidSchema.parse('50000000-0000-4000-8000-000000000006');

const space = (resources: SpaceSnapshot['resources']): SpaceSnapshot => ({
  id: SPACE_ID,
  document: { version: 1, title: 'Talk' },
  resources,
});

const resourceFile = (snapshot: SpaceSnapshot, id: string): string | undefined =>
  spaceDirectoryFiles({ snapshot, revision: 0n, exportedRevision: null }).get(
    `resources/${id}.json`,
  );

/**
 * A stored document's keys can arrive in any order (`jsonb` reorders them on
 * write), and Export writes a Resource's content whole, so the order a file's
 * keys are written in has to come from somewhere other than the document.
 */
describe("a Resource file's keys", () => {
  it('are written in one order however a Space and Image Resource were stored', () => {
    const ordered = space([
      {
        id: EMBED_ID,
        document: {
          title: 'Embed',
          kind: 'space',
          content: {
            spaceId: TARGET_ID,
            map: MAP_ID,
            graph: GRAPH_ID,
            framing: { centreX: 1, centreY: 2, zoom: 0.5 },
          },
        },
      },
      {
        id: PICTURE_ID,
        document: {
          title: 'Picture',
          kind: 'image',
          content: { url: 'https://example.com/a.png', naturalSize: { width: 4, height: 3 } },
        },
      },
    ]);
    const shuffled = space([
      {
        id: PICTURE_ID,
        document: {
          content: { naturalSize: { height: 3, width: 4 }, url: 'https://example.com/a.png' },
          kind: 'image',
          title: 'Picture',
        },
      },
      {
        id: EMBED_ID,
        document: {
          content: {
            framing: { zoom: 0.5, centreY: 2, centreX: 1 },
            graph: GRAPH_ID,
            map: MAP_ID,
            spaceId: TARGET_ID,
          },
          kind: 'space',
          title: 'Embed',
        },
      },
    ]);

    expect(resourceFile(ordered, EMBED_ID)).toBe(
      [
        '{',
        `  "id": "${EMBED_ID}",`,
        '  "title": "Embed",',
        '  "kind": "space",',
        '  "content": {',
        `    "spaceId": "${TARGET_ID}",`,
        `    "map": "${MAP_ID}",`,
        `    "graph": "${GRAPH_ID}",`,
        '    "framing": {',
        '      "centreX": 1,',
        '      "centreY": 2,',
        '      "zoom": 0.5',
        '    }',
        '  }',
        '}',
        '',
      ].join('\n'),
    );
    for (const id of [EMBED_ID, PICTURE_ID]) {
      expect(resourceFile(ordered, id), id).toBeDefined();
      expect(resourceFile(shuffled, id), id).toBe(resourceFile(ordered, id));
    }
  });
});

/*
 * Export writes every Map entry's content in one canonical form, whether its
 * Resource's plugin is present or missing (ADR 0142), since `jsonb` hands keys
 * back in an order of its own. Every present plugin's Map content schema in
 * this build declares one key at most, so the Markdown entry below holds
 * content its schema would refuse: Export does not parse Map content, and
 * only content of more than one key can show that it is sorted.
 */
describe("a Map entry's content", () => {
  const NOTE_ID = uuidSchema.parse('50000000-0000-4000-8000-000000000007');
  const UNPLUGGED_ID = uuidSchema.parse('50000000-0000-4000-8000-000000000008');
  const kind = 'vnd.example.diagram';
  if (!isMissingKindId(kind)) throw new Error(`${kind} is drawn by a plugin in this build`);
  const snapshot: SpaceSnapshot = {
    id: SPACE_ID,
    document: {
      version: 1,
      title: 'Talk',
      defaultMap: MAP_ID,
      maps: [
        {
          id: MAP_ID,
          title: 'Map',
          kind: 'positioned',
          positions: {
            [NOTE_ID]: { x: 0, y: 0, content: { zoom: 2, at: { y: 1, x: 0 } } },
            [UNPLUGGED_ID]: { x: 0, y: 0, content: { zoom: 2, at: { y: 1, x: 0 } } },
          },
          graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [] }],
        },
      ],
    },
    resources: [
      {
        id: NOTE_ID,
        document: { title: 'Note', kind: 'markdown', content: { url: EMPTY_ASSET_REF } },
      },
      { id: UNPLUGGED_ID, document: { title: 'Diagram', kind, content: {} } },
    ],
  };
  const written = (): string | undefined =>
    spaceDirectoryFiles({ snapshot, revision: 0n, exportedRevision: null }).get('space.json');

  it("is sorted whether the Resource's plugin is present or missing", () => {
    expect(written()).toContain(
      [
        `      "positions": {`,
        `        "${NOTE_ID}": {`,
        '          "x": 0,',
        '          "y": 0,',
        '          "content": {',
        '            "at": {',
        '              "x": 0,',
        '              "y": 1',
        '            },',
        '            "zoom": 2',
        '          }',
        '        },',
        `        "${UNPLUGGED_ID}": {`,
        '          "x": 0,',
        '          "y": 0,',
        '          "content": {',
        '            "at": {',
        '              "x": 0,',
        '              "y": 1',
        '            },',
        '            "zoom": 2',
        '          }',
        '        }',
        '      },',
      ].join('\n'),
    );
  });
});

/**
 * A Map entry's content is a plugin's value (ADR 0142), stored as `jsonb`,
 * which hands its keys back in an order of its own.
 */
describe("a Map entry's content, however its store ordered it", () => {
  const withContent = (content: JsonValue): string | undefined =>
    spaceDirectoryFiles({
      snapshot: {
        id: SPACE_ID,
        document: {
          version: 1,
          title: 'Talk',
          maps: [
            {
              id: MAP_ID,
              title: 'Map 1',
              kind: 'positioned',
              positions: { [PICTURE_ID]: { x: 0, y: 0, open: false, content } },
              graphs: [{ id: GRAPH_ID, title: 'Graph 1', edges: [] }],
            },
          ],
        },
        resources: [{ id: PICTURE_ID, document: { title: 'Shape', kind: 'ur', content: {} } }],
      },
      revision: 0n,
      exportedRevision: null,
    }).get('space.json');

  it('is written in one key order, at every depth, however it was stored', () => {
    const ordered = withContent({ a: 1, b: { c: [{ d: 1, e: 2 }], f: null } });
    expect(withContent({ b: { f: null, c: [{ e: 2, d: 1 }] }, a: 1 })).toBe(ordered);
    expect(ordered).toContain('"content": {\n');
  });
});
