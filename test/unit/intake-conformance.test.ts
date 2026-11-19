import { cp, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { SpaceSnapshot, UUID } from '@project/core';
import {
  INTAKE_REFUSAL_KINDS,
  locateAggregateRefusal,
  MemorySpaceRepository,
  type IntakeRefusal,
} from '@project/aggregate';
import { decodeCommitRequest, SnapshotDecodeError, type SpaceCommit } from '@project/persistence';
import { exportAggregate } from '../../src/export/export-aggregate';
import { importAggregate } from '../../src/import/import-aggregate';
import { checkAggregate } from '../../src/run/run';

/*
 * The intake conformance corpus (ADR 0156), run against the TypeScript intake.
 * `conformance/intake/README.md` is the format and the rules; this runner reads
 * the corpus as that README says any runner must, and answers each case
 * through the doors the product uses: a directory case through the Import
 * `cube check` uses, then Import and Export as a run writes; a commit case
 * through the commit decoder and the memory store's commit, which the HTTP
 * application calls.
 */

const CORPUS = fileURLToPath(new URL('../../conformance/intake', import.meta.url));

const refusalSchema = z
  .object({
    kind: z.enum(INTAKE_REFUSAL_KINDS),
    file: z.string(),
    id: z.string().optional(),
    field: z.string().optional(),
    edge: z.object({ from: z.string(), to: z.string() }).strict().optional(),
  })
  .strict();

const expectSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('accepted') }).strict(),
  z.object({ outcome: z.literal('refused'), refusals: z.array(refusalSchema).min(1) }).strict(),
]);

const directoryCaseSchema = z.object({ description: z.string(), expect: expectSchema }).strict();
const commitCaseSchema = z
  .object({ description: z.string(), base: z.string(), expect: expectSchema })
  .strict();

type Expected = z.infer<typeof expectSchema>;
type Answer =
  | { readonly outcome: 'accepted' }
  | { readonly outcome: 'refused'; readonly refusals: readonly IntakeRefusal[] };

/** A case's `case.json`, parsed by the schema the README describes. */
const readCase = async <T>(path: string, schema: z.ZodType<T>): Promise<T> =>
  schema.parse(JSON.parse(await readFile(join(path, 'case.json'), 'utf8')));

const caseNames = async (kind: 'directory' | 'commit'): Promise<readonly string[]> =>
  (await readdir(join(CORPUS, kind), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map(({ name }) => name)
    .sort();

const directoryCases = await caseNames('directory');
const commitCases = await caseNames('commit');

/** Every case carries every id, so a runner's id generator must never be reached. */
const mintsNothing = (): UUID => {
  throw new Error('A corpus case omits an id, which its runner will not mint');
};

/** A refusal as a case writes it or a runtime answers it. */
interface ComparedRefusal {
  readonly kind: string;
  readonly file: string;
  readonly id?: string | undefined;
  readonly field?: string | undefined;
  readonly edge?: { readonly from: string; readonly to: string } | undefined;
}

/** A refusal as one comparable string: the corpus compares refusals as a multiset. */
const refusalKey = ({ kind, file, id, field, edge }: ComparedRefusal): string =>
  JSON.stringify([kind, file, id ?? null, field ?? null, edge?.from ?? null, edge?.to ?? null]);

/** An answer with its refusals in one order, so two answers compare as multisets. */
const comparable = (answer: Answer | Expected) =>
  answer.outcome === 'accepted'
    ? { outcome: 'accepted' }
    : { outcome: 'refused', refusals: answer.refusals.map(refusalKey).sort() };

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

/** A copy of `source` in a directory of its own, for an Import or Export to work on. */
const copyOf = async (source: string): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'infinity-cube-intake-'));
  temporaryRoots.push(root);
  const directory = join(root, 'aggregate');
  await cp(source, directory, { recursive: true });
  return directory;
};

/** Every file under `directory` by its path relative to it, `/` between segments, with its bytes. */
const treeOf = async (directory: string): Promise<ReadonlyMap<string, string>> => {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
  return new Map(
    await Promise.all(
      files.map(
        async (path) =>
          [
            relative(directory, path).split(sep).join('/'),
            (await readFile(path)).toString('base64'),
          ] as const,
      ),
    ),
  );
};

/** What a directory holds once it has been Imported and Exported in place. */
const exported = async (source: string): Promise<ReadonlyMap<string, string>> => {
  const directory = await copyOf(source);
  const repository = await imported(directory);
  const result = await exportAggregate(repository, directory);
  expect(result.kind).toBe('exported');
  return treeOf(directory);
};

/** A fresh memory store holding the aggregate `directory` holds. */
const imported = async (directory: string): Promise<MemorySpaceRepository> => {
  const repository = new MemorySpaceRepository();
  const result = await importAggregate(directory, repository, {
    replace: false,
    newId: mintsNothing,
  });
  expect(result.kind).toBe('imported');
  return repository;
};

/** The expected Export: `expected` when the case records one, else the case's own files. */
const expectedTree = async (expected: string, otherwise: string) => {
  try {
    return await treeOf(expected);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return treeOf(otherwise);
    }
    throw error;
  }
};

