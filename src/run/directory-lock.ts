import { join } from 'node:path';

/**
 * The file in an Aggregate directory whose lock a run holds (ADR 0162). It is
 * a dot-entry, so a directory holding it and nothing else is still empty, and
 * Import, Export and `check` read and write only the names Import owns, so
 * none of them opens it. It is never deleted: a process that opened the old
 * file could otherwise lock it while another locks a new one.
 */
export const LOCK_FILE_NAME = '.infinity-cube.lock';

/** A held lock on an Aggregate directory, released once. */
export interface DirectoryLock {
  release(): void;
}

/** `SQLITE_BUSY` and `SQLITE_LOCKED`: another connection holds the lock. */
const HELD_CODES: readonly unknown[] = [5, 6];

/**
 * Lock `directory` against every other run, in this process or another, Node
 * or Rust, answering `held` when one already holds it.
 *
 * The lock is SQLite's own exclusive lock on {@link LOCK_FILE_NAME}, taken by
 * an exclusive transaction that is never committed, so the file stays empty.
 * The Rust host takes it the same way (`crates/host/src/lock.rs`), and SQLite
 * keeps one locking protocol across its builds, so the two runtimes exclude
 * each other (`crates/cli/tests/run.rs`, `given_a_directory_a_node_run_holds`
 * and `given_a_directory_this_binary_runs`, which run this file with Node).
 * The operating system releases it when the process ends, however
 * it ends. With no busy timeout, a held lock is answered at once.
 *
 * @throws whatever else stops the lock being taken: a directory that cannot
 *   hold the file, or a file of that name that is not SQLite's.
 */
export const lockDirectory = (directory: string): DirectoryLock | 'held' => {
  // A static `import 'node:sqlite'` fails to load under this Vitest's resolver.
  const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
  const connection = new DatabaseSync(join(directory, LOCK_FILE_NAME), { timeout: 0 });
  try {
    // The journal stays in memory, so nothing is written beside the file.
    connection.exec('PRAGMA journal_mode = MEMORY');
    connection.exec('BEGIN EXCLUSIVE');
  } catch (error) {
    connection.close();
    if (error instanceof Error && 'errcode' in error && HELD_CODES.includes(error.errcode))
      return 'held';
    throw error;
  }
  let held = true;
  return {
    release: () => {
      if (!held) return;
      held = false;
      connection.close();
    },
  };
};
