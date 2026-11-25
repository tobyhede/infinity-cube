# 04 — The SQL repository's concurrency seam

**Status:** blocked (needs-info: Q2)

**Blocked by:** 02 (so SQLite's table cases guard the refactor).

**What to build:** The one Rust SQL repository (`crates/host/src/sql.rs`) made able to run the TypeScript PostgreSQL protocol (`spec.md`, Where things stand) while SQLite keeps what it does today. Pure refactor for SQLite: no SQLite answer changes, and SQLite's table cases and `crates/host/tests/sqlite*.rs` stay green unchanged.

- [ ] Process serialisation becomes the store's choice: SQLite keeps the mutex now at `sql.rs:162`/`:204`; a store may run operations concurrently.
- [ ] `SqlStore` gains the aggregate lock in two modes, taken as the first statement of a transaction: exclusive for aggregate commits, `load_aggregate`, both lifecycle doors and `load_meta_space_id` where TypeScript takes it (`src/persistence/sql-space-repository.ts:763-772` and its callers), shared for the single-Space fast path (`:623`), none for `list_spaces` and `load_space` (`:308-326`). SQLite's implementation is a no-op beside its `BEGIN IMMEDIATE`.
- [ ] The fast path and the aggregate decision run in separate transactions, the first ending before the second begins (`:564-605`), and nothing is written before the hand-off.
- [ ] An update writes as `#writeUpdate` does (`:673-701`): take the row lock while reading the revision the row carried when the lock was granted, compare it with the expected revision and answer a conflict (rolled back, the current Space read afresh outside the transaction, `:517-554`) if it differs, then write the next revision, then re-read the Space's Resource rows under the lock and write only those that changed. The decision read alone is no longer trusted for the revision.
- [ ] The Meta identity is read and its row locked, re-read once if a replacement moved it, and answered unavailable after a second move (`:763-772`).
- [ ] Replacement relocks every stored row in id order and conflicts if a revision moved since its baseline read (`:1001-1017`), without decoding any document (ADR 0094).
- [ ] Initialization that loses a primary-key race on `spaces` or `repository_state`, or an ownership race on `resources`, re-reads and classifies its proposal against what is established (`:964-979`).
- [ ] A Rust unit test of the seam over a scripted store (no database) holds the statement order of each operation: which lock, in which mode, before which read, and that the fast path's transaction has ended before the aggregate one begins.

**Named mutants (each must fail a test; the PR records which):** fast path takes the exclusive lock; fast path takes no lock; aggregate path takes the shared lock; fast path and aggregate decision in one transaction; revision compared from the decision read instead of under the row lock; Resource rows judged against the decision read instead of re-read under the lock; Meta relock retry removed; Meta relock answers the identity read before the move; replacement skips the per-row relock; SQLite's mutex removed with four connections (#528's m13e).
