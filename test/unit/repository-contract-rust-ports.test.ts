import { describe, expect, it } from 'vitest';

import { UNAVAILABLE_SQLSTATES } from '../../src/prisma/sql-store';
import {
  casesOf,
  describedCasesIn,
  filesUnder,
  markedIn,
  readRepositoryFile,
  substitutedValue,
  type DescribedCase,
} from '../support/case-names';

/*
 * The TypeScript repository contract (`test/support/repository-contract.ts`)
 * runs on SQLite, and so do the TypeScript SQLite files beside it. The Rust
 * SQLite repository is held to each of their cases by a Rust test carrying
 * the line `// Case: <name>` above it in one of the Rust files below, or by an
 * exemption here saying why the case does not apply to it. TypeScript is the
 * reference; nothing here changes it.
 *
 * A contract case's name is its `it`'s first argument with the leading
 * `${name} ` (the harness's store name) dropped and any other substitution
 * written `*`. A case written once and run for several values names each
 * value: its Rust ports carry `// Case: <name> (<value>)`, one per value.
 */

const CONTRACT = 'test/support/repository-contract.ts';

/** The TypeScript SQLite files outside the contract, each case read as written. */
const OUTSIDE = [
  'test/integration/sqlite-space-repository.test.ts',
  'test/integration/sqlite-contention.test.ts',
  'test/support/fast-path-races.ts',
  'test/integration/sqlite-http-runtime.test.ts',
] as const;

/** The HTTP conformance cases, whose own ports test reads some of the same Rust files. */
const HTTP_CASE_FILES = [
  'conformance/http/wire-cases.ts',
  'conformance/http/store-condition-cases.ts',
  'conformance/http/process-cases.ts',
] as const;

/** Where the Rust SQLite repository's ports are written. */
const RUST_FILES = [
  ...filesUnder('crates/host/tests', (name) => /^sqlite.*\.rs$/u.test(name)).filter(
    (file) => !file.includes('/sqlite_support/'),
  ),
  ...filesUnder('crates/host/tests/repository_contract', (name) => name.endsWith('.rs')),
  'crates/host/tests/startup.rs',
  // The PostgreSQL store's own tests port the TypeScript PostgreSQL files,
  // which the PostgreSQL adapter below reads, not this list.
  ...filesUnder('crates/host/src', (name) => name.endsWith('.rs')).filter(
    (file) => !file.includes('/sql/postgres/'),
  ),
  'crates/cli/tests/serve.rs',
];

/** Each contract case written once and run for several values, with its values. */
const VALUES = {
  'replaces * stored state through the destructive lifecycle door': [
    'invalid-space-document',
    'invalid-aggregate',
  ],
  'refuses a replacement that repeats a * identity, keeping the stored aggregate': [
    'Space',
    'Resource',
  ],
  "stores a * commit's whole snapshot over Resource rows recreated before its row lock": [
    'topology-preserving',
    'complete-aggregate',
  ],
} satisfies Readonly<Record<string, readonly string[]>>;

/** Each case outside the contract written once and run for several values, with its values. */
const OUTSIDE_VALUES = {
  'refuses a %s-path commit whose row moved before the lock, writing no Resource': [
    'fast',
    'complete-aggregate',
  ],
} satisfies Readonly<Record<string, readonly string[]>>;

/** One run of a case: its name, and the name a port of it marks. */
interface Run {
  readonly name: string;
  readonly run: string;
}

/** Each case's runs: one per listed value, `<name> (<value>)`, or the case alone. */
const runsOf = (
  cases: readonly Pick<DescribedCase, 'name'>[],
  values: Readonly<Record<string, readonly string[]>>,
): Run[] =>
  cases.flatMap(({ name }) =>
    (values[name] ?? [undefined]).map((value) => ({
      name,
      run: value === undefined ? name : `${name} (${value})`,
    })),
  );

/** Why a case does not apply to the Rust SQLite repository. */
interface Exemption {
  readonly reason: string;
}

const doesNotApply = (reason: string): Exemption => ({ reason });

const EXEMPT = {
  // The contract.
  'writes a moved Resource through the ownership check, which refuses it before its Space releases it':
    doesNotApply(
      "a commit's answer does not depend on the order of its changes (ADR 0176, Storage ST-20): the Rust repository commits the move this case has the TypeScript SQL writer refuse, which `commits_a_move_whichever_space_it_lists_first` in `crates/host/tests/repository_contract/commits.rs`, not a port, holds on the memory store and SQLite",
    ),

  // test/integration/sqlite-space-repository.test.ts
  'names a statement PostgreSQL aborted for contention unavailable': doesNotApply(
    'a PostgreSQL error code: SQLite raises no such code',
  ),

  // test/support/fast-path-races.ts
  'commits a Map-internal Edit under the shared aggregate lock only': doesNotApply(
    'the Rust repository has one lock mode: every commit runs alone in the process inside one `BEGIN IMMEDIATE` transaction, so no commit takes a shared aggregate lock; that a Map-internal Edit is decided on the single-Space path and a Graph deletion handed on to the complete-aggregate decision is `hands_a_graph_deletion_on_to_the_complete_aggregate_decision` in `crates/host/tests/sqlite_races.rs`, not a port',
  ),

  // test/integration/sqlite-http-runtime.test.ts
  'names a Meta identity that keeps moving while it is locked unavailable': doesNotApply(
    'the TypeScript repository reads the Meta identity and then relocks its row, so a replacement can move it between the two; the Rust repository reads it inside the one `BEGIN IMMEDIATE` transaction that writes, so it cannot move under the read',
  ),
  'does not wrap a failure that already carries a name': doesNotApply(
    'a Rust failure is named once, by the `RepositoryError` variant its producer chooses, and `Failure::Answered` (`crates/host/src/sql.rs`) carries a named one through unchanged; no later step reads a chain of causes to name it again',
  ),
  'names an outage during the post-rollback conflict reload unavailable': doesNotApply(
    'the Rust repository decides a conflict from the rows it read inside its write transaction and answers it before rolling back, so it makes no read after the rollback for an outage to meet',
  ),
  'names an outage reading the Meta identity after a replacement conflict unavailable':
    doesNotApply(
      'the Rust replacement reads the Meta identity inside its one write transaction and relocks no row, so no read follows a conflict for an outage to meet',
    ),
} satisfies Readonly<Record<string, Exemption>>;

/** A contract case's name, the harness's store name dropped. */
const contractName = (written: string): string =>
  written.startsWith('* ')
    ? written.slice(2)
    : `<contract case not led by its store name: ${written}>`;

/** The contract's cases, each written once. */
const CONTRACT_CASES = casesOf(CONTRACT).map(contractName);

/** The contract's cases as they run: each value of a looped case named apart. */
const CONTRACT_RUNS = runsOf(
  CONTRACT_CASES.map((name) => ({ name })),
  VALUES,
);

