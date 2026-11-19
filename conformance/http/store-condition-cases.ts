import { afterEach, describe, expect, it } from 'vitest';
import { send, type ConformanceHost } from './host';
import { expectApiPolicy, expectProblem, META, renameCommitText } from './wire';
import type { OpenedHost } from './wire-cases';
import { decodeLoadedAggregate, decodeSpaceSummaries } from '@project/persistence';

/**
 * The answers a host gives when its store cannot serve: none yet, an
 * unreachable one, and one whose stored state is broken. A host process over a
 * directory never reaches these, since a run always holds a valid aggregate,
 * so they run only against a host that can be opened over such a store — a
 * `Request -> Response` function composed in process. With the routes in
 * `wire-cases.ts` they reach every status `ProductResponse` names
 * (`packages/http/src/product-destination.ts`).
 *
 * Sources of truth: `resolveProductRequest` (`packages/aggregate/src/space-host.ts`)
 * and `storedFailureProblem` (`packages/http/src/index.ts`), which answer by
 * `classifyStoredFailure` (`packages/persistence/src/repository.ts`).
 */

/**
 * The store a host is opened over. `uninitialized` holds no aggregate yet;
 * `unavailable` fails every read and write as an unreachable database does;
 * `broken-stored-state` fails them as stored state that violates the
 * aggregate's invariants does.
 */
export type StoreCondition = 'uninitialized' | 'unavailable' | 'broken-stored-state';

export interface StoreConditionConformanceOptions {
  readonly name: string;
  readonly open: (condition: StoreCondition) => Promise<OpenedHost>;
}

export const describeStoreConditionConformance = (
  options: StoreConditionConformanceOptions,
): void => {
  describe(`HTTP conformance: a store that cannot serve (${options.name})`, () => {
    const opened: OpenedHost[] = [];
    const open = async (condition: StoreCondition): Promise<ConformanceHost> => {
      const one = await options.open(condition);
      opened.push(one);
      return one.host;
    };
    afterEach(async () => {
      await Promise.all(opened.splice(0).map((one) => one.close()));
    });

    it('answers / with 503 persistence-unavailable while no Meta Space is established', async () => {
      const host = await open('uninitialized');
      await expectProblem(await send(host, '/'), 'persistence-unavailable');
      const aggregate = await send(host, '/api/aggregate');
      expect(aggregate.status).toBe(200);
      expect(decodeLoadedAggregate(await aggregate.json())).toEqual({
        kind: 'uninitialized',
      });
      const spaces = await send(host, '/api/spaces');
      expect(decodeSpaceSummaries(await spaces.json())).toEqual([]);
    });

    it('answers 503 persistence-unavailable for every read and write of an unreachable store', async () => {
      const host = await open('unavailable');
      for (const pathname of ['/', '/api/spaces', '/api/aggregate', `/api/spaces/${META}`]) {
        const response = await send(host, pathname);
        await expectProblem(response, 'persistence-unavailable');
        if (pathname !== '/') expectApiPolicy(response);
      }
      const commit = await send(host, '/api/spaces', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: renameCommitText(
          {
            snapshot: { id: META, document: { version: 1, title: 'Unwritten' }, resources: [] },
            revision: 0n,
            exportedRevision: null,
          },
          'Unwritten',
        ),
      });
      await expectProblem(commit, 'persistence-unavailable');
    });

    it('answers 500 internal-error for broken stored state', async () => {
      const host = await open('broken-stored-state');
      for (const pathname of ['/', '/api/spaces', '/api/aggregate', `/api/spaces/${META}`]) {
        await expectProblem(await send(host, pathname), 'internal-error');
      }
    });
  });
};
