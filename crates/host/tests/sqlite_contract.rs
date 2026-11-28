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
use intake::{SpaceId, SpaceSnapshot};
use repository_contract::{BrokenState, Harness, Unprovided, repository_cases};
use sqlite_support::{Migrated, execute};

struct Sqlite {
    file: Migrated,
    store: Arc<SqliteSpaceRepository>,
    /// The Resource writes a store closed by a reopen recorded and no call
    /// has taken yet.
    written: Vec<String>,
}

/// `value` as an SQL string literal.
fn quoted(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

impl Harness for Sqlite {
    type Store = SqliteSpaceRepository;

    async fn open() -> Self {
        let file = Migrated::new().await;
        let store = Arc::new(SqliteSpaceRepository::open(&file.path()));
        Self {
            file,
            store,
            written: Vec::new(),
        }
    }

    fn store(&self) -> &Arc<Self::Store> {
        &self.store
    }

    async fn reopen(&mut self) -> Result<(), Unprovided> {
        self.store.close().await;
        self.written.extend(self.store.take_resource_writes());
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
        let mut written = std::mem::take(&mut self.written);
        written.extend(self.store.take_resource_writes());
        Ok(written)
    }

    async fn recreate_before_row_lock(
        &mut self,
        snapshot: SpaceSnapshot,
    ) -> Result<(), Unprovided> {
        self.store.recreate_before_row_lock(snapshot);
        Ok(())
    }

    async fn close(self) {
        self.store.close().await;
    }
}

repository_cases!(super::Sqlite, every_member);