/** The cases outside the contract, by file, as they run. */
const OUTSIDE_CASES = Object.fromEntries(
  OUTSIDE.map((file) => [
    file,
    runsOf(
      casesOf(file).map((name) => ({ name })),
      OUTSIDE_VALUES,
    ),
  ]),
);

/** The SQLite adapter's runs: the contract's, then each outside file's. */
const SQLITE_RUNS = [...CONTRACT_RUNS, ...Object.values(OUTSIDE_CASES).flat()];

/** The name each of those runs is marked by. */
const CASES = SQLITE_RUNS.map(({ run }) => run);

const HTTP_CASES = HTTP_CASE_FILES.flatMap(casesOf);

/** The module whose `repository_cases!` table runs the contract's Rust cases. */
const CONTRACT_TABLE = 'crates/host/tests/repository_contract/mod.rs';

/** The SQLite store's `Harness`, which runs the table on SQLite. */
const SQLITE_HARNESS = 'crates/host/tests/sqlite_contract.rs';

/**
 * Whether `source`, a store's `Harness`, runs the table once, in the form
 * that fails a case its harness cannot provide a member for, rather than
 * reporting a skip. Only then does every `// Case:` line port a case that runs on that
 * store: a member SQLite cannot provide fails the case at run time, whichever
 * way the member answers so, until the cases needing it are exemptions.
 */
