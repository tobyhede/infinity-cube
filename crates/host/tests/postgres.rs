//! The PostgreSQL store (Storage ST-3, ADR 0177): the repository contract's
//! table (`repository_contract`), then its rows, its timestamps, its
//! isolation, its pool and its TLS, each on a database of its own. Every
//! test needs the server `INFINITY_CUBE_POSTGRES_TEST_URL` names, so each is
//! ignored by default and fails, rather than passes, when run without one.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

#[allow(dead_code, reason = "each test binary uses part of the support")]
mod postgres_support;
mod repository_contract;

use std::sync::Arc;
use std::time::Duration;

use host::{
    AggregateLoad, CommitResult, DatabaseUrl, LoadedSpace, PoolSettings, PostgresSpaceRepository,
    Probe, RepositoryError, SpaceChange, SpaceCommit, SpaceRepository, Step, TokioFilesystem,
    import_directory,
};
use http_conformance::Counted;
use intake::{SpaceId, SpaceSnapshot};
use postgres_support::stand_in::{Behaviour, StandIn};
use postgres_support::{Fresh, rendezvous, waiting};
use repository_contract::{BrokenState, Harness, KeyOrder, Unprovided, repository_cases};
use tokio::sync::Notify;

/// The Presentation Space, which has two Maps.
const PRESENTATION: &str = "00000000-0000-4000-8000-000000000060";

fn space(id: &str) -> SpaceId {
    SpaceId::parse(id).unwrap()
}

/// `store` holding the tracked fixture, put there through the lifecycle doors.
async fn seeded(store: PostgresSpaceRepository) -> PostgresSpaceRepository {
    import_directory(
        &store,
        &TokioFilesystem,
        &http_conformance::fixture(),
        &Counted::default(),
    )
    .await
    .unwrap();
    store
}

async fn loaded(store: &impl SpaceRepository, id: &str) -> LoadedSpace {
    store.load_space(space(id)).await.unwrap().unwrap()
}

fn update(snapshot: intake::SpaceSnapshot, expected: &LoadedSpace) -> SpaceCommit {
    SpaceCommit {
        changes: vec![SpaceChange::Update {
            space_id: snapshot.id,
            snapshot,
            expected_revision: expected.revision,
        }],
    }
}

/// A commit renaming `loaded` to `title`, at the revision it was read at.
fn rename(loaded: &LoadedSpace, title: &str) -> SpaceCommit {
    let mut snapshot = loaded.snapshot.clone();
    title.clone_into(&mut snapshot.document.title);
    update(snapshot, loaded)
}

/// A commit retitling `loaded`'s first Resource, at the revision it was
/// read at.
fn retitle_resource(loaded: &LoadedSpace, title: &str) -> SpaceCommit {
    let mut snapshot = loaded.snapshot.clone();
    title.clone_into(&mut snapshot.resources[0].title);
    update(snapshot, loaded)
}

/// A single update moving `loaded`'s default Map to its other Map, which
/// the fast path hands to the aggregate decision.
fn move_default_map(loaded: &LoadedSpace) -> SpaceCommit {
    let mut snapshot = loaded.snapshot.clone();
    let other = snapshot
        .document
        .maps
        .as_ref()
        .unwrap()
        .iter()
        .map(|map| map.id)
        .find(|id| Some(*id) != snapshot.document.default_map)
        .unwrap();
    snapshot.document.default_map = Some(other);
    update(snapshot, loaded)
}

fn committed(answer: &CommitResult) -> bool {
    matches!(answer, CommitResult::Committed { .. })
}

/// A probe that stops each operation at `at` until released, telling the
/// test it got there.
fn pausing(store: &PostgresSpaceRepository, at: fn(&Step) -> bool) -> (Arc<Notify>, Arc<Notify>) {
    let reached = Arc::new(Notify::new());
    let release = Arc::new(Notify::new());
    let (signal, wait) = (Arc::clone(&reached), Arc::clone(&release));
    let probe: Probe = Arc::new(move |step| {
        let (signal, wait) = (Arc::clone(&signal), Arc::clone(&wait));
        Box::pin(async move {
            if at(&step) {
                signal.notify_one();
                wait.notified().await;
            }
        })
    });
    store.set_probe(Some(probe));
    (reached, release)
}

/// The contract's harness: a fresh migrated database per case, reopened as
/// a fresh host through a new pool, as the TypeScript harness reopens
/// through a new client (`test/integration/postgres-space-repository.test.ts`).
struct Postgres {
    database: Fresh,
    store: Arc<PostgresSpaceRepository>,
    /// The Resource writes a store closed by a reopen recorded and no call
    /// has taken yet.
    written: Vec<String>,
}

