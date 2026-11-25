# 02: Create a Space by inserting its row, and check a deleted one existed

**What to build:** The Rust SQL repository writes Space rows as the TypeScript host does. A Space that initialization, replacement or a commit creates is inserted (`#createStoredSpace`), so a row already holding its id fails the operation unclassified rather than being overwritten. A Space a commit deletes must have had a row to remove, or the commit fails unclassified with `Space <id> disappeared during commit`. Either way nothing the operation wrote is kept. An updated Space's row is still written over the one it replaces.

As with 01, on SQLite only a writer outside the decision can leave such a row, and a trigger stands in for one in the tests. On PostgreSQL the insert is what raises the `spaces_pkey` violation that rust-postgresql-store 04 classifies when two initializations race.

Found by the cold audit of the Rust PostgreSQL plan (rust-postgresql-store 04, "Shared gap").

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] A failing test first: an initialization meeting a Space row already written fails unclassified and leaves the store uninitialized.
- [x] A failing test first: a commit creating a Space whose row is already written fails unclassified and leaves the aggregate as it was.
- [x] A failing test first: a commit deleting a Space whose row is already gone fails with `Space <id> disappeared during commit` and leaves the aggregate as it was.
