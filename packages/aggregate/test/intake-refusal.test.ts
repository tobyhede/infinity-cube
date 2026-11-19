import { spaceSnapshotSchema, uuidSchema } from '@project/core';
import type { SpaceAggregateError, SpaceError } from '@project/graph';
import { describe, expect, it } from 'vitest';
import { locateAggregateRefusal, spaceErrorRefusal } from '../src/intake-refusal';

const META = uuidSchema.parse('10000000-0000-4000-8000-000000000001');
const CHILD = uuidSchema.parse('20000000-0000-4000-8000-000000000002');
const OTHER = uuidSchema.parse('30000000-0000-4000-8000-000000000003');
const RESOURCE = uuidSchema.parse('00000000-0000-4000-8000-000000000101');

const snapshotOf = (id: string) =>
  spaceSnapshotSchema.parse({ id, document: { version: 1, title: 'A Space' }, resources: [] });

const unlocated: SpaceError = { kind: 'invalid-shape', message: 'title: Required' };

describe('spaceErrorRefusal', () => {
  it('moves the location intake made under the Space directory', () => {
    expect(
      spaceErrorRefusal(META, {
        kind: 'map-content-invalid',
        ref: RESOURCE,
        message: 'refused',
        at: { file: 'space.json', id: RESOURCE, field: 'positions.x.content' },
      }),
    ).toEqual({
      kind: 'map-content-invalid',
      file: `${META}/space.json`,
      id: RESOURCE,
      field: 'positions.x.content',
    });
  });

  it('refuses to guess where a refusal carrying no location is', () => {
    expect(() => spaceErrorRefusal(META, unlocated)).toThrow(/invalid-shape.*no location/);
  });
});

describe('locateAggregateRefusal', () => {
  const spaces = [snapshotOf(META), snapshotOf(CHILD), snapshotOf(OTHER)];

  it('locates a Space intake refusal in the directory of the Space it names by index', () => {
    const errors: SpaceAggregateError[] = [
      {
        kind: 'invalid-space-snapshot',
        snapshotIndex: 1,
        errors: [
          { kind: 'invalid-shape', message: 'bad', at: { file: 'space.json', field: 'title' } },
        ],
      },
    ];
    expect(locateAggregateRefusal(errors, spaces)).toEqual([
      { kind: 'invalid-shape', file: `${CHILD}/space.json`, field: 'title' },
    ]);
  });

  it('refuses to invent a directory for an index no Space it was handed has', () => {
    const errors: SpaceAggregateError[] = [
      { kind: 'invalid-space-snapshot', snapshotIndex: 3, errors: [] },
    ];
    expect(() => locateAggregateRefusal(errors, spaces)).toThrow(/index 3/);
  });

  it('locates a Resource id repeated across three Spaces in each Space after the first', () => {
    const errors: SpaceAggregateError[] = [
      { kind: 'duplicate-resource-id', resourceId: RESOURCE, spaceIds: [META, CHILD, OTHER] },
    ];
    expect(locateAggregateRefusal(errors, spaces)).toEqual([
      { kind: 'duplicate-resource-id', file: `${CHILD}/resources/${RESOURCE}.json`, id: RESOURCE },
      { kind: 'duplicate-resource-id', file: `${OTHER}/resources/${RESOURCE}.json`, id: RESOURCE },
    ]);
  });

  it('locates a Space id held twice at its space file', () => {
    expect(
      locateAggregateRefusal(
        [{ kind: 'duplicate-space-id', spaceId: CHILD, snapshotIndexes: [1, 2] }],
        spaces,
      ),
    ).toEqual([{ kind: 'duplicate-space-id', file: `${CHILD}/space.json`, id: CHILD }]);
  });
});
