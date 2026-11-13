import { describe, expect, it } from 'vitest';
import { isMissingKindId, uuidSchema, type MissingKind, type SpaceSnapshot } from '@project/core';
import { loadSpaceSnapshot, SnapshotEdit } from '../src/index';

/**
 * A Resource whose plugin is missing may not become a Target (issue 09): no
 * one here can say whether its plugin lets it be one, and a Reference created
 * now would make the aggregate refused the day a plugin that says no returns.
 * A Reference that already names one is carried, as everything else about the
 * Resource is.
 */

const SPACE = uuidSchema.parse('d0000000-0000-4000-8000-000000000001');
const MAP = uuidSchema.parse('d0000000-0000-4000-8000-000000000002');
const GRAPH = uuidSchema.parse('d0000000-0000-4000-8000-000000000003');
const UNPLUGGED = uuidSchema.parse('d0000000-0000-4000-8000-000000000010');
const REFERENCE = uuidSchema.parse('d0000000-0000-4000-8000-000000000011');

const missing = (kind: string): MissingKind => {
  if (!isMissingKindId(kind)) throw new Error(`${kind} is not a missing kind`);
  return kind;
};

const space = (resources: SpaceSnapshot['resources']): SpaceSnapshot => ({
  id: SPACE,
  document: {
    version: 1,
    title: 'Space',
    defaultMap: MAP,
    maps: [
      {
        id: MAP,
        title: 'Map',
        kind: 'positioned',
        positions: { [UNPLUGGED]: { x: 0, y: 0 } },
        graphs: [{ id: GRAPH, title: 'Graph', edges: [] }],
      },
    ],
  },
  resources,
});

const unplugged = {
  id: UNPLUGGED,
  document: { title: 'Chart', kind: missing('vnd.example.chart'), content: { nodes: 3 } },
};
const reference = {
  id: REFERENCE,
  document: { title: 'Chart again', kind: 'reference' as const, content: { target: UNPLUGGED } },
};

describe('a Resource whose plugin is missing, as a Target', () => {
  it('may not become one: creating a Reference to it is refused', () => {
    expect(
      SnapshotEdit.createInMap(
        space([unplugged]),
        MAP,
        REFERENCE,
        reference.document,
        { x: 400, y: 0 },
        'exact',
      ),
    ).toEqual({
      kind: 'refused',
      refusal: { code: 'reference-target-not-targetable', targetId: UNPLUGGED },
    });
  });

  it('keeps a Reference that already names it: intake carries it', () => {
    const result = loadSpaceSnapshot(space([unplugged, reference]));
    expect(result.ok).toBe(true);
  });
});
