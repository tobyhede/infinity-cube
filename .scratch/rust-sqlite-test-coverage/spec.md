# Rust SQLite test coverage

**Why:** Rust-host ticket 15 (`.scratch/rust-host/issues/15-rust-sqlite-store.md`, PRs #520 and #521) requires the Rust SQL repository to answer every `SpaceRepository` method as the memory store does, but its acceptance criteria named only the shared HTTP wire and store-condition cases and four rules (ST-10, ST-126, ST-127, ST-128). The work shipped with far less repository coverage than the TypeScript side. A parity review of PR #521's head (`d5b42c9`, which contains #519 and #520) ran both runtimes' SQLite tests (all green) and differential runs that wrote and read the same files with both runtimes. It found:

- Of the 76 cases in the TypeScript repository contract (`test/support/repository-contract.ts`), all of which run on SQLite, Rust covers 15 fully on SQLite, 22 partly and 38 not at all; 1 does not apply. Exactly one TypeScript property test (the memory-versus-SQLite differential) touches SQLite. Rust has five fixed differential scripts and 15 other repository examples, and no property test of a commit path.
- Behaviour that differs, not only tests that are missing. The ones decided below as defects are the revision ceiling, a file SQLite cannot open, a lone UTF-16 surrogate in a stored document, broken stored states and a partly migrated schema.
- Stored rows are byte-identical between the runtimes for every case compared, and each runtime read every file the other wrote. Nothing in the repository checks either.

**Goal:** parity that CI enforces, not parity by review. TypeScript is the frozen reference: parity means Rust is at least as good as TypeScript wherever TypeScript is right, and nothing here changes TypeScript's behaviour. Every case of the TypeScript repository contract has a Rust port on SQLite, or an exemption giving its reason, and a unit test fails otherwise, as `test/unit/http-conformance-rust-ports.test.ts` already does for the HTTP cases.

## Decisions

Confirmed by the user, 2026-11-24.

- **TypeScript is frozen.** No ticket here changes TypeScript's behaviour or rewrites its contract. A TypeScript test may be added where it is the only way to read what Rust wrote (08).
- **Parity is held by Rust-native ports**, one Rust test per contract case, each carrying `// Case: <contract case name>`, and a ports unit test over the contract (03). There is no shared case corpus.
- **Five Rust defects are fixed, failing test first, on the rust-host/15 branches (#520, #521) before they merge** (01):
  - **Revision ceiling.** `Revision::next` holds at 2^63−1 instead of failing, so a commit from a Space at the ceiling succeeds without the revision moving and a second writer's commit overwrites the first. ST-6 says each update adds one. Such a commit is refused as an invariant failure.
  - **A file SQLite cannot open** (code 14: a directory, a file removed under the host, lost permissions) is an unclassified failure, not unavailable: answered 500, and start-up stops after the confirming retry (ST-10). `serve` refuses a `SQLITE_PATH` that is not a regular file before it takes a port (ST-126 gains the clause).
  - **Text that is not well-formed Unicode** (a lone UTF-16 surrogate) is refused where it enters Rust, at the HTTP body decode and at Import, with a named refusal, not a 500. Rust's strict read of a stored document stands.
  - **Broken stored states** (a Meta id that is not a UUID, a Meta id naming no Space, a non-canonical revision, `load_space` on a row failing intake) are invariant failures (ST-7). Rust already classifies them so; it gains a test for each.
  - **A schema missing a table** is broken stored state (500), not uninitialized.
- **Accepted differences**, recorded and not fixed:
  - A commit's answer does not depend on the order of its changes. Rust and both memory stores commit a Resource move that lists the receiving Space first; the TypeScript SQL writer refuses it (contract case "writes a moved Resource through the ownership check, which refuses it before its Space releases it"). The browser never sends a move, so this is one sentence in the Storage requirement, not an ADR, and that case is exempt from the ports test.
  - `infinity-cube serve --store sqlite` answers requests before its first start-up attempt ends (ST-10, ST-120); the TypeScript host holds them.
  - Against another process's lock, Rust's `BEGIN IMMEDIATE` waits out the busy timeout before answering 503 where TypeScript fails at once. ST-127 allows both; Rust pins its own timing (10).
- **Glossary:** three terms for store failures go into `CONTEXT.md` (02): **Invariant failure** (stored state contradicts itself; answered 500; start-up stops once a retry confirms it), **Unavailable** (the store cannot answer now; answered 503; start-up keeps retrying) and **Unclassified failure** (any other store failure; answered 500).
- **No coverage floor.** The `crap-rust` CI job already measures Rust coverage with `cargo llvm-cov`; the ports test is the parity table.

## Open questions

Low-severity differences the review found that no decision covers yet. Each needs the user's answer, accepted with a reason or made a defect, before 05 or 11 closes.

- `list_spaces` still lists a Space whose document fails intake; TypeScript's `listSpaces` fails for every Space.
- A document stored as a BLOB is read by Rust and refused by TypeScript.
- Replacing an Aggregate deletes orphan Resource rows in Rust and leaves them in TypeScript.
- Rust holds one connection for the process lifetime; TypeScript opens one per operation.
- `SQLITE_PATH`: Rust reads it only from the environment (no `.env`), refuses `x/missing/../y.db` and a parent that is a regular file where TypeScript accepts both, and mangles a non-UTF-8 path.
- Invalid Default Content: Rust stops at once; TypeScript waits one retry first.

## Not in scope

Any change to the HTTP contract, the browser application, or the TypeScript repository's behaviour or contract. The Rust PostgreSQL store (rust-host 16). A coverage floor.

## Source

The parity review: the verification report and its evidence (case map, differential runs, commands) are in the project's review folder `reviews/rust-sqlite-parity-audit-2026-11-24/`, with the decisions in `decisions.md`.
