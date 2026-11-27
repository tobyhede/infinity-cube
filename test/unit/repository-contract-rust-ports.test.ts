import { describe, expect, it } from 'vitest';

import {
  casesOf,
  describedCasesIn,
  filesUnder,
  markedIn,
  readRepositoryFile,
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
 * written `*`. A contract case written once and run for several values names
 * each value: its Rust ports carry `// Case: <name> (<value>)`, one per value.
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
  // which the PostgreSQL adapter below holds, not this list.
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

const VALUES_BY_CASE = new Map(Object.entries(VALUES));

/** Why a case does not apply to the Rust SQLite repository. */
interface Exemption {
  readonly reason: string;
}

const doesNotApply = (reason: string): Exemption => ({ reason });

const ROW_LOCK =
  'the TypeScript repository reads a Space and then takes its row lock, so another writer can change the rows between the two; the Rust repository reads and writes inside one `BEGIN IMMEDIATE` transaction holding the write lock from its start, so no row changes between its read and its write';

const EXEMPT = {
  // The contract.
  'writes a moved Resource through the ownership check, which refuses it before its Space releases it':
    doesNotApply(
      "a commit's answer does not depend on the order of its changes (ADR 0176, Storage ST-20): the Rust repository commits the move this case has the TypeScript SQL writer refuse, which `commits_a_move_whichever_space_it_lists_first` in `crates/host/tests/repository_contract/commits.rs`, not a port, holds on the memory store and SQLite",
    ),

  // test/integration/sqlite-space-repository.test.ts
  'names a statement PostgreSQL aborted for contention unavailable': doesNotApply(
    'a PostgreSQL error code: the Rust host has no PostgreSQL store yet (rust-host 16), and SQLite raises no such code',
  ),
  'refuses a %s-path commit whose row moved before the lock, writing no Resource':
    doesNotApply(ROW_LOCK),

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
const CONTRACT_RUNS = CONTRACT_CASES.flatMap((name) =>
  (VALUES_BY_CASE.get(name) ?? [undefined]).map((value) =>
    value === undefined ? name : `${name} (${value})`,
  ),
);

const OUTSIDE_CASES = Object.fromEntries(OUTSIDE.map((file) => [file, casesOf(file)]));

const CASES = [...CONTRACT_RUNS, ...Object.values(OUTSIDE_CASES).flat()];

const HTTP_CASES = HTTP_CASE_FILES.flatMap(casesOf);

/** The module whose `repository_cases!` table runs the contract's Rust cases. */
const CONTRACT_TABLE = 'crates/host/tests/repository_contract/mod.rs';

/** The SQLite store's `Harness`, which runs the table on SQLite. */
const SQLITE_HARNESS = 'crates/host/tests/sqlite_contract.rs';

/**
 * The places `source`, a store's `Harness`, answers that it cannot provide a
 * member. A case needing such a member reports a skip rather than running, so
 * its `// Case:` line ports nothing on that store: while this finds none on
 * SQLite, every marked case runs there, and a member SQLite cannot provide
 * must list the cases needing it as exemptions before it may answer so.
 */
const unprovidedIn = (source: string): string[] =>
  source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /\bErr\(|\bUnprovided\(/u.test(line));

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

interface Marks {
  /** The case names the Rust files mark. */
  readonly marked: readonly string[];
  readonly exempt: Readonly<Record<string, Exemption>>;
  /** Names a mark may carry that are another ports test's cases. */
  readonly elsewhere: readonly string[];
}

/** What is wrong with the marks and exemptions against `cases`. */
const findings = (cases: readonly string[], { marked, exempt, elsewhere }: Marks) => ({
  unported: cases.filter((name) => !marked.includes(name) && !(name in exempt)),
  unknownMarks: marked.filter((name) => !cases.includes(name) && !elsewhere.includes(name)),
  unknownExemptions: Object.keys(exempt).filter((name) => !cases.includes(name)),
  exemptAndPorted: Object.keys(exempt).filter((name) => marked.includes(name)),
});

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
 * The adapter's own files are where its ports are written. The table's marks
 * count as ports only once one of them runs it by invoking
 * `repository_cases!(`: the table runs no case on PostgreSQL until then.
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

interface PostgresMarks {
  /** The runs the adapter's files mark. */
  readonly marked: readonly string[];
  readonly exempt: Readonly<Record<string, PostgresExemption>>;
  /** Names a mark may carry that are another ports test's cases. */
  readonly elsewhere: readonly string[];
}

/** The exemption deciding `run`: one naming its value, or else its case's. */
const exemptionOf = (
  { name, run }: Run,
  exempt: Readonly<Record<string, PostgresExemption>>,
): PostgresExemption | undefined => exempt[run] ?? exempt[name];

/** What is wrong with the PostgreSQL adapter's marks and exemptions against `runs`. */
const postgresFindings = (runs: readonly Run[], { marked, exempt, elsewhere }: PostgresMarks) => ({
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
  { marked, exempt }: Pick<PostgresMarks, 'marked' | 'exempt'>,
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
  // Found by the plan's cold audit (00).
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
  ...CONTRACT_CASES.map((name) => ({ name, perValue: VALUES_BY_CASE.has(name) })),
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

const POSTGRES_RUNS = runsOf(POSTGRES_CASES, POSTGRES_VALUES);

const CHANGE_ORDER =
  "a commit's answer does not depend on the order of its changes (ADR 0176, Storage ST-20; carried over from #528)";

const POSTGRES_EXEMPT = {
  // The contract: the table (02), run on PostgreSQL by 06.
  ...exemptEach(
    [
      'preserves the established aggregate across a fresh repository host',
      'persists first-working-load initialization for a fresh repository host',
      'replaces * stored state through the destructive lifecycle door',
      "names a broken stored document broken stored state on the single-Space fast path, and leaves loadSpace's answer narrower",
      'truncates stored Spaces without a Meta identity only when none was expected',
      'initializes and replaces only through explicit Meta-rooted aggregates',
      'classifies canonical and different initialization proposals',
      'refuses a replacement proposal naming a Meta Space it does not hold',
      'ignores object-key insertion order when classifying initialization',
      'lets only one different concurrent initialization establish state',
      'rolls back a refused replacement',
      'refuses replacement before initialization',
      'reads the stored Meta identity as each lifecycle door leaves it',
      'refuses a replacement expecting no Meta identity where one is stored',
      'refuses a replacement authorized against a superseded Meta identity',
      'refuses to record an exported revision for a Space it does not store',
      'refuses an aggregate that repeats a Space identity, storing none of it',
      'refuses an aggregate that repeats a Resource identity, storing none of it',
      'refuses a replacement that repeats a * identity, keeping the stored aggregate',
      'refuses an initialization that fails domain intake, storing none of it',
      'replaces everything stored, freeing the Resource ids it clears',
      'raises an identifiable invariant failure for a stored Space whose revision is not canonical',
      'becomes committable from an empty store',
      'stores and reloads an Image Resource unchanged',
      'stores and reloads an Ur Resource and a Reference Resource to it unchanged',
      'stores, renames and reloads a Resource whose plugin is missing unchanged',
      'carries a Resource whose plugin is missing through Import and Export byte-identical',
      'hands a Resource whose plugin is missing to that plugin when it returns',
      'refuses a topology-preserving update when stored Spaces have no Meta identity',
      'stores an initialized Space, then lists, loads and commits it',
      "keeps an Edge's Title and hidden flag through initialization, commit and load",
      "keeps a Graph's head shape through initialization, commit and load",
      "keeps every Resource's Map content through initialization, commit and load",
      "keeps every Resource through a topology-preserving commit's own delete",
      'refuses to create a new unreachable Space by removing its last reference alone',
      'atomically creates, links, reads, converges on, and deletes a Space',
      'refuses an authored commit that deletes the Meta Space',
      "keeps each Space Resource's own selection across a later default Map change",
      'reports every conflict and rolls back every refused aggregate',
      'answers a stale expected revision with the current aggregate',
      'refuses a commit that fails domain intake and stores nothing',
      'refuses a commit for a Space it does not store',
      'refuses a commit whose Space id differs from its snapshot id',
      'refuses an update whose snapshot names another stored Space at a matching revision',
      "places a single update's failed intake at its Space's position in the aggregate",
      'refuses a commit that names one Space more than once',
      'refuses a commit claiming a Resource another Space owns',
      'scopes Graph identities to their containing Space',
      'refuses an unreferenced ordinary Space even when its Graph identity is reused',
      'permits a Graph and Resource to share an identity',
      'refuses two Maps in one Space that own the same Graph identity',
      'keeps the Resources a commit names and drops the ones it omits',
      'drops every Resource when a commit omits them all',
      "returns a Space's Resources in ascending id order however they were supplied",
      'records an exported revision and carries it across later commits',
      'refuses to mark an exported revision above the storage ceiling',
      'stores and commits a revision above Number.MAX_SAFE_INTEGER as canonical decimal text',
      'refuses to store a revision above the 2^63-1 ceiling',
      'raises an identifiable invariant failure for a stored Space whose revision exceeds the 2^63-1 ceiling',
      'raises an identifiable invariant failure for a commit whose fast-path candidate has a non-canonical stored revision',
      'writes only the Resource a topology-preserving commit changed',
      'writes only the new and changed Resources on the complete-aggregate path',
      'writes no Resource for a commit at a stale revision',
      'moves an unchanged Resource between Spaces in one commit',
      "stores a * commit's whole snapshot over Resource rows recreated before its row lock",
      'stores an asset of any type and loads its bytes and media type unchanged',
      'holds a Markdown Resource decoded from its file, and its text, as the same value',
      'stores the same bytes once, keeping the first media type',
      'answers an asset it does not store as absent',
      'holds the asset of zero bytes already, under the type it always has',
      'keeps stored assets outside the aggregate its lifecycle doors replace',
      'keeps a stored asset across a fresh repository host',
    ],
    pending('06'),
  ),
  'writes a moved Resource through the ownership check, which refuses it before its Space releases it':
    acceptedDifference(CHANGE_ORDER),

  // test/integration/postgres-space-repository.test.ts
  ...exemptEach(
    [
      'refuses a write of text that is not JSON into spaces.document',
      'settles two overlapping truncations of Spaces stored without Meta as results',
      'classifies initialization when a concurrent winner takes a shared Resource identity',
      'conflicts when an authored commit wins after replacement reads its baseline',
      'conflicts the loser when two replacements overlap on the Meta row lock',
      'conflicts a replacement authorized against an identity a concurrent replacement retired',
      'judges a complete-aggregate commit against an identity a concurrent replacement retired',
      "rolls back an earlier row's relock placeholder when a later row in the same replacement conflicts",
      'prevents direct deletion of the Meta Space while repository state names it',
      'commits a topology-preserving edit without waiting for the repository singleton lock',
      'refuses an unlocked single-Space write whose row moved after it read the revision',
      'refuses a multi-Space write whose row moved after the conflict check read it',
      'serializes concurrent topology commits so the loser observes the complete winner',
    ],
    pending('07'),
  ),

  // test/integration/postgres-aggregate-initialization.test.ts
  ...exemptEach(
    [
      'preserves the successful proposal when another initializer already read an empty aggregate',
      'does not replace a concurrent first aggregate using an absent expected Meta identity',
      'reads a consistent uninitialized aggregate while another runtime initializes it',
      'judges a complete-aggregate commit against the aggregate a concurrent initializer establishes',
      'initializes without losing integrity after $boundary with $expected competing proposal',
    ],
    pending('07'),
  ),

  // test/integration/postgres-misconfiguration.test.ts
  ...exemptEach(
    [
      'leaves the transactional aggregate read unclassified with the raw handshake refusal',
      'leaves a direct read unclassified with the normalised refusal',
      'gives up once a second attempt confirms the refusal',
    ],
    pending('08'),
  ),

  // test/integration/prisma-postgres.test.ts
  ...exemptEach(
    [
      'writes and reads a typed space document with its resource',
      'advances updatedAt when a space is updated',
    ],
    pending('05'),
  ),

  // test/unit/postgres-unreachable.test.ts
  ...exemptEach(
    [
      'names the aggregate read unavailable, keeping the driver error on cause',
      'names a commit unavailable',
      'names establishment unavailable',
      'names %s unavailable, keeping the refusal on the cause chain',
      'reaches the database on the next read rather than repeating the first failure',
      'leaves SQLSTATE %s unclassified inside and outside a transaction',
      'names SQLSTATE %s unavailable inside and outside a transaction',
      'answers a refused connection on a direct read 503 persistence-unavailable',
      'answers a wrong password on a direct read 500 internal-error',
    ],
    pending('08'),
  ),

  // test/unit/postgres-aggregate-lock-key.test.ts
  'is the same key in the exclusive and the shared mode': pending('07'),

  // test/unit/prisma-postgres-env-path.test.ts
  'names the root .env from the bundled runtime and from the source alike': acceptedDifference(
    'Q7: Rust searches for the nearest `.env` from the current directory, having no module directory',
  ),
  'prefers the nearest .env above the starting directory': pending('05'),
  'answers undefined rather than a path no file sits at': pending('05'),
  'starts from this module’s own directory when given no starting point': acceptedDifference(
    'Q7: Rust starts its search from the current directory',
  ),

  // test/support/fast-path-races.ts
  ...exemptEach(
    [
      'commits a Map-internal Edit under the shared aggregate lock only',
      'serialises a Map-internal Edit that read first before a Graph deletion that reads after',
      'serialises a Graph deletion that read first before a Map-internal Edit that reads after',
      'keeps a replacement that recreates a Space at revision 0 from landing between a fast-path read and its write',
      'keeps a Space deletion from passing at a revision a written but uncommitted fast path has moved',
      'lets Map-internal Edits to different Spaces commit side by side where the store runs commits concurrently',
    ],
    pending('12'),
  ),

  // test/unit/sql-connection-failure.test.ts, its `postgresSqlStore.isUnavailable` describe
  ...exemptEach(
    [
      'recognises %s whatever its transient flag says',
      'recognises the socket failure %s the driver normalised',
      'leaves a host name that does not resolve unclassified when the driver normalised it',
      'recognises SQLSTATE %s on a statement the driver normalised',
      'names the set ticket 31 records',
      'recognises SQLSTATE %s raised while connecting',
      'leaves SQLSTATE %s raised while connecting unclassified',
      'recognises the socket failure %s',
      'leaves the error code %s unclassified',
      'walks the cause chain to %s',
      'terminates on a cyclic cause chain',
      'leaves a defect, an unknown code and a code named only in prose unclassified',
    ],
    pending('08'),
  ),
  'recognises the socket failure %s (EAI_AGAIN)': acceptedDifference(
    'Q5: a temporary resolver failure and a name that does not resolve reach Rust alike, as `Io(Uncategorized)` with no OS error, so Rust leaves both unclassified',
  ),

  // test/unit/database-startup.test.ts, its PostgreSQL describe
  ...exemptEach(
    [
      'gives up on a wrong password once a second attempt confirms it',
      'keeps waiting out too many connections past the confirming limit',
    ],
    pending('08'),
  ),

  // test/integration/aggregate-commit-differential.test.ts
  'gives memory and PostgreSQL the same public outcome over generated aggregate changes':
    pending('11'),

  // test/integration/database-http-runtime.test.ts
  ...exemptEach(
    [
      'establishes Default Content and serves the collection and Meta Space',
      'recovers through the shared retry after a transient startup failure',
      'gives up through the shared retry after two confirmed invariant failures',
    ],
    pending('09'),
  ),

  // test/unit/vite-hono-host.test.ts, its PostgreSQL case
  'composes an application when the repository cannot be reached': pending('09'),

  // test/unit/prisma-foundation.test.ts
  'advances %s.updatedAt when a record is updated': pending('05'),
  ...exemptEach(
    [
      'omits a database connection when DATABASE_URL is blank',
      'trims a configured DATABASE_URL',
      'constructs the runtime client without a blank DATABASE_URL binding',
    ],
    pending('09'),
  ),
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

/** An adapter: the table, and the files its own ports are written in. */
interface Port {
  readonly name: string;
  /** The contract's table, whose marks count once a file of the adapter runs it. */
  readonly table: readonly string[];
  /** The adapter's own files. */
  readonly files: readonly string[];
  readonly exempt: Readonly<Record<string, PostgresExemption>>;
}

const POSTGRES: Port = {
  name: 'the Rust PostgreSQL repository',
  table: filesUnder('crates/host/tests/repository_contract', (name) => name.endsWith('.rs')),
  // Each ticket adds the files it creates: `crates/host/tests/postgres*.rs`
  // from 05, `crates/cli/tests/serve_postgres.rs` from 09.
  files: [],
  exempt: POSTGRES_EXEMPT,
};

const POSTGRES_MARKED = marksOf({
  table: markedIn(POSTGRES.table),
  own: markedIn(POSTGRES.files),
  runsTable: POSTGRES.files.some((file) => runsRepositoryCases(readRepositoryFile(file))),
});

describe('the repository cases the Rust SQLite repository is held to', () => {
  it('give the contract its 73 cases, three of them run for two values each', () => {
    expect(CONTRACT_CASES).toHaveLength(73);
    expect(CONTRACT_RUNS).toHaveLength(76);
    expect(Object.keys(VALUES).filter((name) => !CONTRACT_CASES.includes(name))).toEqual([]);
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
  const found = findings(CASES, {
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
    expect(harness).toContain('repository_cases!(');
    expect(unprovidedIn(harness)).toEqual([]);
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

  it('give the adapter 193 runs, one per value of each case run once per value', () => {
    expect(POSTGRES_RUNS).toHaveLength(193);
  });
});

describe('the Rust PostgreSQL repository', () => {
  const found = postgresFindings(POSTGRES_RUNS, {
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

  it('runs no table case yet, so every case not otherwise exempt is pending', () => {
    expect(
      postgresTally(POSTGRES_RUNS, { marked: POSTGRES_MARKED, exempt: POSTGRES.exempt }),
    ).toEqual({
      ported: 0,
      pending: 179,
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
  const cases = ['ported', 'inapplicable'];
  const clean: Marks = {
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

  it('finds a harness member answering that it is not provided', () => {
    const source = [
      'async fn reopen(&mut self) -> Result<(), Unprovided> {',
      '    Ok(())',
      '}',
      'const NO_ROWS: Unprovided = Unprovided("no rows");',
      'async fn take_resource_writes(&mut self) -> Result<Vec<String>, Unprovided> {',
      '    Err(NO_ROWS)',
      '}',
    ].join('\n');
    expect(unprovidedIn(source)).toEqual([
      'const NO_ROWS: Unprovided = Unprovided("no rows");',
      'Err(NO_ROWS)',
    ]);
    expect(unprovidedIn(source.split('\n').slice(0, 3).join('\n'))).toEqual([]);
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
      { name: 'names %s', line: 2, describes: ['postgres'], perValue: true },
      { name: 'shared name', line: 3, describes: ['postgres'], perValue: false },
      { name: 'shared name', line: 6, describes: ['sqlite'], perValue: false },
      { name: 'runs per value', line: 10, describes: ['given %s', 'inner'], perValue: true },
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
});

describe('the PostgreSQL port check', () => {
  const cases: readonly DescribedCase[] = [
    { name: 'ported', line: 1, describes: [], perValue: false },
    { name: 'pending', line: 2, describes: [], perValue: false },
    { name: 'per %s', line: 3, describes: [], perValue: true },
  ];
  const values = { 'per %s': ['a', 'b'] };
  const runs = runsOf(cases, values);
  const clean: PostgresMarks = {
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
    expect(postgresFindings(runs, clean)).toEqual({
      unported: [],
      unknownMarks: [],
      unknownExemptions: [],
      exemptAndPorted: [],
    });
  });

  it('finds an exempt case left out of the adapter: its name dropped from the exemptions', () => {
    expect(
      postgresFindings(runs, { ...clean, exempt: { 'per %s (b)': acceptedDifference('Q5') } })
        .unported,
    ).toEqual(['pending']);
  });

  it('finds a value with neither port nor exemption', () => {
    expect(postgresFindings(runs, { ...clean, marked: ['ported'] }).unported).toEqual([
      'per %s (a)',
    ]);
  });

  it('finds a mark naming no case, and a mark on a per-value case naming no value', () => {
    expect(
      postgresFindings(runs, { ...clean, marked: [...clean.marked, 'gone', 'per %s'] })
        .unknownMarks,
    ).toEqual(['gone', 'per %s']);
  });

  it('finds an exemption naming no case or value', () => {
    expect(
      postgresFindings(runs, {
        ...clean,
        exempt: { ...clean.exempt, gone: pending('07'), 'per %s (c)': pending('08') },
      }).unknownExemptions,
    ).toEqual(['gone', 'per %s (c)']);
  });

  it('finds a case or value both ported and exempt, an accepted difference among them', () => {
    expect(
      postgresFindings(runs, { ...clean, marked: [...clean.marked, 'pending', 'per %s (b)'] })
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
