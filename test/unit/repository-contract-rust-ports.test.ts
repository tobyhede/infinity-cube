import { describe, expect, it } from 'vitest';

import { casesOf, filesUnder, markedIn } from '../support/case-names';

/*
 * The TypeScript repository contract (`test/support/repository-contract.ts`)
 * runs on SQLite, and so do the TypeScript SQLite files beside it. The Rust
 * SQLite repository is held to each of their cases by a Rust test carrying
 * the line `// Case: <name>` above it in one of the Rust files below, or by an
 * exemption here: **pending**, naming the ticket of
 * `.scratch/rust-sqlite-test-coverage/` that ports it, or **does not apply**,
 * saying why it cannot. TypeScript is the reference; nothing here changes it.
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
  ...filesUnder('crates/host/src', (name) => name.endsWith('.rs')),
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

/** The tickets a pending case may name: none is open, so no case may be pending. */
const TICKETS: readonly string[] = [];
type Ticket = string;

type Exemption =
  | { readonly kind: 'pending'; readonly ticket: Ticket }
  | { readonly kind: 'does not apply'; readonly reason: string };

const pending = (ticket: Ticket): Exemption => ({ kind: 'pending', ticket });
const doesNotApply = (reason: string): Exemption => ({ kind: 'does not apply', reason });

const ROW_LOCK =
  'the TypeScript repository reads a Space and then takes its row lock, so another writer can change the rows between the two; the Rust repository reads and writes inside one `BEGIN IMMEDIATE` transaction holding the write lock from its start, so no row changes between its read and its write';

const EXEMPT = {
  // The contract.
  'writes a moved Resource through the ownership check, which refuses it before its Space releases it':
    doesNotApply(
      "a commit's answer does not depend on the order of its changes (ADR 0176, Storage ST-20): the Rust repository commits the move this case has the TypeScript SQL writer refuse, which `commits_a_move_whichever_space_it_lists_first` in `crates/host/tests/repository_contract/commits.rs`, not a port, holds on the memory store and SQLite",
    ),
  "stores a * commit's whole snapshot over Resource rows recreated before its row lock (topology-preserving)":
    doesNotApply(ROW_LOCK),
  "stores a * commit's whole snapshot over Resource rows recreated before its row lock (complete-aggregate)":
    doesNotApply(ROW_LOCK),

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

  it('gives each exemption a ticket that ports it or a reason it does not apply', () => {
    const malformed = Object.entries(EXEMPT).filter(([, exemption]) =>
      exemption.kind === 'pending'
        ? !TICKETS.includes(exemption.ticket)
        : exemption.reason.trim().length === 0,
    );
    expect(malformed).toEqual([]);
  });
});

describe('the port check', () => {
  const cases = ['ported', 'pending', 'inapplicable'];
  const clean: Marks = {
    marked: ['ported', 'an HTTP case'],
    exempt: { pending: pending('11'), inapplicable: doesNotApply('why') },
    elsewhere: ['an HTTP case'],
  };

  it('finds nothing wrong with a case ported once, or exempted either way', () => {
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
      findings(cases, { ...clean, exempt: { ...clean.exempt, gone: pending('11') } })
        .unknownExemptions,
    ).toEqual(['gone']);
  });

  it('finds a case both exempted and ported', () => {
    expect(
      findings(cases, { ...clean, exempt: { ...clean.exempt, ported: doesNotApply('why') } })
        .exemptAndPorted,
    ).toEqual(['ported']);
  });

  it('tells a pending exemption from one that does not apply', () => {
    expect(pending('11')).toEqual({ kind: 'pending', ticket: '11' });
    expect(doesNotApply('why')).toEqual({ kind: 'does not apply', reason: 'why' });
  });
});
