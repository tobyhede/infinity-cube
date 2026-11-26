/**
 * Writes the rows the TypeScript host stores running
 * `conformance/sqlite-rows/script.json` on a freshly migrated SQLite file as
 * SQL, which `crates/host/tests/sqlite_rows.rs` ›
 * `given_rows_the_typescript_host_wrote` replays over a migrated file to hold
 * the Rust SQLite repository to reading them (Storage ST-125), and which
 * `test/integration/sqlite-rows-across-runtimes.test.ts` holds current.
 * Regenerate the fixture with:
 *
 *   pnpm exec tsx scripts/sqlite-rows-fixture.ts
 */
import { writeFileSync } from 'node:fs';
import { TYPESCRIPT_ROWS, typescriptRows } from '../test/support/sqlite-rows';

writeFileSync(TYPESCRIPT_ROWS, await typescriptRows());
