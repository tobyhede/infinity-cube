# 15 — The desktop application opens a Space from any backend

**Status:** needs-decision (an ADR first)

**Blocked by:** none for the ADR. The build waits on 06, so the PostgreSQL repository it opens holds the whole contract.

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
