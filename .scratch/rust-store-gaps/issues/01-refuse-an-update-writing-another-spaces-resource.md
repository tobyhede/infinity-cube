# 01: Refuse an update that would rewrite another Space's Resource

**What to build:** A commit the Rust SQL repository writes, which upserts a Resource row that another Space owns, is refused as the TypeScript host refuses it (`#upsertResources` reads back the row's owner and answers `invalid-commit`), and nothing it wrote is kept. Today the Rust upsert reads nothing back, so it rewrites the other Space's Resource document and leaves that Space as its owner (Storage ST-20).

The commit decision reads every row it judges inside the write transaction, so on SQLite only a writer outside that decision can leave such a row: a trigger stands in for one in the test. On PostgreSQL, where the single-Space fast path will run under a shared lock (rust-postgresql-store 04), the read-back is the defence that ticket names. The memory store has no row a writer outside its decision can change, so it gains nothing here.

Found by the cold audit of the Rust PostgreSQL plan (rust-postgresql-store 04, "Shared gap").

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] A failing test first: an update whose Resource row another Space owns once the updated Space's row is written is answered `Rejected` with `Resource <id> belongs to space <owner>, not <space>`, and both Spaces read back as they were.
- [x] The Resource upsert answers the owning Space's id, and the commit rolls back and answers the refusal when it is not the Space being written.
