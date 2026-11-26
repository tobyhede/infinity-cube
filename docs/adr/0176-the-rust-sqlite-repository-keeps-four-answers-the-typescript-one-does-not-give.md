# The Rust SQLite repository keeps four answers the TypeScript one does not give

Status: accepted
Date: 2026-11-26
Refines: 0095, 0155
Related: 0078, 0094, 0160

ADR 0155 has the Rust host serve the HTTP contract unchanged behind one storage trait, and ADR 0095 has every SQL database share one repository, so the TypeScript SQL repository is the reference the Rust one is held to. A parity review of the Rust SQLite store (rust-sqlite-test-coverage, 24 and 25 November 2026) found four places where the two answer differently and the Rust answer is the one to keep. The maintainer ruled on them on 24 and 25 November 2026. The TypeScript repository is frozen while the TypeScript hosts still run: no ticket of that work changes its behaviour or its repository contract (`test/support/repository-contract.ts`), so each difference is recorded here rather than fixed on one side.

## The decision

- **A commit's answer does not depend on the order of its changes.** A Resource moved between two Spaces in one commit lands whichever Space the change set lists first. The Rust repository and both memory stores commit a move that lists the receiving Space first; the TypeScript SQL writer refuses it, because it writes each Space in turn and meets the Resource still owned by the Space that has not yet released it (contract case "writes a moved Resource through the ownership check, which refuses it before its Space releases it"). The browser sends no move, so no Edit reaches the difference today.
- **Against another process's reserved lock, a Rust write waits out the busy timeout before it answers unreachable (503); a TypeScript write fails at once.** A Rust write opens with `BEGIN IMMEDIATE`, which asks for the write lock at its start and so waits on it; the TypeScript driver's deferred transaction meets the reserved lock only on its first write, where SQLite answers busy without waiting. Against shared and exclusive locks, writes from both runtimes wait out the busy timeout, and reads wait only against an exclusive lock (`test/integration/sqlite-contention.test.ts`). Storage ST-127 allows either answer.
- **`load_space` over a Space whose stored document fails intake answers an invariant failure.** The TypeScript `loadSpace` keeps a narrower answer, one that is not an `AggregateInvariantError`, on the ground that one Space failing intake is that Space's answer to give (contract case "names a broken stored document broken stored state on the single-Space fast path, and leaves loadSpace's answer narrower"). HTTP answers both 500, so the wire does not tell them apart; the Rust repository names every broken stored state alike, as Storage ST-7 does. (This ADR uses the glossary's terms: Invariant failure, Unreachable, which TypeScript's code and the wire call unavailable, and Unclassified failure.)
- **`list_spaces` lists a Space whose document is broken beside the others**, by its title while the document is JSON holding a string `title` and by its id otherwise, and opening it answers an invariant failure. The TypeScript `listSpaces` fails for every Space when one document does not decode.

## Why

Each Rust answer is the one the requirements already ask for or allow, and each TypeScript answer is a consequence of how that repository is written rather than a decision: the order a writer visits Spaces in, a driver's deferred transaction, a type guard on one read path, a decode of every document to read every title. One broken Space hiding every other Space from `GET /api/spaces`, and from the picker that chooses a Space for a Space Resource, leaves the author no way to reach the healthy ones. Changing the TypeScript repository to match would reopen code that the Rust host retires (rust-host 20) and that the TypeScript hosts still serve.

## Rejected

- **Making Rust match TypeScript in each place.** It would copy an order dependence into a commit, a broken Space hiding the rest, and a second kind of answer for one broken state, into the host that is meant to outlive the TypeScript one.
- **Changing the TypeScript repository to match Rust.** TypeScript is the frozen reference for this work, and its contract would change with it, so the cases Rust ports would no longer be the ones TypeScript runs.
- **Leaving the differences to the requirements alone.** A reviewer meeting the exempt contract case, or a Rust test whose answer is not TypeScript's, would have no decision to find, and would propose matching the reference.

## Consequences

The Rust ports of the repository contract (`test/unit/repository-contract-rust-ports.test.ts`) exempt the change-order case, naming this ADR, and port the `loadSpace` case asserting the Rust answer. Storage ST-7 restates the two answers over a broken Space, ST-20 the change order and ST-127 the timing; each names both runtimes' answers.
