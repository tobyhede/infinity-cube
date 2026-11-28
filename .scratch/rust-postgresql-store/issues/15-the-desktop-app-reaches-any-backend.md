# 15 — The desktop application opens a Space from any backend

**Status:** ready-for-agent (ADR 0181 accepted 28 November 2026)

**Blocked by:** 06, so the PostgreSQL repository it opens holds the whole contract. The ADR it waited on is accepted (ADR 0181, PR #562).

**Why:** The desktop application should be able to reach any backend, not only an Aggregate directory. Today it opens a folder and nothing else: ST-121 and ST-131 in `docs/requirements/storage.md`, ADR 0155 and ADR 0171. The Rust host it embeds (`crates/host`) already has a memory store, a SQLite repository and, from this plan, a PostgreSQL repository, and every one of them is compiled into the shell (PR 541 keeps the `sqlx` `postgres` and TLS features on `host` for every program, on purpose). What is missing is a way to choose one, and a window served from it.

**What to decide (the ADR):**

- What a "backend" is to a person: a folder, a SQLite file, or a PostgreSQL URL. Whether a hosted InfinityCube over HTTP is also in scope.
- How the Start window and File › Open… offer each. How a recent entry names a database without storing its password.
- What a database-backed window does where a folder-backed one Exports: it has no Export and no directory lock, as `infinity-cube serve` has none.
- The origin each window gets. Today it is `infinitycube://<key>`, with `<key>` taken from the folder path (`src/address.rs`). It needs a key for a database that keeps two backends' `localStorage` apart and does not leak credentials.
- Whether the shell migrates a database. `serve` never does (ST-120). An empty SQLite file it creates may need `migrations-sql/` applied.
- Closing: ST-122's wait for unwritten Edits applies to Export. Say what it means when every commit is already durable.

**What to build (after the ADR):**

- [ ] The Start window and File › Open… offer a SQLite file and a PostgreSQL URL beside a folder, each opening a Space window served by the host over that repository through the `infinitycube` scheme.
- [ ] Recent entries for each backend, with no secret stored in them.
- [ ] Storage's desktop rows and ST-121/ST-131 restated by the next requirements refresh.
- [ ] Tests: the scheme handler over the SQLite and PostgreSQL repositories, run against the HTTP conformance table as `src/scheme/tests.rs` runs it over a folder, with the PostgreSQL tests ignored by default and run in the `rust` job as the other `postgres*` binaries are.

**Named mutants:** none yet. The ADR settles the behaviour they would target.

## Comments

**2026-11-28, implement-tickets run.** The run's build of this ticket wrote the ADR and stopped, because the build items wait for it. The maintainer accepted it as ADR 0181 on 28 November 2026 (PR #562), settling four points: a hosted InfinityCube is out of scope; the shell stores no password, not even in a keychain; the shell neither creates a SQLite file nor migrates a database; and one PostgreSQL database reached by two host names gets two origins. Build to ADR 0181's text. Its Consequences section names the code it touches: `src/scheme.rs`'s `AggregateApplication`, `InFlight::settled`, and the recent history and reopen set (ST-131, not yet built).

The run's branch `feat/rust-postgresql-store-15-the-desktop-app-reaches-any-backend` (`044d0cfb`) holds only the proposed ADR on top of 06's work. It is superseded by #562 and can be deleted. Start the build from 06's branch, or from `main` once 06 has merged, with #562 merged in.
