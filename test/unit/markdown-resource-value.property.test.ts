import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  newUuid,
  normalizeTitle,
  uuidSchema,
  type Resource,
  type SpaceSnapshot,
} from '@project/core';
import { lineFeedText } from '@project/resource-api/domain';
import { isAssetHash } from '@project/persistence';
import { parseResourceFiles, serializeResource } from '@project/graph';
import { HttpSpaceBackend } from '@project/http';
import { createSpaceHost, MemorySpaceRepository } from '@project/aggregate';
import { textAssetRef } from '../support/aggregate-directory';
import { admitted } from '../support/stored-assets';

/**
 * A Markdown Resource is one value wherever it is held (ADR 0142): its Resource
 * file, the store and the wire each carry `{ id, title, kind, content: { url } }`
 * and nothing else, and the text its URL names reads back the same through the
 * store and the wire. No path, media type or source rides along in any of them.
 */

const SPACE_ID = uuidSchema.parse('a0000000-0000-4000-8000-000000000001');

const titleArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .map(normalizeTitle)
  .filter((title) => title.length > 0);

/** The text as the plugin stores it: with `\n` line endings. */
const textArb = fc.string({ maxLength: 200 }).map(lineFeedText);

const resourceArb = fc.record({ id: fc.uuid({ version: 4 }), title: titleArb, text: textArb });

/** A Space holding `resources`, each stored as its id and its document. */
const snapshotOf = (resources: readonly Resource[]): SpaceSnapshot => ({
  id: SPACE_ID,
  document: { version: 1, title: 'Talk' },
  resources: resources.map(({ id, ...document }) => ({ id, document })),
});

/** A stored Resource as the Resource it is. */
const resourceOf = ({ id, document }: SpaceSnapshot['resources'][number]): Resource => ({
  id,
  ...document,
});

describe('a Markdown Resource', () => {
  it('is the same value in its file, in the store and on the wire, and so is its text', async () => {
    await fc.assert(
      fc.asyncProperty(resourceArb, async ({ id, title, text }) => {
        const url = textAssetRef(text);
        const resource: Resource = {
          id: uuidSchema.parse(id),
          title,
          kind: 'markdown',
          content: { url },
        };

        // The file: one Resource file and nothing beside it.
        const files = serializeResource(resource);
        expect(files.map(({ path }) => path)).toEqual([`resources/${resource.id}.json`]);
        const decoded = parseResourceFiles(files);
        if (!decoded.ok) throw new Error('The Resource file is read.');
        const fromFile = decoded.resources.map((each) => each.resource);
        expect(fromFile).toEqual([resource]);

        // The store, holding the Resource its file decodes to. The SQL stores
        // hold the same through the repository contract
        // (`test/support/repository-contract.ts`).
        const repository = new MemorySpaceRepository(
          [{ snapshot: snapshotOf(fromFile), revision: 0n, exportedRevision: null }],
          SPACE_ID,
        );
        await repository.storeAsset(
          await admitted(new TextEncoder().encode(text), 'text/markdown'),
        );
        const stored = await repository.loadSpace(SPACE_ID);
        expect(stored?.snapshot.resources.map(resourceOf)).toEqual([resource]);
        const hash = url.slice('/assets/'.length);
        if (!isAssetHash(hash)) throw new Error(`${url} does not name an asset`);
        const storedText = await repository.loadAsset(hash);
        expect(
          storedText === undefined ? undefined : new TextDecoder().decode(storedText.bytes),
        ).toBe(text);

        // The wire, through the Fetch application every host serves.
        const host = createSpaceHost(repository, newUuid);
        const backend = new HttpSpaceBackend('http://infinity-cube.test', {
          fetch: (input, init) => Promise.resolve(host.fetch(new Request(input, init))),
        });
        const served = await backend.loadSpace(SPACE_ID);
        expect(served?.snapshot.resources.map(resourceOf)).toEqual([resource]);
        const read = await backend.readAsset(url);
        expect(read instanceof Blob ? await read.text() : read).toBe(text);
      }),
      { numRuns: 30 },
    );
  });
});