const runsEveryMember = (source: string): boolean =>
  /^repository_cases!\(\s*[^,()]+,\s*every_member\s*(?:,\s*#\[[^\]]*\]\s*)*,?\s*\);$/mu.test(
    source,
  ) && source.split('repository_cases!').length === 2;

/** The SQL repository, whose Resource writes a test records. */
const SQL_REPOSITORY = 'crates/host/src/sql.rs';

/**
 * The functions of the SQL repository that may ask the store of statements to
 * write a Resource row, each with the statement it may ask for: the two that
 * record the write, and the recreation hook, whose writes are a test's own.
 */
const RESOURCE_WRITERS: ReadonlyMap<string, readonly string[]> = new Map([
  ['insert_resource', ['insert_resource']],
  ['upsert_resource', ['upsert_resource']],
  ['recreate_before_row_lock', ['insert_resource']],
]);

/**
 * Each line of `source`, the file `file`, asking the store to write a
 * Resource row from a function `RESOURCE_WRITERS` does not allow it in: a
 * write `take_resource_writes` would not answer.
 */
const unrecordedResourceWrites = (file: string, source: string): string[] => {
  let within = '<no function>';
  return source.split('\n').flatMap((line, index) => {
    within = /^\s*(?:pub(?:\([^)]*\))? )?(?:async )?fn (\w+)/u.exec(line)?.[1] ?? within;
    const statement = /\bS::(insert_resource|upsert_resource)\(/u.exec(line)?.[1];
    return statement === undefined || RESOURCE_WRITERS.get(within)?.includes(statement) === true
      ? []
      : [`${file}:${String(index + 1)} in \`${within}\`: ${line.trim()}`];
  });
};

/** The contract's Rust case files, each a group of the table, by group. */
const CONTRACT_GROUPS = filesUnder('crates/host/tests/repository_contract', (name) =>
  name.endsWith('.rs'),
)
  .filter((file) => file !== CONTRACT_TABLE)
  .map((file) => ({ group: file.replace(/^.*\/(.+)\.rs$/u, '$1'), file }));

/** The cases a `repository_cases!` table in `source` runs, each `group::case`. */
const tableOf = (source: string): string[] => {
  const begin = source.indexOf('// table:begin');
  const end = source.indexOf('// table:end');
  if (begin === -1 || end < begin) return ['<no table between its markers>'];
  let group = '';
  return source
    .slice(begin, end)
    .split('\n')
    .slice(1)
    .flatMap((written) => {
      const line = written.trim().replace(/,$/u, '');
      if (line.endsWith(' {')) {
        group = line.slice(0, -2);
        return [];
      }
      return line === '' || line === '}' ? [] : [`${group}::${line}`];
    });
};

/**
 * The function each `// Case:` line in `source`, the file of `group`, sits
 * above, each `group::function`, with only comment lines between them.
 */
const markedFunctionsOf = (group: string, source: string): string[] => {
  const functions: string[] = [];
  let marked = false;
  for (const line of source.split('\n').map((written) => written.trim())) {
    if (line.startsWith('// Case: ')) {
      marked = true;
    } else if (line.startsWith('//')) {
      // a comment line between a mark and its function
    } else if (marked) {
      const name = /^pub async fn (\w+)/u.exec(line)?.[1];
      functions.push(
        name === undefined ? `<a mark in ${group} above no case>` : `${group}::${name}`,
      );
      marked = false;
    }
  }
  if (marked) functions.push(`<a mark in ${group} above no case>`);
  return functions;
};

/** The marked functions of `groups` that `table` does not run. */
const unrun = (
  table: readonly string[],
  groups: readonly { readonly group: string; readonly source: string }[],
): string[] =>
  groups
    .flatMap(({ group, source }) => markedFunctionsOf(group, source))
    .filter((name) => !table.includes(name));

/*
 * The Rust PostgreSQL repository is held the same way to every TypeScript
 * case that runs on PostgreSQL (`.scratch/rust-postgresql-store/case-map.md`):
 * the contract, the TypeScript PostgreSQL files, and the PostgreSQL describe
 * blocks of files that hold more than one store's cases, read block by block
 * so a name two stores' blocks share is not taken for one case. A case that
 * runs once per value (an `it.each` name substituting `%s` or `$name`, every
 * case under a `describe.each`, and the contract's loops) names each value:
 * its port carries `// Case: <name> (<value>)`.
 *
 * Every case is in the adapter, ported or exempt. An exemption is keyed by a
 * case's name, covering each of its values, or by one value, `<name> (<value>)`,
 * which then decides that value alone. It is one of four kinds: pending, naming
 * the ticket of the plan that ports it; does not apply, naming the reason the
 * plan's spec gives; owned elsewhere, naming the rust-host ticket that ports it;
 * and accepted difference, naming the decision.
 *
 * The adapter's own files are where its ports are written, and a file the
 * HTTP ports test also reads marks them `// TypeScript case: <name>`. The
 * table's marks count as ports only once one of the adapter's own files runs
 * it by invoking `repository_cases!(`: the table runs no case on PostgreSQL
 * until then.
 */

/** A ticket of the rust-postgresql-store plan, as `case-map.md` assigns them. */
type PlanTicket = '05' | '06' | '07' | '08' | '09' | '10' | '11' | '12';

/** Why a case cannot run on PostgreSQL, in the words of the plan's spec ("Does not apply on PostgreSQL"). */
const DOES_NOT_APPLY = {
  jsonb:
    'a document stored as a BLOB, as text that is not JSON, or holding a lone surrogate: `jsonb` refuses each on write',
  uuid: 'a Space id or Meta identity that is not a UUID: the columns are `uuid`',
  'foreign key': 'a Meta identity naming no Space: the foreign key restricts it',
  'SQLite file':
    'a SQLite file rule (`SQLITE_PATH`, code 14, a file replaced under the host, journal mode and `synchronous`, the busy timeout, reserved locks): PostgreSQL has no file',
} as const;

type PostgresExemption =
  | { readonly kind: 'pending'; readonly ticket: PlanTicket }
  | { readonly kind: 'does not apply'; readonly reason: string }
  | { readonly kind: 'owned elsewhere'; readonly ticket: string }
  | { readonly kind: 'accepted difference'; readonly decision: string };

const pending = (ticket: PlanTicket): PostgresExemption => ({ kind: 'pending', ticket });

const doesNotApplyOnPostgres = (reason: keyof typeof DOES_NOT_APPLY): PostgresExemption => ({
  kind: 'does not apply',
  reason: DOES_NOT_APPLY[reason],
});

/** A case a rust-host ticket ports, outside this plan. */
const ownedElsewhere = (ticket: string): PostgresExemption => ({
  kind: 'owned elsewhere',
  ticket,
});

const acceptedDifference = (decision: string): PostgresExemption => ({
  kind: 'accepted difference',
  decision,
});

/** The same exemption for each of `names`. */
const exemptEach = (
  names: readonly string[],
  exemption: PostgresExemption,
): Record<string, PostgresExemption> => Object.fromEntries(names.map((name) => [name, exemption]));

/** The cases run once per value whose values are not listed, and listed values naming no such case. */
const unvalued = (
  cases: readonly Pick<DescribedCase, 'name' | 'perValue'>[],
  values: Readonly<Record<string, readonly string[]>>,
) => ({
  unlisted: cases
    .filter(({ name, perValue }) => perValue && !(name in values))
    .map(({ name }) => name),
  unknown: Object.keys(values).filter(
    (name) => !cases.some((written) => written.name === name && written.perValue),
  ),
});

/** How a case's values are read from the table it runs over, where its title alone does not say. */
interface ValueRules {
  /** The cell of each row that is its value, where it is not what the title substitutes. */
  readonly cells: Readonly<Record<string, string>>;
  /** The values of a table shared by stores that another store's adapter runs. */
  readonly otherStores: Readonly<Record<string, readonly string[]>>;
  /** The values of a table not written in its file, read from the module that builds it; a table written in its file is read there instead. */
  readonly runtime: Readonly<Record<string, readonly string[]>>;
}

/** The values the table of `written`, a case run once per value, holds. */
const tableValues = (
  written: Pick<DescribedCase, 'name' | 'table'>,
  rules: ValueRules,
): string[] => {
  const { table } = written;
  if (table?.rows === undefined) {
    return [...(rules.runtime[written.name] ?? ['<a table this test cannot read>'])];
  }
  const cell = rules.cells[written.name];
  return table.rows.map((row) =>
    cell === undefined ? substitutedValue(table.title, row) : (row[cell] ?? '*'),
  );
};

/**
 * The cases run once per value whose listed values are not the values their
 * table holds, less those another store's adapter runs: a value added to a
 * table, or dropped from one, reaches the listed values or this answers it.
 */
const misvalued = (
  cases: readonly Pick<DescribedCase, 'name' | 'perValue' | 'table'>[],
  values: Readonly<Record<string, readonly string[]>>,
  rules: ValueRules,
) =>
  cases
    .filter(({ perValue }) => perValue)
    .flatMap((written) => {
      const all = tableValues(written, rules);
      const others = rules.otherStores[written.name] ?? [];
      const read = [
        ...all.filter((value) => !others.includes(value)),
        ...others
          .filter((value) => !all.includes(value))
          .map((value) => `<another store's value not in the table: ${value}>`),
      ];
      const listed = values[written.name] ?? [];
      return read.length === listed.length && read.every((value, index) => value === listed[index])
        ? []
        : [{ name: written.name, listed, read }];
    });

interface Marks<E> {
  /** The runs the adapter's files mark. */
  readonly marked: readonly string[];
  readonly exempt: Readonly<Record<string, E>>;
  /** Names a mark may carry that are another ports test's cases. */
  readonly elsewhere: readonly string[];
}

/** The exemption deciding `run`: one naming its value, or else its case's. */
const exemptionOf = <E>({ name, run }: Run, exempt: Readonly<Record<string, E>>): E | undefined =>
  exempt[run] ?? exempt[name];

/** What is wrong with an adapter's marks and exemptions against `runs`. */
const findings = <E>(runs: readonly Run[], { marked, exempt, elsewhere }: Marks<E>) => ({
  unported: runs
    .filter((run) => !marked.includes(run.run) && exemptionOf(run, exempt) === undefined)
    .map(({ run }) => run),
  unknownMarks: marked.filter(
    (mark) => !runs.some(({ run }) => run === mark) && !elsewhere.includes(mark),
  ),
  unknownExemptions: Object.keys(exempt).filter(
    (key) => !runs.some(({ name, run }) => key === name || key === run),
  ),
  exemptAndPorted: runs
    .filter((run) => marked.includes(run.run) && exemptionOf(run, exempt) !== undefined)
    .map(({ run }) => run),
});

/** How many runs are ported, and how many each kind of exemption holds. */
interface Tally {
  ported: number;
  pending: number;
  'does not apply': number;
  'owned elsewhere': number;
  'accepted difference': number;
}

const postgresTally = (
  runs: readonly Run[],
  { marked, exempt }: Pick<Marks<PostgresExemption>, 'marked' | 'exempt'>,
): Tally => {
  const tally: Tally = {
    ported: 0,
    pending: 0,
    'does not apply': 0,
    'owned elsewhere': 0,
    'accepted difference': 0,
  };
  for (const run of runs) {
    const exemption = exemptionOf(run, exempt);
    if (exemption !== undefined) tally[exemption.kind] += 1;
    else if (marked.includes(run.run)) tally.ported += 1;
  }
  return tally;
};

/** What a test binary writes to run the repository contract's table. */
const RUNS_REPOSITORY_TABLE = 'repository_cases!(';

/** Whether `text` invokes the table on a line of its own, not in a comment or a string. */
const runsRepositoryCases = (text: string): boolean =>
  text.split('\n').some((line) => line.trimStart().startsWith(RUNS_REPOSITORY_TABLE));

/** An adapter's marks: the table's only where its own files run the table. */
const marksOf = ({
  table,
  own,
  runsTable,
}: {
  readonly table: readonly string[];
  readonly own: readonly string[];
  readonly runsTable: boolean;
}): string[] => (runsTable ? [...table, ...own] : [...own]);

/** A file whose cases run on PostgreSQL, or the one describe block of it that does. */
interface CaseSource {
  readonly file: string;
  /** The title of the describe block read, where the file holds more than one store's cases. */
  readonly describe?: string;
}

const POSTGRES_SOURCES: readonly CaseSource[] = [
  { file: 'test/integration/postgres-space-repository.test.ts' },
  { file: 'test/integration/postgres-aggregate-initialization.test.ts' },
  { file: 'test/integration/postgres-misconfiguration.test.ts' },
  { file: 'test/integration/prisma-postgres.test.ts' },
  { file: 'test/unit/postgres-unreachable.test.ts' },
  { file: 'test/unit/postgres-aggregate-lock-key.test.ts' },
  { file: 'test/unit/prisma-postgres-env-path.test.ts' },
  { file: 'test/support/fast-path-races.ts' },
  { file: 'test/unit/sql-connection-failure.test.ts', describe: 'postgresSqlStore.isUnavailable' },
  {
    file: 'test/unit/database-startup.test.ts',
    describe: 'retryMetaSpaceEstablishment over a PostgreSQL server that refuses this client',
  },
  { file: 'test/integration/aggregate-commit-differential.test.ts' },
  { file: 'test/integration/database-http-runtime.test.ts' },
  { file: 'test/unit/vite-hono-host.test.ts', describe: 'Database HTTP runtime' },
  { file: 'test/unit/prisma-foundation.test.ts' },
  { file: 'test/e2e/postgres-persistence.spec.ts' },
  { file: 'test/integration/infinity-cube-cli.test.ts' },
  { file: 'test/integration/database-cli-targets.test.ts' },
];

/** The cases `source` holds, as written. */
const casesFrom = ({ file, describe: block }: CaseSource): DescribedCase[] =>
  describedCasesIn(file, readRepositoryFile(file)).filter(
    ({ describes }) => block === undefined || describes[0] === block,
  );

const POSTGRES_SOURCE_CASES = POSTGRES_SOURCES.map((source) => ({
  source,
  cases: casesFrom(source),
}));

/** The PostgreSQL adapter's cases: the contract's (each run per value by its loop), then each source's. */
const POSTGRES_CASES: readonly Pick<DescribedCase, 'name' | 'perValue'>[] = [
  ...CONTRACT_CASES.map((name) => ({ name, perValue: name in VALUES })),
  ...POSTGRES_SOURCE_CASES.flatMap(({ cases }) => cases),
];

const POSTGRES_NAMES = POSTGRES_CASES.map(({ name }) => name);

/** The values of each case the PostgreSQL adapter runs once per value. */
const POSTGRES_VALUES = {
  ...VALUES,
  // test/integration/postgres-aggregate-initialization.test.ts
  'initializes without losing integrity after $boundary with $expected competing proposal': [
    'meta-read, already-initialized',
    'meta-read, existing',
    'meta-delete, already-initialized',
  ],
  // test/integration/postgres-misconfiguration.test.ts, under its `describe.each`
  'leaves the transactional aggregate read unclassified with the raw handshake refusal': [
    '28P01',
    '3D000',
  ],
  'leaves a direct read unclassified with the normalised refusal': ['28P01', '3D000'],
  // test/unit/postgres-unreachable.test.ts
  'names %s unavailable, keeping the refusal on the cause chain': [
    'listSpaces',
    'loadSpace',
    'loadMetaSpaceId',
    'markExported',
  ],
  'leaves SQLSTATE %s unclassified inside and outside a transaction': ['28P01', '28000', '3D000'],
  'names SQLSTATE %s unavailable inside and outside a transaction': ['53300', '57P03'],
  // test/unit/sql-connection-failure.test.ts, its `postgresSqlStore.isUnavailable` describe
  'recognises %s whatever its transient flag says': [
    'a connection the server dropped',
    'a refused connection the driver normalised',
  ],
  'recognises the socket failure %s the driver normalised': [
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'EHOSTUNREACH',
  ],
  'recognises SQLSTATE %s on a statement the driver normalised': [
    '08000',
    '08001',
    '08003',
    '08004',
    '08006',
    '40001',
    '40P01',
    '53300',
    '55P03',
    '57P01',
    '57P02',
    '57P03',
  ],
  'recognises SQLSTATE %s raised while connecting': ['53300', '57P03'],
  'leaves SQLSTATE %s raised while connecting unclassified': ['28P01', '28000', '3D000'],
  'recognises the socket failure %s': [
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'EAI_AGAIN',
  ],
  'leaves the error code %s unclassified': [
    'ENOTFOUND',
    'EACCES',
    'EPROTO',
    'ERR_INVALID_ARG_TYPE',
  ],
  'walks the cause chain to %s': [
    'a connection failure',
    'a serialization failure',
    'a refused socket',
    'a server not accepting connections yet',
  ],
  // test/integration/database-http-runtime.test.ts, the PostgreSQL arm of its `describe.each`
  'establishes Default Content and serves the collection and Meta Space': ['PostgreSQL'],
  'recovers through the shared retry after a transient startup failure': ['PostgreSQL'],
  'gives up through the shared retry after two confirmed invariant failures': ['PostgreSQL'],
  // test/unit/prisma-foundation.test.ts
  'advances %s.updatedAt when a record is updated': ['Space', 'Resource'],
  // test/integration/database-cli-targets.test.ts, the PostgreSQL arm of its `describe.each`
  'imports and exports the same aggregate through the store --store names': ['PostgreSQL'],
} satisfies Readonly<Record<string, readonly string[]>>;

/**
 * How the values of the sources' per-value cases are read from their tables.
 * The contract's loops are not tables the reader reads: the count of
 * `CONTRACT_RUNS` pins how many values they run, not which.
 */
const POSTGRES_VALUE_RULES: ValueRules = {
  cells: {
    // Each row of its `describe.each` is a label, then the SQLSTATE that is its value.
    'leaves the transactional aggregate read unclassified with the raw handshake refusal': '1',
    'leaves a direct read unclassified with the normalised refusal': '1',
  },
  otherStores: Object.fromEntries(
    [
      'establishes Default Content and serves the collection and Meta Space',
      'recovers through the shared retry after a transient startup failure',
      'gives up through the shared retry after two confirmed invariant failures',
      'imports and exports the same aggregate through the store --store names',
    ].map((name) => [name, ['SQLite']]),
  ),
  runtime: { 'recognises SQLSTATE %s on a statement the driver normalised': UNAVAILABLE_SQLSTATES },
};

const POSTGRES_RUNS = runsOf(POSTGRES_CASES, POSTGRES_VALUES);

const CHANGE_ORDER =
  "a commit's answer does not depend on the order of its changes (ADR 0176, Storage ST-20; carried over from #528)";

const POSTGRES_EXEMPT = {
  // The contract: the table (02), run on PostgreSQL by `crates/host/tests/postgres.rs`.
  'writes a moved Resource through the ownership check, which refuses it before its Space releases it':
    acceptedDifference(CHANGE_ORDER),

  // test/unit/prisma-postgres-env-path.test.ts
  'names the root .env from the bundled runtime and from the source alike': acceptedDifference(
    'Q7: Rust searches for the nearest `.env` from the current directory, having no module directory',
  ),
  'starts from this module’s own directory when given no starting point': acceptedDifference(
    'Q7: Rust starts its search from the current directory',
  ),

  // test/unit/sql-connection-failure.test.ts, its `postgresSqlStore.isUnavailable` describe
  'recognises the socket failure %s (EAI_AGAIN)': acceptedDifference(
    'Q5: a temporary resolver failure and a name that does not resolve reach Rust alike, as `Io(Uncategorized)` with no OS error, so Rust leaves both unclassified',
  ),

  // test/unit/prisma-foundation.test.ts
  ...exemptEach(
    [
      'bootstraps singleton repository state from the legacy Entry Space',
      'reaches the emitted contract from the existing migration head',
    ],
    ownedElsewhere('rust-host 16: migration history'),
  ),

  // test/e2e/postgres-persistence.spec.ts
  'a PostgreSQL-backed edit survives a fresh host': pending('10'),

  // test/integration/infinity-cube-cli.test.ts and the PostgreSQL arm of
  // test/integration/database-cli-targets.test.ts
  ...exemptEach(
    [
      'imports through the real command and durably reports the stored space',
      'imports every Space of an aggregate and takes Meta from aggregate.json',
      'refuses an import over an initialized repository and leaves the Meta Space alone',
      'exports through the real command and records the projected PostgreSQL revision',
      'round-trips the stored aggregate through the real export and import commands',
      'stores the assets an imported directory carries, and exports them again',
      'reports a malformed resource path and stores no partial space',
      'imports and exports the same aggregate through the store --store names',
    ],
    ownedElsewhere('rust-host 17 and 26: the CLI’s import and export against a store'),
  ),
} satisfies Readonly<Record<string, PostgresExemption>>;

/** The PostgreSQL store's test binary, whose `Harness` runs the table on PostgreSQL. */
const POSTGRES_HARNESS = 'crates/host/tests/postgres.rs';

/** An adapter: the table, and the files its own ports are written in. */
interface Port {
  readonly name: string;
  /** The contract's table, whose marks count once a file of the adapter runs it. */
  readonly table: readonly string[];
  /** The adapter's own files. */
  readonly files: readonly string[];
  /**
   * Files whose `// Case:` lines are the HTTP ports test's, where this
   * adapter's ports are marked `// TypeScript case:` instead.
   */
  readonly sharedFiles: readonly string[];
  readonly exempt: Readonly<Record<string, PostgresExemption>>;
}

const POSTGRES: Port = {
  name: 'the Rust PostgreSQL repository',
  table: filesUnder('crates/host/tests/repository_contract', (name) => name.endsWith('.rs')),
  files: [
    POSTGRES_HARNESS,
    'crates/host/tests/postgres_concurrency.rs',
    'crates/host/tests/postgres_outages.rs',
    'crates/host/tests/postgres_properties.rs',
    'crates/host/tests/postgres_races.rs',
    'crates/host/tests/postgres_url.rs',
    'crates/host/src/sql/postgres/tests.rs',
  ],
  sharedFiles: ['crates/cli/tests/serve_postgres.rs'],
  exempt: POSTGRES_EXEMPT,
};

const POSTGRES_MARKED = marksOf({
  table: markedIn(POSTGRES.table),
  own: [...markedIn(POSTGRES.files), ...markedIn(POSTGRES.sharedFiles, 'TypeScript case')],
  runsTable: POSTGRES.files.some((file) => runsRepositoryCases(readRepositoryFile(file))),
});

describe('the repository cases the Rust SQLite repository is held to', () => {
  it('give the contract its 73 cases, three of them run for two values each', () => {
    expect(CONTRACT_CASES).toHaveLength(73);
    expect(CONTRACT_RUNS).toHaveLength(76);
    expect(Object.keys(VALUES).filter((name) => !CONTRACT_CASES.includes(name))).toEqual([]);
  });

  it('names each value of a case outside the contract that runs for several', () => {
    const written = OUTSIDE.flatMap(casesOf);
    expect(Object.keys(OUTSIDE_VALUES).filter((name) => !written.includes(name))).toEqual([]);
  });

  it('are each led by the store name in the contract', () => {
    expect(CONTRACT_CASES.filter((name) => name.startsWith('<'))).toEqual([]);
  });

  it('are each named once, by text', () => {
    expect(CASES.filter((name) => name.startsWith('<'))).toEqual([]);
    expect(CASES.filter((name, index) => CASES.indexOf(name) !== index)).toEqual([]);
  });

  it.each(OUTSIDE)('reads the cases of %s', (file) => {
    expect(OUTSIDE_CASES[file]?.length).toBeGreaterThan(0);
  });

  it('reads Rust files that exist', () => {
    expect(RUST_FILES).toContain('crates/host/tests/sqlite.rs');
    expect(RUST_FILES).toContain('crates/host/src/sql.rs');
    expect(RUST_FILES).toContain('crates/host/tests/repository_contract/commits.rs');
    expect(RUST_FILES.filter((file) => file.includes('sqlite_support'))).toEqual([]);
  });
});

describe('the Rust SQLite repository', () => {
  const found = findings(SQLITE_RUNS, {
    marked: markedIn(RUST_FILES),
    exempt: EXEMPT,
    elsewhere: HTTP_CASES,
  });

  it('ports every case it does not exempt', () => {
    expect(found.unported).toEqual([]);
  });

  it('marks and exempts only cases the lists hold', () => {
    expect(found.unknownMarks).toEqual([]);
    expect(found.unknownExemptions).toEqual([]);
  });

  it('exempts no case it ports', () => {
    expect(found.exemptAndPorted).toEqual([]);
  });

  it('runs every contract case it marks as a port, through the table', () => {
    const table = tableOf(readRepositoryFile(CONTRACT_TABLE));
    expect(table.length).toBeGreaterThan(70);
    expect(CONTRACT_GROUPS.map(({ group }) => group)).toContain('commits');
    expect(
      unrun(
        table,
        CONTRACT_GROUPS.map(({ group, file }) => ({ group, source: readRepositoryFile(file) })),
      ),
    ).toEqual([]);
  });

  it('runs every case it marks, its harness providing every member the table asks of it', () => {
    const harness = readRepositoryFile(SQLITE_HARNESS);
    expect(runsEveryMember(harness)).toBe(true);
  });

  it('asks the store to write a Resource row only where the write is recorded', () => {
    const source = readRepositoryFile(SQL_REPOSITORY);
    expect(source).toContain('S::insert_resource(');
    expect(source).toContain('S::upsert_resource(');
    expect(unrecordedResourceWrites(SQL_REPOSITORY, source)).toEqual([]);
  });

  it('gives each exemption a reason it does not apply', () => {
    const malformed = Object.entries(EXEMPT).filter(
      ([, exemption]) => exemption.reason.trim().length === 0,
    );
    expect(malformed).toEqual([]);
  });
});

describe('the repository cases the Rust PostgreSQL repository is held to', () => {
  it('give the adapter 150 names: 130 of the first case map and the 20 the cold audit found', () => {
    expect(POSTGRES_NAMES).toHaveLength(150);
    expect(POSTGRES_NAMES.filter((name) => name.startsWith('<'))).toEqual([]);
  });

  it('are each named once, by text, read block by block where a file holds more than one store', () => {
    expect(POSTGRES_NAMES.filter((name, index) => POSTGRES_NAMES.indexOf(name) !== index)).toEqual(
      [],
    );
  });

  it.each(POSTGRES_SOURCE_CASES.map(({ source, cases }) => [source.file, source.describe, cases]))(
    'reads the cases of %s (describe: %s)',
    (_file, _describe, cases) => {
      expect(cases.length).toBeGreaterThan(0);
    },
  );

  it('reads one case of vite-hono-host.test.ts and two of database-startup.test.ts', () => {
    const counts = Object.fromEntries(
      POSTGRES_SOURCE_CASES.map(({ source, cases }) => [source.file, cases.length]),
    );
    expect(counts['test/unit/vite-hono-host.test.ts']).toBe(1);
    expect(counts['test/unit/database-startup.test.ts']).toBe(2);
    expect(counts['test/unit/sql-connection-failure.test.ts']).toBe(12);
  });

  it('lists the values of every case run once per value, and only those', () => {
    expect(unvalued(POSTGRES_CASES, POSTGRES_VALUES)).toEqual({ unlisted: [], unknown: [] });
  });

  it('lists, for each case of a source run once per value, the values its table holds', () => {
    expect(
      misvalued(
        POSTGRES_SOURCE_CASES.flatMap(({ cases }) => cases),
        POSTGRES_VALUES,
        POSTGRES_VALUE_RULES,
      ),
    ).toEqual([]);
  });

  it('give the adapter 193 runs, one per value of each case run once per value', () => {
    expect(POSTGRES_RUNS).toHaveLength(193);
  });
});

describe('the Rust PostgreSQL repository', () => {
  const found = findings(POSTGRES_RUNS, {
    marked: POSTGRES_MARKED,
    exempt: POSTGRES.exempt,
    elsewhere: HTTP_CASES,
  });

  it('ports or exempts every case and value', () => {
    expect(found.unported).toEqual([]);
  });

  it('marks and exempts only cases and values the lists hold', () => {
    expect(found.unknownMarks).toEqual([]);
    expect(found.unknownExemptions).toEqual([]);
  });

  it('exempts no case or value it ports', () => {
    expect(found.exemptAndPorted).toEqual([]);
  });

  it('runs the table, its harness providing every member the table asks of it', () => {
    const harness = readRepositoryFile(POSTGRES_HARNESS);
    expect(runsRepositoryCases(harness)).toBe(true);
    expect(harness).toContain('impl Harness for Postgres');
    expect(runsEveryMember(harness)).toBe(true);
  });

  it('ports every contract case but the one exempt for change order', () => {
    const exemptContractRuns = POSTGRES_RUNS.filter(
      (run) => CONTRACT_CASES.includes(run.name) && exemptionOf(run, POSTGRES.exempt) !== undefined,
    );
    expect(exemptContractRuns).toEqual([
      {
        name: 'writes a moved Resource through the ownership check, which refuses it before its Space releases it',
        run: 'writes a moved Resource through the ownership check, which refuses it before its Space releases it',
      },
    ]);
  });

  it('ports the table and its own cases, every other case exempt', () => {
    expect(
      postgresTally(POSTGRES_RUNS, { marked: POSTGRES_MARKED, exempt: POSTGRES.exempt }),
    ).toEqual({
      ported: 178,
      pending: 1,
      'does not apply': 0,
      'owned elsewhere': 10,
      'accepted difference': 4,
    });
  });

  it('gives each exemption its ticket, reason or decision', () => {
    const unexplained = Object.entries(POSTGRES.exempt).filter(([, exemption]) => {
      switch (exemption.kind) {
        case 'pending':
          return false;
        case 'does not apply':
          return !Object.values<string>(DOES_NOT_APPLY).includes(exemption.reason);
        case 'owned elsewhere':
          return !/^rust-host \d+/u.test(exemption.ticket);
        case 'accepted difference':
          return exemption.decision.trim().length === 0;
      }
    });
    expect(unexplained).toEqual([]);
  });
});

describe('the port check', () => {
  const cases = ['ported', 'inapplicable'].map((name) => ({ name, run: name }));
  const clean: Marks<Exemption> = {
    marked: ['ported', 'an HTTP case'],
    exempt: { inapplicable: doesNotApply('why') },
    elsewhere: ['an HTTP case'],
  };

  it('finds nothing wrong with a case ported once, or exempted', () => {
    expect(findings(cases, clean)).toEqual({
      unported: [],
      unknownMarks: [],
      unknownExemptions: [],
      exemptAndPorted: [],
    });
  });

  it('finds a case with no port and no exemption', () => {
    expect(findings(cases, { ...clean, marked: [] }).unported).toEqual(['ported']);
  });

  it('finds a mark naming no case of either list', () => {
    expect(findings(cases, { ...clean, marked: ['ported', 'gone'] }).unknownMarks).toEqual([
      'gone',
    ]);
  });

  it('finds an exemption naming no case', () => {
    expect(
      findings(cases, { ...clean, exempt: { ...clean.exempt, gone: doesNotApply('why') } })
        .unknownExemptions,
    ).toEqual(['gone']);
  });

  it('finds a case both exempted and ported', () => {
    expect(
      findings(cases, { ...clean, exempt: { ...clean.exempt, ported: doesNotApply('why') } })
        .exemptAndPorted,
    ).toEqual(['ported']);
  });

  it('finds a table run in the form that fails a case its harness cannot provide for', () => {
    expect(runsEveryMember('repository_cases!(super::Sqlite, every_member);')).toBe(true);
    expect(runsEveryMember('repository_cases!(super::Sqlite);')).toBe(false);
    expect(
      runsEveryMember(
        'repository_cases!(\n    super::Postgres,\n    every_member,\n    #[ignore = "needs PostgreSQL"]\n);',
      ),
    ).toBe(true);
    expect(
      runsEveryMember(
        'repository_cases!(\n    super::Postgres,\n    #[ignore = "needs PostgreSQL"]\n);',
      ),
    ).toBe(false);
    expect(runsEveryMember('// repository_cases!(super::Sqlite, every_member);')).toBe(false);
    expect(
      runsEveryMember(
        'repository_cases!(super::Sqlite, every_member);\nrepository_cases!(super::Sqlite);',
      ),
    ).toBe(false);
  });

  it('finds a Resource write the repository does not record, naming its line', () => {
    const source = [
      'async fn insert_resource(',
      '    S::insert_resource(connection, resource).await',
      'async fn upsert_resource(',
      '    S::upsert_resource(connection, resource).await',
      '    async fn recreate_before_row_lock(',
      '        S::insert_resource(connection, resource).await?;',
      '        S::upsert_resource(connection, resource).await?;',
      'pub(crate) async fn write_created(',
      '    self.insert_resource(connection, resource).await?;',
      '    S::insert_resource(connection, resource).await?;',
    ].join('\n');
    expect(unrecordedResourceWrites('sql.rs', source)).toEqual([
      'sql.rs:7 in `recreate_before_row_lock`: S::upsert_resource(connection, resource).await?;',
      'sql.rs:10 in `write_created`: S::insert_resource(connection, resource).await?;',
    ]);
  });

  it('finds a marked case the table does not run, and a mark above no case', () => {
    const table = tableOf('// table:begin\n  commits {\n    listed,\n  }\n  // table:end');
    expect(table).toEqual(['commits::listed']);
    const source = [
      '// Case: one',
      '/// Its doc.',
      'pub async fn listed<H: Harness>(harness: &mut H) -> Ran {',
      '// Case: two',
      'pub async fn dropped<H: Harness>(',
      '// Case: three',
      'fn helper() {}',
      'pub async fn unmarked<H: Harness>(',
    ].join('\n');
    expect(unrun(table, [{ group: 'commits', source }])).toEqual([
      'commits::dropped',
      '<a mark in commits above no case>',
    ]);
    expect(unrun(table, [{ group: 'commits', source: '// Case: last' }])).toEqual([
      '<a mark in commits above no case>',
    ]);
  });
});

describe('the case reader', () => {
  const source = [
    "describe('postgres', () => {",
    "  it.each(['a', 'b'])('names %s', () => {});",
    "  test('shared name', () => {});",
    '});',
    "describe('sqlite', () => {",
    "  it('shared name', () => {});",
    '});',
    "describe.each([['x']])('given %s', () => {",
    "  describe('inner', () => {",
    "    it('runs per value', () => {});",
    '  });',
    '});',
    'test.afterEach(() => {});',
    "it('top', () => {});",
  ].join('\n');

  it('reads every case with the describe blocks around it, outermost first', () => {
    expect(describedCasesIn('example.ts', source)).toEqual([
      {
        name: 'names %s',
        line: 2,
        describes: ['postgres'],
        perValue: true,
        table: { title: 'names %s', rows: [{ 0: 'a' }, { 0: 'b' }] },
      },
      { name: 'shared name', line: 3, describes: ['postgres'], perValue: false },
      { name: 'shared name', line: 6, describes: ['sqlite'], perValue: false },
      {
        name: 'runs per value',
        line: 10,
        describes: ['given %s', 'inner'],
        perValue: true,
        table: { title: 'given %s', rows: [{ 0: 'x' }] },
      },
      { name: 'top', line: 14, describes: [], perValue: false },
    ]);
  });

  it("finds a name two describes share, which one describe's cases do not repeat", () => {
    const names = describedCasesIn('example.ts', source).map(({ name }) => name);
    expect(names.filter((name, index) => names.indexOf(name) !== index)).toEqual(['shared name']);
    const postgres = describedCasesIn('example.ts', source)
      .filter(({ describes }) => describes[0] === 'postgres')
      .map(({ name }) => name);
    expect(postgres).toEqual(['names %s', 'shared name']);
  });

  it('runs a case once per value when its name takes an object member', () => {
    expect(
      describedCasesIn('example.ts', "it.each([{ a: 1 }])('after $a', () => {});")[0]?.perValue,
    ).toBe(true);
  });

  it('runs a case once per value when its name takes only the row index', () => {
    expect(
      describedCasesIn('example.ts', "it.each(['a'])('case %#', () => {});")[0]?.perValue,
    ).toBe(true);
    expect(
      describedCasesIn('example.ts', "it.each(['a'])('case %$', () => {});")[0]?.perValue,
    ).toBe(true);
  });

  it('refuses a case that runs over a table its name substitutes nothing of', () => {
    expect(() =>
      describedCasesIn('example.ts', "\nit.each(['a', 'b'])('names no value', () => {});"),
    ).toThrow("example.ts:2: 'names no value' runs over a table and substitutes no value of it");
    expect(() =>
      describedCasesIn('example.ts', "test.each(['a'])('names no value', () => {});"),
    ).toThrow("example.ts:1: 'names no value'");
  });

  it("reads the table a case runs over, with the name that substitutes each row's values", () => {
    const tables = describedCasesIn(
      'example.ts',
      [
        "import { CODES } from './codes';",
        "const arms = targetCases([{ name: 'PostgreSQL', open }, { name: 'SQLite', open }]);",
        "it.each([['a', 1, value], ['b', 2, value]] as const)('pairs %s with %d', () => {});",
        "it.each(['x', `y`])('names %s', () => {});",
        "describe.each(arms)('given $name', () => { it('runs per arm', () => {}); });",
        "it.each(CODES)('recognises %s', () => {});",
      ].join('\n'),
    ).map(({ name, table }) => [name, table]);
    expect(tables).toEqual([
      [
        'pairs %s with %d',
        {
          title: 'pairs %s with %d',
          rows: [
            { 0: 'a', 1: '1' },
            { 0: 'b', 1: '2' },
          ],
        },
      ],
      ['names %s', { title: 'names %s', rows: [{ 0: 'x' }, { 0: 'y' }] }],
      [
        'runs per arm',
        { title: 'given $name', rows: [{ name: 'PostgreSQL' }, { name: 'SQLite' }] },
      ],
      ['recognises %s', { title: 'recognises %s', rows: undefined }],
    ]);
  });

  it('fills a name with the values of each row it substitutes', () => {
    expect(substitutedValue('pairs %s with %d', { 0: 'a', 1: '1' })).toBe('a, 1');
    expect(
      substitutedValue('after $boundary with $expected', { boundary: 'b', expected: 'e' }),
    ).toBe('b, e');
    expect(substitutedValue('names %s', { 1: 'unread' })).toBe('*');
  });
});

describe('the PostgreSQL port check', () => {
  const cases: readonly DescribedCase[] = [
    { name: 'ported', line: 1, describes: [], perValue: false },
    { name: 'pending', line: 2, describes: [], perValue: false },
    { name: 'per %s', line: 3, describes: [], perValue: true },
  ];
  const values = { 'per %s': ['a', 'b'] };
  const runs = runsOf(cases, values);
  const clean: Marks<PostgresExemption> = {
    marked: ['ported', 'per %s (a)', 'an HTTP case'],
    exempt: {
      pending: pending('06'),
      'per %s (b)': acceptedDifference('Q5'),
    },
    elsewhere: ['an HTTP case'],
  };

  it('names each value of a case that runs once per value', () => {
    expect(runs).toEqual([
      { name: 'ported', run: 'ported' },
      { name: 'pending', run: 'pending' },
      { name: 'per %s', run: 'per %s (a)' },
      { name: 'per %s', run: 'per %s (b)' },
    ]);
  });

  it('finds a case run once per value whose values are not listed, and values naming no such case', () => {
    expect(unvalued(cases, values)).toEqual({ unlisted: [], unknown: [] });
    expect(unvalued(cases, {})).toEqual({ unlisted: ['per %s'], unknown: [] });
    expect(unvalued(cases, { ...values, ported: ['x'], gone: ['y'] })).toEqual({
      unlisted: [],
      unknown: ['ported', 'gone'],
    });
  });

  it("finds a case whose listed values are not its table's", () => {
    const read = describedCasesIn(
      'example.ts',
      [
        "it.each(['53300', '57P03', '57P04'])('names %s', () => {});",
        "describe.each([['a label', '28P01']])('given %s', () => { it('refuses', () => {}); });",
        "describe.each([{ name: 'PostgreSQL' }, { name: 'SQLite' }, { name: 'MySQL' }])('($name)', () => { it('serves', () => {}); });",
        "it.each(CODES)('recognises %s', () => {});",
        "it.each(['a'])('listed right %s', () => {});",
      ].join('\n'),
    );
    const values = {
      'names %s': ['53300', '57P03'],
      refuses: ['28P01'],
      serves: ['PostgreSQL'],
      'recognises %s': ['08000'],
      'listed right %s': ['a'],
    };
    const rules: ValueRules = {
      cells: { refuses: '1' },
      otherStores: { serves: ['SQLite'] },
      runtime: { 'recognises %s': ['08000', '08001'] },
    };
    expect(misvalued(read, values, rules)).toEqual([
      { name: 'names %s', listed: ['53300', '57P03'], read: ['53300', '57P03', '57P04'] },
      { name: 'serves', listed: ['PostgreSQL'], read: ['PostgreSQL', 'MySQL'] },
      { name: 'recognises %s', listed: ['08000'], read: ['08000', '08001'] },
    ]);
    expect(
      misvalued(read, values, { ...rules, cells: {}, otherStores: { serves: ['SQLite', 'Gone'] } }),
    ).toEqual([
      { name: 'names %s', listed: ['53300', '57P03'], read: ['53300', '57P03', '57P04'] },
      { name: 'refuses', listed: ['28P01'], read: ['a label'] },
      {
        name: 'serves',
        listed: ['PostgreSQL'],
        read: ['PostgreSQL', 'MySQL', "<another store's value not in the table: Gone>"],
      },
      { name: 'recognises %s', listed: ['08000'], read: ['08000', '08001'] },
    ]);
  });

  it('finds a case run once per value whose table is neither read nor given', () => {
    const read = describedCasesIn('example.ts', "it.each(CODES)('recognises %s', () => {});");
    expect(
      misvalued(read, { 'recognises %s': ['08000'] }, { cells: {}, otherStores: {}, runtime: {} }),
    ).toEqual([
      { name: 'recognises %s', listed: ['08000'], read: ['<a table this test cannot read>'] },
    ]);
  });

  it('reads a table written in its file even where its values are given from a module', () => {
    const read = describedCasesIn('example.ts', "it.each(['08000'])('recognises %s', () => {});");
    const given = ['08000', '08001'];
    expect(
      misvalued(
        read,
        { 'recognises %s': given },
        { cells: {}, otherStores: {}, runtime: { 'recognises %s': given } },
      ),
    ).toEqual([{ name: 'recognises %s', listed: given, read: ['08000'] }]);
  });

  it('finds the values of every case under a describe.each unlisted when they are dropped', () => {
    const read = describedCasesIn(
      'example.ts',
      "describe.each([['28P01']])('given %s', () => { it('refuses', () => {}); });",
    );
    expect(unvalued(read, {})).toEqual({ unlisted: ['refuses'], unknown: [] });
    expect(runsOf(read, { refuses: ['28P01'] })).toEqual([
      { name: 'refuses', run: 'refuses (28P01)' },
    ]);
  });

  it('finds nothing wrong with a case ported, or exempted by its name or one value', () => {
    expect(findings(runs, clean)).toEqual({
      unported: [],
      unknownMarks: [],
      unknownExemptions: [],
      exemptAndPorted: [],
    });
  });

  it('finds an exempt case left out of the adapter: its name dropped from the exemptions', () => {
    expect(
      findings(runs, { ...clean, exempt: { 'per %s (b)': acceptedDifference('Q5') } }).unported,
    ).toEqual(['pending']);
  });

  it('finds a value with neither port nor exemption', () => {
    expect(findings(runs, { ...clean, marked: ['ported'] }).unported).toEqual(['per %s (a)']);
  });

  it('finds a mark naming no case, and a mark on a per-value case naming no value', () => {
    expect(
      findings(runs, { ...clean, marked: [...clean.marked, 'gone', 'per %s'] }).unknownMarks,
    ).toEqual(['gone', 'per %s']);
  });

  it('finds an exemption naming no case or value', () => {
    expect(
      findings(runs, {
        ...clean,
        exempt: { ...clean.exempt, gone: pending('07'), 'per %s (c)': pending('08') },
      }).unknownExemptions,
    ).toEqual(['gone', 'per %s (c)']);
  });

  it('finds a case or value both ported and exempt, an accepted difference among them', () => {
    expect(
      findings(runs, { ...clean, marked: [...clean.marked, 'pending', 'per %s (b)'] })
        .exemptAndPorted,
    ).toEqual(['pending', 'per %s (b)']);
  });

  it('counts an accepted difference as an exemption, never as a port', () => {
    expect(postgresTally(runs, clean)).toEqual({
      ported: 2,
      pending: 1,
      'does not apply': 0,
      'owned elsewhere': 0,
      'accepted difference': 1,
    });
  });

  it('counts each kind of exemption by its kind', () => {
    expect(
      postgresTally(runs, {
        marked: [],
        exempt: {
          ported: doesNotApplyOnPostgres('uuid'),
          pending: ownedElsewhere('rust-host 16'),
          'per %s': acceptedDifference('Q5'),
          'per %s (a)': pending('08'),
        },
      }),
    ).toEqual({
      ported: 0,
      pending: 1,
      'does not apply': 1,
      'owned elsewhere': 1,
      'accepted difference': 1,
    });
  });

  it('finds a binary running the repository table only on a line of its own', () => {
    expect(runsRepositoryCases('mod contract {\n    repository_cases!(Harness);\n}')).toBe(true);
    expect(runsRepositoryCases('// repository_cases!(Harness);')).toBe(false);
    expect(runsRepositoryCases('let text = "repository_cases!(";')).toBe(false);
  });

  it('counts the marks of the table only for an adapter whose own files run it', () => {
    expect(marksOf({ table: ['table case'], own: ['own case'], runsTable: false })).toEqual([
      'own case',
    ]);
    expect(marksOf({ table: ['table case'], own: ['own case'], runsTable: true })).toEqual([
      'table case',
      'own case',
    ]);
  });
});
