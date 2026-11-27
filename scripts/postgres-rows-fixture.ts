/**
 * Writes the rows the TypeScript host stores running
 * `conformance/rows/script.json` on a freshly migrated PostgreSQL database
 * as SQL, which `crates/host/tests/postgres_rows.rs` ›
 * `given_rows_the_typescript_host_wrote` replays over a migrated database to
 * hold the Rust PostgreSQL repository to reading them (Storage ST-125), and
 * which `test/integration/postgres-rows-across-runtimes.test.ts` holds
 * current. The database is one of its own, created on the server
 * `DATABASE_URL` names and dropped after. Regenerate the fixture with:
 *
 *   pnpm exec tsx scripts/postgres-rows-fixture.ts
 */
import { writeFileSync } from 'node:fs';
import { TYPESCRIPT_ROWS, typescriptRows } from '../test/support/postgres-rows';

writeFileSync(TYPESCRIPT_ROWS, await typescriptRows());
