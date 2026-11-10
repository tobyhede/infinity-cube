import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { normalizeTitle, uuidSchema, type Resource } from '@project/core';
import { parseResourceFiles, serializeResource } from '../src/index';

/**
 * `serializeResource` and `parseResourceFiles` are inverses: every
 * kind's Resource written as its file reads back as the same Resource, a
 * Markdown Resource naming its text by the URL of the asset holding it (ADR
 * 0142) and writing no other file.
 */

const uuidArb = fc.uuid({ version: 4 }).map((value) => uuidSchema.parse(value));

/**
 * A Title as a stored Resource carries it: normalized, non-empty, and drawn
 * from lines that carry more than one line, blank lines, indents, quotes and
 * backslashes, all of which JSON has to escape.
 */
const titleArb = fc
  .array(
    fc.oneof(
      fc.constant(''),
      fc.constant('  an indented line'),
      fc.constant('"quoted" \\ back\\slashed'),
      fc.constant('---'),
      fc.string({ unit: 'binary', maxLength: 20 }),
    ),
    { minLength: 1, maxLength: 4 },
  )
  .map((lines) => normalizeTitle(lines.join('\n')))
  .filter((title) => title.length > 0);

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * The URLs an Image Resource may hold (ADR 0106): a web URL, or the
 * `/assets/<id>` of a stored image, whose last character carries two zero bits.
 */
/** The `/assets/<id>` of a stored asset, whose last character carries two zero bits. */
const assetUrlArb = fc
  .tuple(
    fc.string({ unit: fc.constantFrom(...Array.from(BASE64URL)), minLength: 42, maxLength: 42 }),
    fc.constantFrom(...Array.from('AEIMQUYcgkosw048')),
  )
  .map(([head, last]): `/assets/${string}` => `/assets/${head}${last}`);

const imageUrlArb = fc.oneof(
  fc.webUrl({ validSchemes: ['https', 'http'], withQueryParameters: true, withFragments: true }),
  assetUrlArb,
);

const dimensionArb = fc.double({ min: 1e-6, max: 1e6, noNaN: true });

/** JSON writes `-0` as `0`, and no framing distinguishes the two. */
const finiteArb = fc.double({ min: -1e6, max: 1e6, noNaN: true }).map((value) => value + 0);

const resourceArb: fc.Arbitrary<Resource> = fc.oneof(
  fc.record({
    id: uuidArb,
    title: titleArb,
    kind: fc.constant('markdown' as const),
    content: fc.record({ url: assetUrlArb }),
  }),
  fc.record({
    id: uuidArb,
    title: titleArb,
    kind: fc.constant('reference' as const),
    content: fc.record({ target: uuidArb }),
  }),
  // A Space Resource names a Map of its target and a Graph that Map owns from
  // the moment it exists (ADR 0079), so only its framing is optional.
  fc.record({
    id: uuidArb,
    title: titleArb,
    kind: fc.constant('space' as const),
    content: fc.record(
      {
        spaceId: uuidArb,
        map: uuidArb,
        graph: uuidArb,
        framing: fc.record({ centreX: finiteArb, centreY: finiteArb, zoom: dimensionArb }),
      },
      { requiredKeys: ['spaceId', 'map', 'graph'] },
    ),
  }),
  fc.record({
    id: uuidArb,
    title: titleArb,
    kind: fc.constant('image' as const),
    content: fc.record(
      { url: imageUrlArb, naturalSize: fc.record({ width: dimensionArb, height: dimensionArb }) },
      { requiredKeys: ['url'] },
    ),
  }),
  fc.record({
    id: uuidArb,
    title: titleArb,
    kind: fc.constant('ur' as const),
    content: fc.constant({}),
  }),
);

describe('resource file round-trip', () => {
  it('parses back to the resource it was written from', () => {
    fc.assert(
      fc.property(resourceArb, (resource) => {
        const files = serializeResource(resource);
        expect(parseResourceFiles(files)).toEqual({
          ok: true,
          resources: [{ path: `resources/${resource.id}.json`, resource }],
        });
      }),
      { numRuns: 500 },
    );
  });

  it('writes every Resource as its one Resource file, a Markdown Resource too', () => {
    fc.assert(
      fc.property(resourceArb, (resource) => {
        expect(serializeResource(resource).map(({ path }) => path)).toEqual([
          `resources/${resource.id}.json`,
        ]);
      }),
    );
  });

  it('reads back every Resource of a Space written together', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(resourceArb, { selector: ({ id }) => id, maxLength: 6 }),
        (resources) => {
          const result = parseResourceFiles(resources.flatMap(serializeResource));
          expect(result.ok && result.resources.map(({ resource }) => resource)).toEqual(resources);
        },
      ),
    );
  });
});
