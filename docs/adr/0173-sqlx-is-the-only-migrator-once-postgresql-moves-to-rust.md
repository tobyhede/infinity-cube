# sqlx is the only migrator once PostgreSQL moves to Rust, and the Prisma Next migration packages go

Status: accepted
Date: 2026-11-24
Refines: 0155, 0165
Related: 0085, 0095

ADR 0155 moves migration ownership to Rust when PostgreSQL moves, and ADR 0165 keeps the schema history in two encodings until then, adding a Prisma Next package and its plain-SQL file together. Neither says how ownership is carried out while the TypeScript hosts still run: until rust-host 19 they serve `pnpm dev`, `pnpm dev:sqlite` and both restart proofs, and their databases are migrated by Prisma Next. Each tool records what it has applied in its own table (`_sqlx_migrations`; Prisma Next's marker and ledger), so either one meeting a database the other migrated would apply every migration again. The maintainer ruled on 24 November 2026, in triage of rust-host 16.

## The decision

- **From rust-host 16, `sqlx` is the only migrator, for PostgreSQL and SQLite together.** The plain-SQL files under `migrations-sql/` are the schema history. The Prisma Next migration packages (`migrations/app/`, `migrations-sqlite/app/`) are deleted, and with them `test/unit/shared-migrations.test.ts` and `crates/host/tests/shared_migrations.rs`, which held the two encodings equal. A schema change is a new plain-SQL file.
- **The Rust binary migrates, through its own verb**: `infinity-cube migrate --store <postgres|sqlite>`, reaching the database `DATABASE_URL` or the file `SQLITE_PATH` names. Every caller, the TypeScript databases' included, runs it; no host migrates on start.
- **No database is adopted.** A database Prisma Next migrated, holding tables but no `_sqlx_migrations`, is refused by `migrate`, which says to reset it. Nothing is released and no development database is kept, so no record is ever seeded from the other tool's.
- **The TypeScript runtime keeps its Prisma Next contract until the TypeScript server is retired (rust-host 20)**, for its queries only. What holds the contract to the schema is Prisma Next's own check: CI migrates each database with `sqlx` and then runs `prisma-next db verify --schema-only` against it, which fails when a table or column the contract declares is missing or differs. It runs without `--strict`, because `--strict` fails on any element the contract does not declare and Prisma Next offers no way to exclude one, so `sqlx`'s own `_sqlx_migrations` would always fail it. The TypeScript integration suites, which then run on databases `sqlx` migrated, are the second net.
- **`migrate --store sqlite` keeps migration's path rules (Storage ST-126) but refuses a blank `SQLITE_PATH`**: a relative path and a missing or unwritable parent are refused, a missing file is created, and a blank path is an error rather than a migration of no file, so `migrate` never answers success having done nothing.

## Why

One migrator means one record of what is applied, and no seeding in either direction. Moving both databases together avoids keeping two migrators for the length of time SQLite would otherwise stay on Prisma Next. Deleting the packages rewrites nothing ADR 0085 protects: the history it keeps is the one the plain-SQL files already hold, statement for statement, and no database migrated from the packages is kept.

## Rejected

- **Two migrators until rust-host 19, each seeding the other's record.** Two ledgers to keep in step, for a period that ends anyway.
- **Moving PostgreSQL alone, SQLite staying on Prisma Next until 20.** It keeps both migrators, and every cost of the option above, for SQLite.
- **`serve` migrating on start.** The TypeScript hosts and suites would still need something to migrate their databases, and a host that changes a schema as a side effect of serving is harder to reason about than one command.
- **Adopting databases Prisma Next migrated** by seeding `_sqlx_migrations` from its ledger. One-time code to keep databases nobody needs kept.
- **A test comparing the contract's tables with `sqlx`'s schema.** `db verify --schema-only` is that comparison, from the tool that owns the contract.

## Consequences

Contributors and the `postgres` and `sqlite` CI jobs need the Rust toolchain (`rust-toolchain.toml`) to migrate. The package scripts `db:migrate` and `db:migrate:sqlite`, and the `prisma-next.config*.ts` migration settings they read, go with the packages, unless rust-host 16 keeps a script as a thin name for the verb. Storage ST-125 and ST-126 restate the rule.
