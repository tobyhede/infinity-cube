import { describe, expect, it } from 'vitest';

import { casesOf, filesUnder, markedIn, readRepositoryFile } from '../support/case-names';

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
  // which this test does not read; rust-postgresql-store 03 holds them.
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

const VALUES_BY_CASE = new Map(Object.entries({ ...VALUES, ...OUTSIDE_VALUES }));

/** A case as it runs: each value of a looped case named apart. */
const runsOf = (name: string): string[] =>
  (VALUES_BY_CASE.get(name) ?? [undefined]).map((value) =>
    value === undefined ? name : `${name} (${value})`,
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
    'a PostgreSQL error code: the Rust host has no PostgreSQL store yet (rust-host 16), and SQLite raises no such code',
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
const CONTRACT_RUNS = CONTRACT_CASES.flatMap(runsOf);

/** The cases outside the contract, by file, as they run. */
const OUTSIDE_CASES = Object.fromEntries(
  OUTSIDE.map((file) => [file, casesOf(file).flatMap(runsOf)]),
);

const CASES = [...CONTRACT_RUNS, ...Object.values(OUTSIDE_CASES).flat()];

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
  /^repository_cases!\([^,()]+,\s*every_member\s*\);$/mu.test(source) &&
  source.split('repository_cases!').length === 2;

/** The SQL repository, whose Resource writes a test records. */
const SQL_REPOSITORY = 'crates/host/src/sql.rs';

/**
 * The functions of the SQL repository that may ask the store of statements to
 * write a Resource row, each with the statement it may ask for: the two that
 * record the write, and the recreation hook, whose writes are a test's own.
 */
const RESOURCE_WRITERS: Readonly<Record<string, readonly string[]>> = {
  insert_resource: ['insert_resource'],
  upsert_resource: ['upsert_resource'],
  recreate_before_row_lock: ['insert_resource'],
};

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
    return statement === undefined || RESOURCE_WRITERS[within]?.includes(statement) === true
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

  it('finds a table run in the form that fails a case its harness cannot provide for', () => {
    expect(runsEveryMember('repository_cases!(super::Sqlite, every_member);')).toBe(true);
    expect(runsEveryMember('repository_cases!(super::Sqlite);')).toBe(false);
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