describe('the intake conformance corpus, directory cases', () => {
  it.each(directoryCases)('%s', async (name) => {
    const path = join(CORPUS, 'directory', name);
    const testCase = await readCase(path, directoryCaseSchema);
    const aggregate = join(path, 'aggregate');

    const checked = await checkAggregate(await copyOf(aggregate), mintsNothing);
    if (checked.kind === 'empty') throw new Error(`${name} holds no aggregate`);
    const answer: Answer =
      checked.kind === 'valid'
        ? { outcome: 'accepted' }
        : { outcome: 'refused', refusals: checked.refusals };
    expect(comparable(answer)).toEqual(comparable(testCase.expect));

    if (testCase.expect.outcome === 'accepted') {
      expect(await exported(aggregate)).toEqual(
        await expectedTree(join(path, 'export'), aggregate),
      );
    }
  });
});

/**
 * The Spaces a commit's candidate aggregate holds, ascending by id, as
 * `decideCommit` hands them to intake: an `invalid-space-snapshot` refusal
 * names its Space by position among these.
 */
const candidateSpaces = (
  stored: readonly SpaceSnapshot[],
  commit: SpaceCommit,
): readonly SpaceSnapshot[] => {
  const byId = new Map(stored.map((snapshot) => [snapshot.id, snapshot]));
  for (const change of commit.changes) {
    if (change.kind === 'delete') byId.delete(change.spaceId);
    else byId.set(change.spaceId, change.snapshot);
  }
  return [...byId.values()].sort((left, right) => (left.id < right.id ? -1 : 1));
};

describe('the intake conformance corpus, commit cases', () => {
  it.each(commitCases)('%s', async (name) => {
    const path = join(CORPUS, 'commit', name);
    const testCase = await readCase(path, commitCaseSchema);
    expect(directoryCases).toContain(testCase.base);
    const directory = await copyOf(join(CORPUS, 'directory', testCase.base, 'aggregate'));
    const repository = await imported(directory);
    const loaded = await repository.loadAggregate();
    if (loaded.kind !== 'loaded') throw new Error(`${testCase.base} did not load`);
    const body = await readFile(join(path, 'commit.json'), 'utf8');

    let commit: SpaceCommit;
    try {
      commit = decodeCommitRequest(JSON.parse(body));
    } catch (error) {
      if (!(error instanceof SnapshotDecodeError) || error.spaceId === undefined) throw error;
      // The runner's answer, as the README's "Running a commit case" says: the
      // Fetch application refuses this body as an invalid request, with no kind.
      const spaceId = error.spaceId;
      expect(
        comparable({
          outcome: 'refused',
          refusals: error.at.map((at) => ({
            kind: 'invalid-shape',
            ...at,
            file: `${spaceId}/${at.file}`,
          })),
        }),
      ).toEqual(comparable(testCase.expect));
      return;
    }

    const result = await repository.commit(commit);
    if (result.kind === 'conflict' || result.kind === 'rejected') {
      throw new Error(`${name} answered ${result.kind}, which is not an intake answer`);
    }
    const answer: Answer =
      result.kind === 'committed'
        ? { outcome: 'accepted' }
        : {
            outcome: 'refused',
            refusals: locateAggregateRefusal(
              result.errors,
              candidateSpaces(
                loaded.aggregate.spaces.map(({ snapshot }) => snapshot),
                commit,
              ),
            ),
          };
    expect(comparable(answer)).toEqual(comparable(testCase.expect));

    if (result.kind === 'committed') {
      expect((await exportAggregate(repository, directory)).kind).toBe('exported');
      expect(await treeOf(directory)).toEqual(await treeOf(join(path, 'next')));
    }
  });
});

describe('the intake conformance corpus README', () => {
  const readme = readFile(join(CORPUS, 'README.md'), 'utf8');

  /** The rows of the table under the README's "Refusal kinds": each kind, and the cases it names. */
  const kindRows = async () =>
    ((await readme).split('\n## Refusal kinds\n')[1]?.split('\n## ')[0] ?? '')
      .split('\n')
      .flatMap((line) => {
        const row = /^\| `([a-z-]+)` \|.*\| (.+) \|$/.exec(line);
        return row?.[1] === undefined || row[2] === undefined
          ? []
          : [{ kind: row[1], cases: row[2] }];
      });

  it('writes down the closed list of refusal kinds, each once', async () => {
    expect((await kindRows()).map(({ kind }) => kind)).toEqual([...INTAKE_REFUSAL_KINDS]);
  });

  it('names, for each kind, exactly the cases that expect it', async () => {
    const expected = new Map<string, Set<string>>();
    for (const [group, schema, names] of [
      ['directory', directoryCaseSchema, directoryCases],
      ['commit', commitCaseSchema, commitCases],
    ] as const) {
      for (const name of names) {
        const parsed = await readCase(join(CORPUS, group, name), schema);
        if (parsed.expect.outcome !== 'refused') continue;
        for (const { kind } of parsed.expect.refusals) {
          expected.set(kind, new Set([...(expected.get(kind) ?? []), `${group}/${name}`]));
        }
      }
    }
    for (const { kind, cases } of await kindRows()) {
      const named = [...cases.matchAll(/`([a-z]+\/[a-z0-9-]+)`/g)].flatMap(([, path]) =>
        path === undefined ? [] : [path],
      );
      expect(named.length === 0, `${kind}: no case and no reason`).toBe(
        cases.startsWith('Not in the corpus'),
      );
      expect(named.sort(), kind).toEqual([...(expected.get(kind) ?? [])].sort());
    }
  });
});