/// `value` as an SQL string literal.
fn quoted(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

/// A Space row holding `document`, at revision 0, written past the codec.
fn space_row(id: SpaceId, document: &str) -> String {
    format!(
        r#"INSERT INTO "spaces" ("id", "document", "revision", "updated_at") VALUES ({}, {}::jsonb, '0', now());"#,
        quoted(&id.to_string()),
        quoted(document)
    )
}

impl Harness for Postgres {
    type Store = PostgresSpaceRepository;

    /// `jsonb` keeps an object's keys sorted by length, then by bytes.
    const KEY_ORDER: KeyOrder = KeyOrder::Reordered;

    async fn open() -> Self {
        let database = Fresh::new().await;
        let store = Arc::new(database.open());
        Self {
            database,
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
        self.store = Arc::new(self.database.open());
        Ok(())
    }

    async fn arrange_broken_state(
        &mut self,
        state: BrokenState,
        space: SpaceId,
        other: SpaceId,
    ) -> Result<SpaceId, Unprovided> {
        let spaces = match state {
            BrokenState::InvalidSpaceDocument => space_row(space, r#"{"version":1}"#),
            BrokenState::InvalidAggregate => format!(
                "{}{}",
                space_row(space, r#"{"version":1,"title":"Meta"}"#),
                space_row(other, r#"{"version":1,"title":"Unreferenced"}"#)
            ),
        };
        self.database
            .execute(&format!(
                r#"{spaces} INSERT INTO "repository_state" ("singleton_id", "meta_space_id") VALUES (1, {});"#,
                quoted(&space.to_string())
            ))
            .await;
        Ok(space)
    }

    async fn remove_meta_identity(&mut self) -> Result<(), Unprovided> {
        self.database
            .execute(r#"DELETE FROM "repository_state" WHERE "singleton_id" = 1;"#)
            .await;
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
        self.database
            .execute(&format!(
                r#"UPDATE "spaces" SET "revision" = {}{exported} WHERE "id" = {};"#,
                quoted(revision),
                quoted(&space.to_string())
            ))
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

repository_cases!(
    super::Postgres,
    every_member,
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
);

mod given_rows_it_writes {
    use super::*;

    // Case: writes and reads a typed space document with its resource
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn writes_and_reads_a_typed_space_document_with_its_resource() {
        let database = Fresh::new().await;
        let store = seeded(database.open()).await;
        let stored = loaded(&store, PRESENTATION).await;
        let resource = &stored.snapshot.resources[0];
        let row = database
            .scalar(&format!(
                "SELECT concat_ws(' ', id::text, space_id::text, document->>'title', \
                 jsonb_typeof(document)) FROM resources WHERE id = '{}'",
                resource.id
            ))
            .await
            .unwrap();
        assert_eq!(
            row,
            format!(
                "{} {PRESENTATION} {} object",
                resource.id,
                resource.title.lines().next().unwrap()
            ),
            "the Resource row names its Space and holds its document as jsonb"
        );
        assert_eq!(
            database
                .scalar(&format!(
                    "SELECT jsonb_typeof(document) FROM spaces WHERE id = '{PRESENTATION}'"
                ))
                .await
                .as_deref(),
            Some("object")
        );
        store.close().await;
        let reopened = database.open();
        assert_eq!(
            loaded(&reopened, PRESENTATION).await,
            stored,
            "read back after a reopen as written"
        );
        reopened.close().await;
    }

    // Case: advances updatedAt when a space is updated
    // Case: advances %s.updatedAt when a record is updated (Space)
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn advances_a_spaces_updated_at_when_it_is_updated() {
        let database = Fresh::new().await;
        let store = seeded(database.open()).await;
        let read = |column: &'static str| {
            let database = &database;
            async move {
                database
                    .scalar(&format!(
                        "SELECT {column}::text FROM spaces WHERE id = '{PRESENTATION}'"
                    ))
                    .await
                    .unwrap()
            }
        };
        let (created, before) = (read("created_at").await, read("updated_at").await);
        // `now()` is the transaction's start, so the update waits for a later one.
        tokio::time::sleep(Duration::from_millis(20)).await;
        let current = loaded(&store, PRESENTATION).await;
        assert!(committed(
            &store
                .commit(rename(&current, "After update"))
                .await
                .unwrap()
        ));
        let after = read("updated_at").await;
        assert!(
            database
                .scalar(&format!(
                    "SELECT ('{after}'::timestamptz > '{before}'::timestamptz)::text"
                ))
                .await
                .as_deref()
                == Some("true"),
            "updated_at advanced from {before} to {after}"
        );
        assert_eq!(read("created_at").await, created, "created_at is kept");
        store.close().await;
    }

    // Case: advances %s.updatedAt when a record is updated (Resource)
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn advances_a_resources_updated_at_and_keeps_its_created_at_when_it_is_updated() {
        let database = Fresh::new().await;
        let store = seeded(database.open()).await;
        let current = loaded(&store, PRESENTATION).await;
        let id = current.snapshot.resources[0].id;
        let read = |column: &'static str| {
            let database = &database;
            async move {
                database
                    .scalar(&format!(
                        "SELECT {column}::text FROM resources WHERE id = '{id}'"
                    ))
                    .await
                    .unwrap()
            }
        };
        let (created, before) = (read("created_at").await, read("updated_at").await);
        tokio::time::sleep(Duration::from_millis(20)).await;
        assert!(committed(
            &store
                .commit(retitle_resource(&current, "Retitled"))
                .await
                .unwrap()
        ));
        let after = read("updated_at").await;
        assert_eq!(
            database
                .scalar(&format!(
                    "SELECT ('{after}'::timestamptz > '{before}'::timestamptz)::text"
                ))
                .await
                .as_deref(),
            Some("true"),
            "updated_at advanced from {before} to {after}"
        );
        assert_eq!(
            read("created_at").await,
            created,
            "the upsert keeps created_at"
        );
        store.close().await;
    }

    // `jsonb` stores numbers by value, so `-0` reads back as `0` (ADR 0177).
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn loads_a_committed_negative_zero_as_zero() {
        let database = Fresh::new().await;
        let store = seeded(database.open()).await;
        let current = loaded(&store, PRESENTATION).await;
        let mut snapshot = current.snapshot.clone();
        let maps = snapshot.document.maps.as_mut().unwrap();
        let placement = &mut maps[0].positions[0].1;
        placement.x = -0.0;
        assert!(committed(
            &store.commit(update(snapshot, &current)).await.unwrap()
        ));
        let after = loaded(&store, PRESENTATION).await;
        let x = after.snapshot.document.maps.as_ref().unwrap()[0].positions[0]
            .1
            .x;
        assert_eq!(x, 0.0);
        assert!(x.is_sign_positive(), "-0 reads back as 0");
        store.close().await;
    }

    // Intake admits the escape `\u0000`; `jsonb` refuses it (22P05), which
    // both runtimes answer unclassified (ADR 0177).
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn answers_a_title_jsonb_refuses_unclassified() {
        let database = Fresh::new().await;
        let store = seeded(database.open()).await;
        let current = loaded(&store, PRESENTATION).await;
        let answer = store.commit(rename(&current, "nul \u{0} here")).await;
        let Err(RepositoryError::Unclassified(message)) = answer else {
            panic!("expected an unclassified failure, got {answer:?}");
        };
        assert!(message.contains("22P05"), "{message}");
        assert_eq!(
            loaded(&store, PRESENTATION).await,
            current,
            "nothing written"
        );
        store.close().await;
    }
}

mod given_its_transactions {
    use super::*;

    // On a server whose default is SERIALIZABLE, a losing row-lock write
    // would fail with 40001; the store sets READ COMMITTED itself (Q3).
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn answers_overlapping_edits_to_one_space_a_commit_and_a_conflict_under_a_serializable_default()
     {
        let database = Fresh::new().await;
        seeded(database.open()).await.close().await;
        database
            .execute(&format!(
                "ALTER DATABASE {} SET default_transaction_isolation = 'serializable'",
                database.name
            ))
            .await;
        let first = database.open();
        let second = database.open();
        let current = loaded(&first, PRESENTATION).await;
        let (reached, release) = pausing(&first, |step| matches!(step, Step::ResourceReread(_)));
        let winning = {
            let commit = rename(&current, "First");
            tokio::spawn(async move {
                let answer = first.commit(commit).await;
                first.close().await;
                answer
            })
        };
        let winning = rendezvous(&reached, winning).await;
        let losing = {
            let commit = rename(&current, "Second");
            tokio::spawn(async move {
                let answer = second.commit(commit).await;
                second.close().await;
                answer
            })
        };
        // The second waits on the first's row lock before the first goes on.
        waiting(&database, 1).await;
        release.notify_one();
        let (won, lost) = (winning.await.unwrap(), losing.await.unwrap());
        assert!(committed(&won.unwrap()), "the first commits");
        let Ok(CommitResult::Conflict(conflicts)) = lost else {
            panic!("the second is a conflict, not a 503: {lost:?}");
        };
        assert_eq!(
            conflicts[0]
                .current
                .as_ref()
                .unwrap()
                .snapshot
                .document
                .title,
            "First",
            "carrying the Space the first left"
        );
    }

    // Q8: an operation holds one connection at a time, so a commit the fast
    // path hands on completes over a pool of one.
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn completes_a_handed_on_commit_over_a_pool_of_one() {
        let database = Fresh::new().await;
        let store = seeded(database.open_with(PoolSettings {
            max_connections: 1,
            acquire_timeout: Duration::from_secs(5),
        }))
        .await;
        let current = loaded(&store, PRESENTATION).await;
        let answer = store.commit(move_default_map(&current)).await.unwrap();
        assert!(committed(&answer), "{answer:?}");
        store.close().await;
    }

    // Q3: one REPEATABLE READ READ ONLY transaction, so a commit landing
    // between its Space read and its Resource read is seen whole or not at
    // all.
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn reads_a_space_and_its_resources_from_one_side_of_a_commit() {
        let database = Fresh::new().await;
        let writer = seeded(database.open()).await;
        let reader = database.open();
        let before = loaded(&writer, PRESENTATION).await;
        let (reached, release) = pausing(&reader, |step| matches!(step, Step::SpaceRead(_)));
        let reading = tokio::spawn(async move {
            let answer = reader.load_space(space(PRESENTATION)).await;
            reader.close().await;
            answer
        });
        let reading = rendezvous(&reached, reading).await;
        let mut snapshot = before.snapshot.clone();
        "Renamed".clone_into(&mut snapshot.document.title);
        "Retitled".clone_into(&mut snapshot.resources[0].title);
        assert!(committed(
            &writer.commit(update(snapshot, &before)).await.unwrap()
        ));
        release.notify_one();
        let read = reading.await.unwrap().unwrap().unwrap();
        assert_eq!(read, before, "both the Space and its Resources as before");
        writer.close().await;
    }
}

mod given_its_connection {
    use super::*;

    /// `database`'s URL with its `sslmode` set to `mode`, every other query
    /// pair kept: a dropped `port` or `host` would name another server.
    fn with_sslmode(database: &Fresh, mode: &str) -> DatabaseUrl {
        let mut url = database.url.clone();
        let mut pairs: Vec<(String, String)> = database
            .url
            .query_pairs()
            .filter(|(key, _)| key != "sslmode")
            .map(|(key, value)| (key.into_owned(), value.into_owned()))
            .collect();
        pairs.push(("sslmode".to_owned(), mode.to_owned()));
        url.query_pairs_mut().clear().extend_pairs(pairs);
        DatabaseUrl::parse(Some(url.as_str())).unwrap()
    }

    /// `database`'s URL with every TLS selector left out, so only
    /// `PGSSLMODE` can choose the transport.
    fn without_tls_selectors(database: &Fresh) -> DatabaseUrl {
        let url = postgres_support::without_query(
            &database.url,
            &["sslmode", "ssl", "sslcert", "sslkey", "uselibpqcompat"],
        );
        DatabaseUrl::parse(Some(url.as_str())).unwrap()
    }

    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn serves_with_sslmode_disable() {
        let database = Fresh::new().await;
        let store = PostgresSpaceRepository::open(&with_sslmode(&database, "disable")).unwrap();
        assert_eq!(store.load_meta_space_id().await, Ok(None));
        store.close().await;
    }

    /// Set in the child [`serves_in_plaintext_with_no_tls_selector_and_no_pgsslmode`]
    /// runs itself as, whose `PGSSLMODE` is unset.
    const PGSSLMODE_UNSET: &str = "INFINITY_CUBE_TEST_PGSSLMODE_UNSET";

    // A URL naming no TLS selector takes `PGSSLMODE`, and with it unset
    // connects without TLS (ADR 0177). Setting or removing a variable is
    // `unsafe`, which `unsafe_code = "forbid"` rules out, so the test runs
    // itself again as a child process with `PGSSLMODE` removed. The stand-in
    // declines TLS and refuses a plaintext startup with words of its own, so
    // reaching it in plaintext shows the transport chosen whether or not the
    // configured server also offers TLS; the configured server then serves.
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn serves_in_plaintext_with_no_tls_selector_and_no_pgsslmode() {
        const NAME: &str =
            "given_its_connection::serves_in_plaintext_with_no_tls_selector_and_no_pgsslmode";
        if std::env::var_os(PGSSLMODE_UNSET).is_none() {
            let child = std::process::Command::new(std::env::current_exe().unwrap())
                .args(["--exact", NAME, "--include-ignored", "--nocapture"])
                .env(PGSSLMODE_UNSET, "1")
                .env_remove("PGSSLMODE")
                .output()
                .unwrap();
            let stdout = String::from_utf8_lossy(&child.stdout);
            assert!(
                child.status.success() && stdout.contains("1 passed"),
                "the child with PGSSLMODE unset passes: {stdout}{}",
                String::from_utf8_lossy(&child.stderr)
            );
            return;
        }
        let server = StandIn::start(Behaviour::Refuse("28000", "reached in plaintext")).await;
        let silent = DatabaseUrl::parse(Some(&format!(
            "postgres://cube:unused@127.0.0.1:{}/cube",
            server.port()
        )))
        .unwrap();
        let store = PostgresSpaceRepository::open(&silent).unwrap();
        let answer = store.load_meta_space_id().await;
        store.close().await;
        assert!(
            format!("{answer:?}").contains("reached in plaintext"),
            "the client starts up in plaintext: {answer:?}"
        );
        let database = Fresh::new().await;
        let store = PostgresSpaceRepository::open(&without_tls_selectors(&database)).unwrap();
        assert_eq!(store.load_meta_space_id().await, Ok(None));
        store.close().await;
    }

    // `pg` reads `require` as `verify-full`, so against a server that
    // declines TLS it is refused, not served in plaintext. The server is the
    // loopback stand-in, which declines TLS and, were the client to go on in
    // plaintext, refuses its startup with a code of its own.
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn refuses_sslmode_require_against_a_server_without_tls_unclassified() {
        let server = StandIn::start(Behaviour::Refuse("28000", "reached in plaintext")).await;
        let url = DatabaseUrl::parse(Some(&format!(
            "postgres://cube:unused@127.0.0.1:{}/cube?sslmode=require",
            server.port()
        )))
        .unwrap();
        let store = PostgresSpaceRepository::open(&url).unwrap();
        let answer = store.load_meta_space_id().await;
        store.close().await;
        let Err(RepositoryError::Unclassified(words)) = &answer else {
            panic!("unclassified: {answer:?}");
        };
        assert!(
            words.to_lowercase().contains("tls"),
            "the refusal is the server declining TLS: {words}"
        );
        assert!(
            !words.contains("reached in plaintext"),
            "the client never goes on in plaintext: {words}"
        );
    }
}

/// Where the store finds its tables: through the role's `search_path`, as
/// its statements do, whatever the role may do with them, as the TypeScript
/// store, which checks for no table, finds them.
mod given_where_its_tables_are {
    use super::*;

    // A role granted nothing on the tables still sees that they exist, so
    // its read is refused by the server (`42501`), unclassified as the
    // TypeScript store leaves it, not answered as a database missing tables.
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn leaves_a_role_granted_nothing_on_the_tables_unclassified_naming_42501() {
        let database = Fresh::new().await;
        let role = format!("cube_role_{}", uuid::Uuid::new_v4().simple());
        database
            .execute(&format!(
                "CREATE ROLE {role} LOGIN PASSWORD 'granted-nothing'"
            ))
            .await;
        let mut url = database.url.clone();
        // `sqlx` applies a query `user` or `password` after the authority,
        // so either would override the role's.
        let kept: Vec<(String, String)> = url
            .query_pairs()
            .filter(|(key, _)| key != "user" && key != "password")
            .map(|(key, value)| (key.into_owned(), value.into_owned()))
            .collect();
        if kept.is_empty() {
            url.set_query(None);
        } else {
            url.query_pairs_mut().clear().extend_pairs(kept);
        }
        url.set_username(&role).unwrap();
        url.set_password(Some("granted-nothing")).unwrap();
        let store = PostgresSpaceRepository::open(&DatabaseUrl::parse(Some(url.as_str())).unwrap())
            .unwrap();
        let answer = store.load_aggregate().await;
        store.close().await;
        database.execute(&format!("DROP ROLE {role}")).await;
        let Err(RepositoryError::Unclassified(words)) = &answer else {
            panic!("unclassified: {answer:?}");
        };
        assert!(words.contains("42501"), "names 42501: {words}");
    }

    // Tables in a schema the database's `search_path` names are the ones
    // its statements reach, so the store serves over them.
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn serves_over_tables_in_a_schema_its_search_path_names() {
        let database = Fresh::new().await;
        database
            .execute(&format!(
                "ALTER SCHEMA public RENAME TO app; CREATE SCHEMA public; \
                 ALTER DATABASE {} SET search_path = app",
                database.name
            ))
            .await;
        let store = database.open();
        let answer = store.load_meta_space_id().await;
        store.close().await;
        assert_eq!(answer, Ok(None));
    }
}

/// `jsonb` stores an object's keys sorted by length, then by bytes, so the
/// content a Resource or a placement holds comes back in that order rather
/// than the order committed. The contract compares content whatever its key
/// order (`repository_contract::InKeyOrder`), as TypeScript's `toEqual`
/// does; this pins the order PostgreSQL answers and what Export writes of it.
mod given_content_jsonb_reorders {
    use super::*;
    use repository_contract::content::holding_a_missing_plugin;
    use repository_contract::{
        EMPTY_ASSET_REF, InKeyOrder as _, RESOURCE_ID, SECOND_RESOURCE_ID, SPACE_ID,
        commit as commit_of, seed, update as update_at,
    };

    const KIND: &str = "vnd.example.chart";

    /// The Space committed: the missing plugin's content and its Map content
    /// each with keys out of `jsonb`'s order, at every depth.
    fn committed() -> SpaceSnapshot {
        holding_a_missing_plugin(
            "Chart",
            KIND,
            "Flow",
            &format!(
                r#"{{"source":"{EMPTY_ASSET_REF}","legend":"a longer value","options":{{"direction":"TD","at":[1,2.5,null,{{"nested":true,"id":7}}]}}}}"#
            ),
            Some(r#"{"zoom":2,"at":["ink",{"label":"x","id":7}]}"#),
        )
    }

    /// The Space before the commit: other content and Map content, so the
    /// commit rewrites the Space row and the missing plugin's Resource row.
    fn before() -> SpaceSnapshot {
        holding_a_missing_plugin(
            "Chart",
            KIND,
            "Flow",
            &format!(r#"{{"source":"{EMPTY_ASSET_REF}","legend":"before"}}"#),
            Some(r#"{"zoom":1}"#),
        )
    }

    /// The same Space with every object's keys in `jsonb`'s order.
    fn in_jsonb_order() -> SpaceSnapshot {
        holding_a_missing_plugin(
            "Chart",
            KIND,
            "Flow",
            &format!(
                r#"{{"legend":"a longer value","source":"{EMPTY_ASSET_REF}","options":{{"at":[1,2.5,null,{{"id":7,"nested":true}}],"direction":"TD"}}}}"#
            ),
            Some(r#"{"at":["ink",{"id":7,"label":"x"}],"zoom":2}"#),
        )
    }

    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn loads_a_missing_plugins_content_in_jsonb_order_and_exports_it_as_any_store_does() {
        assert!(!intake::is_plugin_kind(KIND), "no plugin draws {KIND}");
        let database = Fresh::new().await;
        let writer = database.open();
        seed(&writer, &[&committed()]).await;
        writer.close().await;

        assert_stored_in_jsonb_order(&database, 0).await;
    }

    // The commit path writes the Space row and upserts the Resource rows
    // through statements of its own, so content committed there is held to
    // the order and bytes of content initialization installs.
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn commits_a_missing_plugins_content_then_loads_it_in_jsonb_order_and_exports_it() {
        assert!(!intake::is_plugin_kind(KIND), "no plugin draws {KIND}");
        let database = Fresh::new().await;
        let writer = database.open();
        seed(&writer, &[&before()]).await;
        let answer = writer
            .commit(commit_of(vec![update_at(&committed(), 0)]))
            .await
            .unwrap();
        writer.close().await;
        assert!(super::committed(&answer), "the update commits: {answer:?}");

        assert_stored_in_jsonb_order(&database, 1).await;
    }

    /// The Space the Fresh `database` holds, read through a new pool: it
    /// comes back at `revision` in `jsonb`'s key order, holding the values
    /// committed, and an Export of the aggregate writes the bytes an Export
    /// of a memory store holding the Space as committed writes.
    async fn assert_stored_in_jsonb_order(database: &Fresh, revision: u64) {
        let store = database.open();
        let stored = store
            .load_space(space(SPACE_ID))
            .await
            .unwrap()
            .expect("the Space is stored");
        assert_eq!(stored.revision.get(), revision, "the Space's revision");
        let loaded = stored.snapshot;
        assert_eq!(
            loaded,
            in_jsonb_order(),
            "the content and Map content come back in jsonb's key order"
        );
        assert_eq!(
            loaded.in_key_order(),
            committed().in_key_order(),
            "and hold the values committed"
        );

        let scratch = tempfile::tempdir().unwrap();
        let from_postgres = scratch.path().join("postgres");
        let _exported = host::export_aggregate(&store, &TokioFilesystem, &from_postgres)
            .await
            .unwrap();
        store.close().await;
        let memory = host::MemorySpaceRepository::new();
        seed(&memory, &[&committed()]).await;
        let from_memory = scratch.path().join("memory");
        let _exported = host::export_aggregate(&memory, &TokioFilesystem, &from_memory)
            .await
            .unwrap();

        let resource_file = format!("{SPACE_ID}/resources/{SECOND_RESOURCE_ID}.json");
        for file in [
            format!("{SPACE_ID}/space.json"),
            format!("{SPACE_ID}/resources/{RESOURCE_ID}.json"),
            resource_file.clone(),
        ] {
            assert_eq!(
                std::fs::read(from_postgres.join(&file)).unwrap(),
                std::fs::read(from_memory.join(&file)).unwrap(),
                "{file}: the bytes a memory store holding the Space as committed exports"
            );
        }
        assert_eq!(
            std::fs::read_to_string(from_postgres.join(&resource_file)).unwrap(),
            format!(
                "{{\n  \"id\": \"{SECOND_RESOURCE_ID}\",\n  \"title\": \"Flow\",\n  \"kind\": \"{KIND}\",\n  \"content\": {{\n    \"legend\": \"a longer value\",\n    \"options\": {{\n      \"at\": [\n        1,\n        2.5,\n        null,\n        {{\n          \"id\": 7,\n          \"nested\": true\n        }}\n      ],\n      \"direction\": \"TD\"\n    }},\n    \"source\": \"{EMPTY_ASSET_REF}\"\n  }}\n}}\n"
            ),
            "the content no plugin owns, written in ascending key order"
        );
        let space_file =
            std::fs::read_to_string(from_postgres.join(format!("{SPACE_ID}/space.json"))).unwrap();
        assert!(
            space_file.contains(
                "\"content\": {\n            \"at\": [\n              \"ink\",\n              {\n                \"id\": 7,\n                \"label\": \"x\"\n              }\n            ],\n            \"zoom\": 2\n          }"
            ),
            "the Map content, written in ascending key order: {space_file}"
        );
    }
}

/// `spaces` is read in id order whatever order its rows sit in the heap.
mod given_rows_out_of_id_order {
    use super::*;
    use repository_contract::{
        commit as commit_of, retitled, seed, space_holding, space_resource, target_space,
        update as update_at,
    };

    const META: &str = "c0000000-0000-4000-8000-0000000000f9";
    /// The Spaces Meta's Space Resources show, highest id first: the order
    /// they are created, each with the id of the Space Resource showing it.
    const CHILDREN: [(&str, &str); 3] = [
        (
            "c0000000-0000-4000-8000-0000000000f8",
            "c0000000-0000-4000-8000-0000000001f8",
        ),
        (
            "c0000000-0000-4000-8000-0000000000f7",
            "c0000000-0000-4000-8000-0000000001f7",
        ),
        (
            "c0000000-0000-4000-8000-0000000000f6",
            "c0000000-0000-4000-8000-0000000001f6",
        ),
    ];

    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn loads_and_lists_spaces_in_ascending_id_order_whatever_their_heap_order() {
        let database = Fresh::new().await;
        let store = database.open();
        seed(&store, &[&space_holding(META, "Meta", vec![])]).await;
        let mut space_resources = Vec::new();
        for (expected, (child, space_resource_id)) in (0..).zip(CHILDREN) {
            space_resources.push(space_resource(space_resource_id, child));
            let answer = store
                .commit(commit_of(vec![
                    update_at(
                        &space_holding(META, "Meta", space_resources.clone()),
                        expected,
                    ),
                    SpaceChange::Create {
                        space_id: space(child),
                        snapshot: target_space(child, "Child", &[]),
                    },
                ]))
                .await
                .unwrap();
            assert!(committed(&answer), "creating {child}: {answer:?}");
        }
        let lowest = CHILDREN[2].0;
        let answer = store
            .commit(commit_of(vec![update_at(
                &retitled(&target_space(lowest, "Child", &[]), "Moved"),
                0,
            )]))
            .await
            .unwrap();
        assert!(committed(&answer), "updating {lowest}: {answer:?}");
        store.close().await;

        let heap = database
            .scalar("SELECT string_agg(id::text, ',' ORDER BY ctid) FROM spaces")
            .await
            .unwrap();
        let ascending = [CHILDREN[2].0, CHILDREN[1].0, CHILDREN[0].0, META];
        assert_ne!(
            heap,
            ascending.join(","),
            "the rows sit in the heap out of id order, so a read without ORDER BY would answer them so"
        );
        let store = database.open();
        let AggregateLoad::Loaded(aggregate) = store.load_aggregate().await.unwrap() else {
            panic!("the store holds an aggregate");
        };
        let listed = store.list_spaces().await.unwrap();
        store.close().await;
        assert_eq!(
            aggregate
                .spaces
                .iter()
                .map(|loaded| loaded.snapshot.id.to_string())
                .collect::<Vec<_>>(),
            ascending,
            "load_aggregate answers in ascending id order"
        );
        assert_eq!(
            listed
                .iter()
                .map(|summary| summary.id.to_string())
                .collect::<Vec<_>>(),
            ascending,
            "list_spaces answers in ascending id order"
        );
    }
}

/// Rows a writer outside the commit decision changed inside the commit's own
/// transaction, through a trigger: a write meeting one fails or is refused
/// rather than landing over it, as on SQLite (Storage ST-4).
mod given_a_row_changed_outside_the_decision {
    use super::*;
    use repository_contract::{
        commit as commit_of, resource, retitled, seed, snapshot, space_holding, space_json,
        space_resource, target_document, target_space, update as update_at,
    };

    const META: &str = "c0000000-0000-4000-8000-0000000000e1";
    const CHILD: &str = "c0000000-0000-4000-8000-0000000000e2";
    const LINK: &str = "c0000000-0000-4000-8000-0000000001e2";
    const NOTE: &str = "c0000000-0000-4000-8000-0000000002e2";

    fn meta(linking: bool) -> SpaceSnapshot {
        let links = if linking {
            vec![space_resource(LINK, CHILD)]
        } else {
            vec![]
        };
        space_holding(META, "Meta", links)
    }

    /// The child, holding the one Resource `note` describes.
    fn child(note: serde_json::Value) -> SpaceSnapshot {
        snapshot(
            CHILD,
            &space_json(CHILD, target_document("Child"), vec![note]),
        )
    }

    /// Meta, updated at revision 0 to link the child, which is created.
    fn linking_a_created(child: SpaceSnapshot) -> SpaceCommit {
        commit_of(vec![
            update_at(&meta(true), 0),
            SpaceChange::Create {
                space_id: space(CHILD),
                snapshot: child,
            },
        ])
    }

    /// Have `statement` run after each `event` of `table`, inside whichever
    /// transaction caused it.
    async fn after(database: &Fresh, event: &str, table: &str, statement: &str) {
        database
            .execute(&format!(
                "CREATE FUNCTION outside() RETURNS trigger LANGUAGE plpgsql AS $$ \
                 BEGIN {statement}; RETURN NULL; END $$; \
                 CREATE TRIGGER outside AFTER {event} ON {table} \
                 FOR EACH STATEMENT EXECUTE FUNCTION outside();"
            ))
            .await;
    }

    async fn aggregate(store: &PostgresSpaceRepository) -> AggregateLoad {
        store.load_aggregate().await.unwrap()
    }

    // Meta's row is written before the child's (ascending by id), and the
    // trigger leaves a row holding the child's Resource, owned by Meta,
    // before the child's Resource row is inserted.
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn refuses_a_commit_creating_a_space_whose_resource_row_is_already_written() {
        let database = Fresh::new().await;
        let store = database.open();
        seed(&store, &[&meta(false)]).await;
        let before = aggregate(&store).await;
        after(
            &database,
            "UPDATE",
            "spaces",
            &format!(
                "INSERT INTO resources (id, space_id, document, updated_at) \
                 VALUES ('{NOTE}', '{META}', '{{}}', now()) ON CONFLICT DO NOTHING"
            ),
        )
        .await;
        let answer = store
            .commit(linking_a_created(child(resource(NOTE, "Note"))))
            .await;
        assert_eq!(
            answer,
            Ok(CommitResult::Rejected {
                message: format!("Resource {NOTE} already belongs to another space")
            }),
            "the created Space's Resource is not written over the row already there"
        );
        assert_eq!(
            aggregate(&store).await,
            before,
            "nothing the commit wrote is kept"
        );
        store.close().await;
    }

    // Not a row another writer left: `jsonb` refusing the created Space's
    // Resource (`22P05`) fails the commit unclassified, as on the update
    // path, rather than refusing it as a Resource another Space owns.
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn fails_a_created_space_whose_resource_jsonb_refuses_unclassified() {
        let database = Fresh::new().await;
        let store = database.open();
        seed(&store, &[&meta(false)]).await;
        let before = aggregate(&store).await;
        let answer = store
            .commit(linking_a_created(child(resource(NOTE, "nul \u{0} here"))))
            .await;
        let Err(RepositoryError::Unclassified(message)) = &answer else {
            panic!("expected an unclassified failure, got {answer:?}");
        };
        assert!(message.contains("22P05"), "{message}");
        assert_eq!(
            aggregate(&store).await,
            before,
            "nothing the commit wrote is kept"
        );
        store.close().await;
    }

    // Deleting the child's Resource rows deletes its Space row too, so the
    // Space row is gone when the commit deletes it.
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn fails_a_commit_deleting_a_space_whose_row_is_already_gone() {
        let database = Fresh::new().await;
        let store = database.open();
        seed(
            &store,
            &[&meta(true), &target_space(CHILD, "Child", &[NOTE])],
        )
        .await;
        let before = aggregate(&store).await;
        after(
            &database,
            "DELETE",
            "resources",
            &format!("DELETE FROM spaces WHERE id = '{CHILD}'"),
        )
        .await;
        let answer = store
            .commit(commit_of(vec![
                SpaceChange::Delete {
                    space_id: space(CHILD),
                    expected_revision: host::Revision::FIRST,
                },
                update_at(&meta(false), 0),
            ]))
            .await;
        assert_eq!(
            answer,
            Err(RepositoryError::Unclassified(format!(
                "Space {CHILD} disappeared during commit"
            ))),
            "a deletion that removes no row fails the commit"
        );
        assert_eq!(
            aggregate(&store).await,
            before,
            "nothing the commit wrote is kept"
        );
        store.close().await;
    }

    // The update holds the child's row lock, and dropping the Resources it
    // no longer holds deletes its Space row, so the row is gone when the
    // commit writes it.
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn fails_a_commit_updating_a_space_whose_row_is_already_gone() {
        let database = Fresh::new().await;
        let store = database.open();
        let held = target_space(CHILD, "Child", &[NOTE]);
        seed(&store, &[&meta(true), &held]).await;
        let before = aggregate(&store).await;
        after(
            &database,
            "DELETE",
            "resources",
            &format!("DELETE FROM spaces WHERE id = '{CHILD}'"),
        )
        .await;
        let answer = store
            .commit(commit_of(vec![update_at(&retitled(&held, "Renamed"), 0)]))
            .await;
        assert_eq!(
            answer,
            Err(RepositoryError::Unclassified(format!(
                "Space {CHILD} disappeared under its row lock"
            ))),
            "an update that writes no row fails the commit"
        );
        assert_eq!(
            aggregate(&store).await,
            before,
            "nothing the commit wrote is kept"
        );
        store.close().await;
    }

    // A unique violation means a colliding row committed, so initialization
    // reads the store again to classify it. Here no such row exists: the
    // trigger raises `23505` itself, standing in for a colliding row deleted
    // before the read again, which no writer of either runtime does. The
    // store reads uninitialized, so there is nothing to classify and the
    // driver's failure is answered, unclassified, not unavailable.
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn fails_an_initialization_whose_collision_is_gone_when_read_again_unclassified() {
        let database = Fresh::new().await;
        let store = database.open();
        after(
            &database,
            "INSERT",
            "spaces",
            "RAISE unique_violation USING MESSAGE = 'a collision no row is left of'",
        )
        .await;
        let answer = store
            .initialize_aggregate(host::AggregateInput {
                meta_space_id: space(META),
                spaces: vec![meta(false)],
            })
            .await;
        // The words name the server's own source line, which differs
        // between servers.
        let Err(RepositoryError::Unclassified(message)) = &answer else {
            panic!("expected the driver's failure, unclassified, got {answer:?}");
        };
        assert!(
            message.contains("a collision no row is left of")
                && message.ends_with("(SQLSTATE 23505)"),
            "the driver's failure is answered: {message}"
        );
        assert_eq!(
            store.load_aggregate().await,
            Ok(AggregateLoad::Uninitialized),
            "nothing the initialization wrote is kept"
        );
        store.close().await;
    }

    /// A stored Space holding a Resource, and another stored Space.
    async fn owner_and_other(store: &PostgresSpaceRepository) -> (LoadedSpace, LoadedSpace) {
        let AggregateLoad::Loaded(loaded) = aggregate(store).await else {
            panic!("the store holds an aggregate");
        };
        let owner = loaded
            .spaces
            .iter()
            .find(|space| !space.snapshot.resources.is_empty())
            .expect("the fixture has a Space holding a Resource")
            .clone();
        let other = loaded
            .spaces
            .iter()
            .find(|space| space.snapshot.id != owner.snapshot.id)
            .expect("the fixture has a second Space")
            .clone();
        (owner, other)
    }

    // The update writes the owner's row under its row lock, and the trigger
    // then moves the owner's Resource row to the other Space, as a writer
    // outside the decision could leave it, before the Resource rows are read
    // again. As SQLite's `refuses_an_update_writing_a_resource_another_space_owns`
    // (`crates/host/tests/sqlite.rs`) and TypeScript's `#upsertResources`.
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn refuses_an_update_writing_a_resource_another_space_owns() {
        let database = Fresh::new().await;
        let store = seeded(database.open()).await;
        let (owner, other) = owner_and_other(&store).await;
        let before = aggregate(&store).await;
        let resource = owner.snapshot.resources[0].id.as_str().to_owned();
        let (owner_id, other_id) = (owner.snapshot.id.as_str(), other.snapshot.id.as_str());
        after(
            &database,
            "UPDATE",
            "spaces",
            &format!("UPDATE resources SET space_id = '{other_id}' WHERE id = '{resource}'"),
        )
        .await;
        assert_eq!(
            store.commit(rename(&owner, "Renamed")).await,
            Ok(CommitResult::Rejected {
                message: format!("Resource {resource} belongs to space {other_id}, not {owner_id}")
            }),
            "the update is refused rather than taking the other Space's Resource row"
        );
        assert_eq!(
            store.load_aggregate().await,
            Ok(before),
            "nothing the commit wrote is kept: the owner keeps its title and its Resource"
        );
        store.close().await;
    }
}

/// Every operation needs every table the migrations make, however few it
/// reads (Storage ST-7), on PostgreSQL as on SQLite.
mod given_a_database_missing_a_table {
    use super::*;

    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn fails_every_operation_as_broken_naming_the_table() {
        let database = Fresh::new().await;
        database.execute("DROP TABLE assets").await;
        let store = database.open();
        let answers = [
            store.load_meta_space_id().await.map(drop),
            store.list_spaces().await.map(drop),
            store.load_space(space(PRESENTATION)).await.map(drop),
            store.load_aggregate().await.map(drop),
        ];
        store.close().await;
        for answer in answers {
            assert!(
                matches!(&answer, Err(RepositoryError::BrokenStoredState(words)) if words.contains("assets")),
                "broken stored state naming the missing table: {answer:?}"
            );
        }
    }
}

/// The test-support hook the recreated-rows contract cases use: it replaces
/// one Space's Resource rows in the next commit writing that Space, and in no
/// other commit.
mod given_resource_rows_to_recreate_for_one_space {
    use super::*;
    use repository_contract::{
        commit as commit_of, retitled, seed, space_holding, space_resource, target_space,
        update as update_at,
    };

    const META: &str = "c0000000-0000-4000-8000-0000000000d1";
    const CHILD: &str = "c0000000-0000-4000-8000-0000000000d2";
    const LINK: &str = "c0000000-0000-4000-8000-0000000001d2";
    const NOTE: &str = "c0000000-0000-4000-8000-0000000002d2";

    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn leaves_them_to_the_next_commit_writing_that_space() {
        let database = Fresh::new().await;
        let store = database.open();
        let held = target_space(CHILD, "Child", &[NOTE]);
        let linking = space_holding(META, "Meta", vec![space_resource(LINK, CHILD)]);
        seed(&store, &[&linking, &held]).await;
        let child = loaded(&store, CHILD).await;
        store.recreate_before_row_lock(target_space(CHILD, "Child", &[]));

        let answer = store
            .commit(commit_of(vec![update_at(
                &retitled(&linking, "Renamed"),
                0,
            )]))
            .await
            .unwrap();
        assert!(committed(&answer), "{answer:?}");
        assert_eq!(
            loaded(&store, CHILD).await,
            child,
            "a commit writing another Space leaves the child's rows alone"
        );

        store.take_resource_writes();
        let answer = store
            .commit(commit_of(vec![update_at(&retitled(&held, "Renamed"), 0)]))
            .await
            .unwrap();
        assert!(committed(&answer), "{answer:?}");
        assert_eq!(
            store.take_resource_writes(),
            [NOTE],
            "the child's commit meets its rows recreated without the note, and writes it"
        );
        store.close().await;
    }
}

/// Closing the repository closes its connections.
mod given_a_closed_repository {
    use super::*;

    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn holds_no_connection_to_the_database() {
        let database = Fresh::new().await;
        let store = database.open();
        assert_eq!(store.load_meta_space_id().await, Ok(None));
        store.close().await;
        let others = format!(
            "SELECT count(*)::text FROM pg_stat_activity \
             WHERE datname = '{}' AND pid <> pg_backend_pid()",
            database.name
        );
        let deadline = std::time::Instant::now() + Duration::from_secs(10);
        loop {
            let open = database.scalar(&others).await.unwrap();
            if open == "0" {
                break;
            }
            assert!(
                std::time::Instant::now() < deadline,
                "the closed repository still holds {open} connection(s)"
            );
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    }
}
