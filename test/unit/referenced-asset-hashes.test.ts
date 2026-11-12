import { describe, expect, it } from 'vitest';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { referencedAssetHashes } from '../../src/aggregate-directory';

const SPACE_ID = uuidSchema.parse('a0000000-0000-4000-8000-000000000001');
const MAP_ID = uuidSchema.parse('a0000000-0000-4000-8000-000000000002');
const GRAPH_ID = uuidSchema.parse('a0000000-0000-4000-8000-000000000003');
const UR_ID = uuidSchema.parse('a0000000-0000-4000-8000-000000000004');
const NOTES_ID = uuidSchema.parse('a0000000-0000-4000-8000-000000000005');

const IN_CONTENT = 'A'.repeat(43);
const IN_MAP_CONTENT = `${'A'.repeat(42)}E`;
const NESTED_IN_MAP_CONTENT = `${'A'.repeat(42)}I`;

/**
 * A Space whose Map entries hold content no plugin in this build reads: the
 * walk reads every whole string value whatever declared it (ADR 0142).
 */
const space: SpaceSnapshot = {
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Talk',
    maps: [
      {
        id: MAP_ID,
        title: 'Spine',
        kind: 'positioned',
        positions: {
          [UR_ID]: { x: 0, y: 0, content: { background: `/assets/${IN_MAP_CONTENT}` } },
          [NOTES_ID]: {
            x: 260,
            y: 0,
            content: { layers: [{ src: `/assets/${NESTED_IN_MAP_CONTENT}` }, 'plain'] },
          },
        },
        graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [] }],
      },
    ],
  },
  resources: [
    { id: UR_ID, document: { title: 'Ur', kind: 'ur', content: {} } },
    {
      id: NOTES_ID,
      document: { title: 'Notes', kind: 'markdown', content: { url: `/assets/${IN_CONTENT}` } },
    },
  ],
};

describe('the assets an aggregate references', () => {
  it('are found in Map content as in Resource content, once each, in ordinal order', () => {
    expect(referencedAssetHashes([space, space])).toEqual(
      [IN_CONTENT, IN_MAP_CONTENT, NESTED_IN_MAP_CONTENT].sort(),
    );
  });

  it('are none for a Space with no Map and no reference', () => {
    expect(
      referencedAssetHashes([{ ...space, document: { version: 1, title: 'Bare' }, resources: [] }]),
    ).toEqual([]);
  });
});
