//! The repository contract's table (`repository_contract`) run against the
//! SQLite store, each case on a fresh migrated file of its own
//! (rust-sqlite-test-coverage 04).

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

mod repository_contract;
#[allow(dead_code, reason = "each test binary uses part of the support")]
mod sqlite_support;

use std::sync::Arc;

use host::SqliteSpaceRepository;
use intake::SpaceId;
use repository_contract::{BrokenState, Harness, Unprovided, repository_cases};
use sqlite_support::{Migrated, connect, execute};

/// Every Resource row the store inserts or updates, in the order written,
/// recorded by triggers inside the writing transaction, so a write a
/// rollback undoes is not recorded.
const RECORD_RESOURCE_WRITES: &str = r#"
CREATE TABLE "contract_resource_writes" ("seq" INTEGER PRIMARY KEY AUTOINCREMENT, "id" TEXT NOT NULL);
CREATE TRIGGER "contract_resource_inserted" AFTER INSERT ON "resources"
  BEGIN INSERT INTO "contract_resource_writes" ("id") VALUES (NEW."id"); END;
CREATE TRIGGER "contract_resource_updated" AFTER UPDATE ON "resources"
  BEGIN INSERT INTO "contract_resource_writes" ("id") VALUES (NEW."id"); END;
"#;

struct Sqlite {
    file: Migrated,
    store: Arc<SqliteSpaceRepository>,
}

/// `value` as an SQL string literal.
fn quoted(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

impl Harness for Sqlite {
    type Store = SqliteSpaceRepository;

    async fn open() -> Self {
        let file = Migrated::new().await;
        execute(&file.file, RECORD_RESOURCE_WRITES).await;
        let store = Arc::new(SqliteSpaceRepository::open(&file.path()));
        Self { file, store }
    }

    fn store(&self) -> &Arc<Self::Store> {
        &self.store
    }

    async fn reopen(&mut self) -> Result<(), Unprovided> {
        self.store.close().await;
        self.store = Arc::new(SqliteSpaceRepository::open(&self.file.path()));
        Ok(())
    }

    async fn arrange_broken_state(
        &mut self,
        state: BrokenState,
        space: SpaceId,
        other: SpaceId,
    ) -> Result<SpaceId, Unprovided> {
        let space_row = |id: SpaceId, document: &str| {
            format!(
                r#"INSERT INTO "spaces" ("id", "document", "revision", "updated_at") VALUES ({}, {}, '0', datetime('now'));"#,
                quoted(&id.to_string()),
                quoted(document)
            )
        };
        let spaces = match state {
            BrokenState::InvalidSpaceDocument => space_row(space, r#"{"version":1}"#),
            BrokenState::InvalidAggregate => format!(
                "{}{}",
                space_row(space, r#"{"version":1,"title":"Meta"}"#),
                space_row(other, r#"{"version":1,"title":"Unreferenced"}"#)
            ),
        };
        execute(
            &self.file.file,
            &format!(
                r#"{spaces} INSERT INTO "repository_state" ("meta_space_id") VALUES ({});"#,
                quoted(&space.to_string())
            ),
        )
        .await;
        Ok(space)
    }

    async fn remove_meta_identity(&mut self) -> Result<(), Unprovided> {
        execute(&self.file.file, r#"DELETE FROM "repository_state";"#).await;
        Ok(())
    }

    async fn write_raw_revision(
        &mut self,
        space: SpaceId,
        revision: &str,
        exported: Option<Option<&str>>,
    ) -> Result<(), Unprovided> {
        let exported = match exported {
            None => String::new(),
            Some(None) => r#", "exported_revision" = NULL"#.to_owned(),
            Some(Some(value)) => format!(r#", "exported_revision" = {}"#, quoted(value)),
        };
        execute(
            &self.file.file,
            &format!(
                r#"UPDATE "spaces" SET "revision" = {}{exported} WHERE "id" = {};"#,
                quoted(revision),
                quoted(&space.to_string())
            ),
        )
        .await;
        Ok(())
    }

    async fn take_resource_writes(&mut self) -> Result<Vec<String>, Unprovided> {
        let mut connection = connect(&self.file.file).await;
        let written: Vec<String> =
            sqlx::query_scalar(r#"SELECT "id" FROM "contract_resource_writes" ORDER BY "seq""#)
                .fetch_all(&mut connection)
                .await
                .unwrap();
        sqlx::raw_sql(r#"DELETE FROM "contract_resource_writes""#)
            .execute(&mut connection)
            .await
            .unwrap();
        sqlx::Connection::close(connection).await.unwrap();
        Ok(written)
    }

    async fn close(self) {
        self.store.close().await;
    }
}

repository_cases!(super::Sqlite);
