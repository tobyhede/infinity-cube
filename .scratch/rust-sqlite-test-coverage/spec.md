# Rust SQLite test coverage

**Why:** Rust-host ticket 15 (`.scratch/rust-host/issues/15-rust-sqlite-store.md`, PRs #520 and #521) requires the Rust SQL repository to answer every `SpaceRepository` method as the memory store does, but its acceptance criteria named only the shared HTTP wire and store-condition cases and four rules (ST-10, ST-126, ST-127, ST-128). The work shipped with far less repository coverage than the TypeScript side. A parity review of PR #521's head (`d5b42c9`, which contains #519 and #520) ran both runtimes' SQLite tests (all green) and differential runs that wrote and read the same files with both runtimes. It found:

- Of the 76 cases in the TypeScript repository contract (`test/support/repository-contract.ts`: 73 `it` calls, three of them in two-item loops), all of which run on SQLite, Rust covers 15 fully on SQLite, 27 partly and 31 not at all; 3 do not apply. Four of the 15 are held only by comparing SQLite with the memory store, which cannot catch a defect both share. Exactly one TypeScript property test (the memory-versus-SQLite differential) touches SQLite. Rust has five fixed differential scripts and 15 other repository examples, and no property test of a commit path.
- **No Rust test commits to SQLite through the aggregate write path.** Replacing the `CommitDecision::Write` branch of the SQL repository's `commit` (`crates/host/src/sql.rs`) with `std::process::abort()` leaves every Rust test green: the SQLite tests commit only single-Space updates on the fast path and refused commits. Every Space create, delete, multi-Space update and Resource move is untested on SQLite, which is why a no-op delete passed. A second review ran 51 hand-made mutants of the Rust SQLite store; 26 survived (review folder below, `rust-sqlite-coverage-fresh-2026-11-25/`).
- Behaviour that differs, not only tests that are missing. The ones decided below as defects are the revision ceiling, a SQLite file that is not a regular file, a partly migrated schema, a document stored as a BLOB, a `SQLITE_PATH` that is not UTF-8, and a broken Space hiding every other Space from the list.
- Stored rows are byte-identical between the runtimes for every case compared, and each runtime read every file the other wrote. Nothing in the repository checks either.

**Goal:** parity that CI enforces, not parity by review. TypeScript is the frozen reference: parity means Rust is at least as good as TypeScript wherever TypeScript is right, and nothing here changes TypeScript's behaviour. Every case of the TypeScript repository contract has a Rust port on SQLite, or an exemption giving its reason, and a unit test fails otherwise, as `test/unit/http-conformance-rust-ports.test.ts` already does for the HTTP cases.

## Decisions

Confirmed by the user, 2026-11-24.

- **TypeScript is frozen.** No ticket here changes TypeScript's behaviour or rewrites its contract. A TypeScript test may be added where it is the only way to read what Rust wrote (08).
- **Parity is held by Rust-native ports**, one Rust test per contract case, each carrying `// Case: <contract case name>`, and a ports unit test over the contract (03). There is no shared case corpus.
- **Six Rust defects are fixed, failing test first, on the rust-host/15 branches (#520, #521) before they merge** (01):
  - **Revision ceiling.** `Revision::next` holds at 2^63−1 instead of failing, so a commit from a Space at the ceiling succeeds without the revision moving and a second writer's commit overwrites the first. ST-6 says each update adds one. Such a commit is refused as an invariant failure.
  - **A file SQLite cannot open is split by cause** (decided 2026-11-25). A file that does not exist stays **unavailable**, as ST-126 already says: start-up keeps retrying and opens it once it exists. Anything else SQLite answers with code 14 (`SQLITE_CANTOPEN`) for, a directory or a file the process may not read, is an **unclassified failure**: answered 500, and start-up stops after the confirming retry (ST-10). `serve` refuses a `SQLITE_PATH` that is not a regular file before it takes a port (ST-126 gains the clause). An unlinked file is not among them: the one connection keeps reading it.
  - **A schema missing a table** (`spaces`, `resources` or `repository_state`) is broken stored state (500), not uninitialized. Today the emptiness check reads only `spaces`.
  - **A document stored as a BLOB** is broken stored state, as TypeScript answers it. Rust reads it today through `CAST(document AS TEXT)`.
  - **A `SQLITE_PATH` that is not valid UTF-8** is refused by `serve` with a message naming `SQLITE_PATH`, before it takes a port. Today it is converted lossily and opens a file of the mangled name if one exists.
  - **One broken Space hides every other Space from the list** (see Settled questions). Rust lists a Space whose document fails intake only while that document is JSON holding a string `title`; a document that is not JSON, has no title, or holds a lone UTF-16 surrogate makes `list_spaces` fail for every Space.
- **Already right in Rust, and only tested** (05): text that is not well-formed Unicode is refused where it enters (the HTTP body decode answers 400 `invalid-request`, held on SQLite by the wire case "answers 400 invalid-request for a lone surrogate escape, as for malformed JSON"; Import refuses it as `invalid-json`, held by the corpus case `invalid-json-lone-surrogate`), and a stored one is broken stored state. The broken stored states (a Meta id that is not a UUID, a Meta id naming no Space, a non-canonical exported revision, `load_space` on a row failing intake) are invariant failures (ST-7); three of the four are tested in neither runtime.
- **Accepted differences**, recorded and not fixed:
  - A commit's answer does not depend on the order of its changes. Rust and both memory stores commit a Resource move that lists the receiving Space first; the TypeScript SQL writer refuses it (contract case "writes a moved Resource through the ownership check, which refuses it before its Space releases it"). The browser never sends a move, so this is one sentence in the Storage requirement, not an ADR, and that case is exempt from the ports test.
  - `infinity-cube serve --store sqlite` answers requests before its first start-up attempt ends (ST-10, ST-120); the TypeScript host holds them.
  - Against another process's *reserved* lock, Rust's `BEGIN IMMEDIATE` waits out the busy timeout before answering 503 where TypeScript fails at once. Against shared and exclusive locks both wait (`test/integration/sqlite-contention.test.ts`). ST-127 allows both; Rust pins its own timing (10).
- **Glossary:** three terms for store failures go into `CONTEXT.md` (02): **Invariant failure** (stored state contradicts itself; answered 500; start-up stops once a retry confirms it), **Unavailable** (the store cannot answer now; answered 503; start-up keeps retrying) and **Unclassified failure** (any other store failure; answered 500).
- **No coverage floor.** The `crap-rust` CI job already measures Rust coverage with `cargo llvm-cov`; the ports test is the parity table.

## Settled questions

Low-severity differences the review found, answered by the user on 2026-11-25.

- **A Space whose document fails intake stays listed.** `list_spaces` lists it; TypeScript's `listSpaces` failing for every Space is not followed. One broken Space must not hide every other Space from `GET /api/spaces` and the picker that links an existing Space. Opening or linking the broken one answers broken stored state, which names it. Rust does this today only for a JSON document with a string title; 01 extends it to every broken document and records in ST-7 how one with no readable title is listed, and 05 tests every shape.
- **A document stored as a BLOB is broken stored state.** Rust will refuse it as TypeScript does. A defect, fixed in 01.
- **Replacing an Aggregate deletes orphan Resource rows.** Accepted: Rust's behaviour is the requirement.
- **Rust holds one connection for the process lifetime.** Accepted.
- **`SQLITE_PATH`.** Reading it only from the environment (no `.env`) and refusing `x/missing/../y.db` and a parent that is a regular file are accepted. A path that is not valid UTF-8 is a defect: `serve` refuses it with a message naming `SQLITE_PATH`, before it takes a port. Fixed in 01.
- **Invalid Default Content stops start-up at once.** Accepted: no confirming retry.

## Not in scope

Any change to the HTTP contract, the browser application, or the TypeScript repository's behaviour or contract. The Rust PostgreSQL store (rust-host 16). A coverage floor.

## Source

The parity review: the verification report and its evidence (case map, differential runs, commands) are in the project's review folder `reviews/rust-sqlite-parity-audit-2026-11-24/`, with the decisions in `decisions.md`. The second, independent review (contract map, mutants and their survivors, a claim-by-claim check of this spec) is in `reviews/rust-sqlite-coverage-fresh-2026-11-25/`.
