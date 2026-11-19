# Every host locks the Aggregate directory it runs

Status: accepted
Date: 2026-11-18
Related: 0117, 0119, 0155, 0156

ADR 0117 left concurrent writers to git: Running took no lock, and two runs of one directory were to be recovered with git. With four hosts that can run a directory (`pnpm cube run`, the Rust CLI's `infinity-cube run`, the desktop application and the Node desktop sidecar), two processes running one directory is easy to reach, and each Exports over the other, so Edits answered 200 are lost without either run saying so. The desktop shell guarded only within its own process (its `Registry`). The maintainer decided on 18 November 2026 that every host locks the directory it runs, and a second opener is refused.

## The decision

- **The lock is SQLite's own exclusive lock on `.infinity-cube.lock` in the directory.** A run opens that file as a SQLite database with no busy timeout, sets `journal_mode = MEMORY` and begins an exclusive transaction it never commits, and closes the connection to release it. Node takes it through its built-in `node:sqlite` (`src/run/directory-lock.ts`), Rust through `rusqlite` with SQLite compiled in (`crates/host/src/lock.rs`). Nothing is ever written, so the file stays empty and no journal is left beside it. SQLite answers a lock another connection holds, in the same process or another, with `SQLITE_BUSY`; that, and `SQLITE_LOCKED`, is the second opener.
- **Each runtime takes it once, in its run.** `startRun` (`src/run/run.ts`) serves `pnpm cube run` and the Node sidecar; the host crate's `Run::start` serves the Rust CLI and the desktop shell. A missing or empty directory is refused first, so no lock file is created there; then the lock is taken, before Import reads anything, so a run never serves a copy older than another run's last write; it is released once the run's last write has landed or failed, and when Import refuses the directory. In Rust the writer task owns the lock, so a run dropped without a stop, and the desktop shell's Close without saving, hold it until the write that is still running ends.
- **The second opener is refused, in each host's own way, with the kind `locked`.** TypeScript's `RunStart` gains `{ kind: 'locked' }` and Rust's `ImportError` gains `Locked`, the same kind in both. `pnpm cube run` and `infinity-cube run` exit 1 saying "`<dir>` is open in another run of InfinityCube: stop that run before starting this one."; the Node sidecar announces it as a refusal, and the desktop shell shows it in the dialog a refused folder already gets, both saying "`<dir>` is open in another InfinityCube window or run: close it there first." A lock that cannot be taken for another reason (a directory that cannot hold the file, a file of that name that is not SQLite's) is not a refusal: the run does not start, and says why as any other failure to start.
- **The file is never deleted.** Deleting it on release would let a process that opened the old file lock it while another creates and locks a new one, and both would run. It is a dot-entry, so a directory holding it and nothing else is still empty (ADR 0124's missing-or-empty rule). Import, `check` and Export read and write only the names Import owns (`aggregate.json`, `assets/` and the Space directories), so none of them reads, writes or removes it. A content repository should ignore it: `.infinity-cube.lock` in its `.gitignore`.
- **`cube mcp`, `check`, `init`, `import` and `export` take no lock.** `check` only reads; `init` refuses anything but an empty directory and writes before any run could; `import` and `export` reach a database, not a run. The MCP server edits files as an author does, and a run serving the same directory still overwrites what it writes (Storage ST-111).

## Why

- **Both runtimes must refuse each other**, and Node 26 offers no file lock of its own: `fs` has no `flock` or `fcntl`, and its handles have no lock method (checked by listing them on Node 26.8.1). It does carry SQLite, whose locks are the operating system's advisory locks (POSIX `fcntl` byte-range locks on macOS and Linux, `LockFileEx` on Windows) and whose locking protocol is the same in every build, because processes running different builds of SQLite share one database file. Rust's standard `File::try_lock` is `flock` on Unix, which does not exclude an `fcntl` lock on Linux, so Rust takes the lock through SQLite as well.
- **The operating system releases it when the process ends**, however it ends: a crashed or killed run leaves no stale lock to clean up, which is what ADR 0117 feared a lock would need.
- **SQLite also excludes two connections in one process.** POSIX `fcntl` locks belong to a process, so a second lock taken in the same process would succeed; SQLite keeps its own table of the files a process has open and answers the second connection busy. The desktop shell runs every talk in one process, and the tests run two runs in one.

## Rejected

- **An exclusively created lock file naming its holder, deleted on release.** Both runtimes can create one, but a run that is killed leaves it behind, and a stale rule (a process id that is gone, an age) is wrong across machines sharing a folder, after a reboot that reuses the id, and when the holder hangs.
- **A native Node addon for `flock` or `fcntl`.** It needs a build per platform for the sidecar's single executable, which ADR 0155 avoids, and `node:sqlite` already reaches the same locks.
- **Rust's `File::try_lock` alone.** It would exclude only other Rust runs on macOS and Linux.
- **Keeping git as the only answer (ADR 0117).** Git recovers a lost Edit only if the author notices it was lost; two runs fail silently.

## Consequences

- This refines ADR 0117: Running still keeps no fingerprint, on-disk change detection or merge, and git still answers for history, undo and a write that fails part-way (ADR 0119), but two runs of one directory no longer both run.
- Storage ST-124 restates the rule; ST-64 and ST-66 change with it.
- A run creates `.infinity-cube.lock` in a directory it opens, so a directory a run has opened differs from one it has not by that one empty file, which the conformance suites' file trees leave out.
- A directory that cannot hold the file (a read-only one) can no longer be run; a run there could never write an Edit.
- **Known limits.** On a network filesystem the lock is as good as that filesystem's advisory locking, which SQLite itself warns may be broken or absent; two machines may then both run. A copy of the directory, or the same files reached through a second mount that the kernel does not see as one file, is a second directory. The same directory reached by two paths (a symbolic link, a relative path) is one file to the lock, so it needs no canonical path. A program that opens and closes `.infinity-cube.lock` itself inside a run's process would drop that process's POSIX locks; nothing InfinityCube runs opens it but the lock.
