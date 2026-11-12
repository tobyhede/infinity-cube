import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { uuidSchema, type Resource } from '@project/core';
import { parseResourceFiles, type ResourceFile } from '../src/index';
import type { Json } from './resource-files';
import { textRef } from './text-asset';

/**
 * A Resource file as an author writes it by hand, rather than as
 * `serializeResource` does: keys in any order, any indentation, and the file
 * under any name, since identity is inside the file and never its name (ADR
 * 0128). Intake reads every such file as the same Resource, a Markdown
 * Resource naming its text by the URL of the asset holding it (ADR 0142).
 */

const uuidArb = fc.uuid({ version: 4 }).map((value) => uuidSchema.parse(value));

const titleArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter(
    (title) => title.trim().length > 0 && title === title.trimEnd() && !/[\r\n]/u.test(title),
  );

/** The URL of an asset holding some text (ADR 0142). */
const urlArb = fc.string({ maxLength: 40 }).map(textRef);

/** An object's entries in a drawn order, which JSON keeps. */
const shuffled = (value: Record<string, Json>): fc.Arbitrary<Record<string, Json>> =>
  fc
    .shuffledSubarray(Object.entries(value), { minLength: Object.keys(value).length })
    .map((entries) => Object.fromEntries(entries));

const indentArb = fc.constantFrom(0, 1, 2, 4, '\t');

const fileNameArb = fc.stringMatching(/^[a-z0-9-]{1,12}$/u);

interface Authored {
  readonly files: readonly ResourceFile[];
  readonly resource: Resource;
}

const authoredArb: fc.Arbitrary<Authored> = fc
  .record({
    id: uuidArb,
    title: titleArb,
    url: urlArb,
    indent: indentArb,
    name: fileNameArb,
  })
  .chain(({ id, title, url, indent, name }) =>
    shuffled({ id, title, kind: 'markdown', content: { url } }).map((envelope) => ({
      files: [{ path: `resources/${name}.json`, text: JSON.stringify(envelope, null, indent) }],
      resource: { id, title, kind: 'markdown', content: { url } },
    })),
  );

describe('a hand-written Resource file', () => {
  it('reads as its Resource, naming its text by URL alone', () => {
    fc.assert(
      fc.property(authoredArb, ({ files, resource }) => {
        const result = parseResourceFiles(files);
        expect(result.ok && result.resources.map((decoded) => decoded.resource)).toEqual([
          resource,
        ]);
      }),
    );
  });
});
