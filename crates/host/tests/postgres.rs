//! The PostgreSQL store (Storage ST-3, ADR 0177): its rows, its timestamps,
//! its isolation, its pool and its TLS, each on a database of its own. Every
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

use std::sync::Arc;
use std::time::Duration;

use host::{
    CommitResult, DatabaseUrl, LoadedSpace, PoolSettings, PostgresSpaceRepository, Probe,
    RepositoryError, SpaceChange, SpaceCommit, SpaceRepository, Step, TokioFilesystem,
    import_directory,
};
use http_conformance::Counted;
use intake::SpaceId;
use postgres_support::Fresh;
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
        reached.notified().await;
        let losing = {
            let commit = rename(&current, "Second");
            tokio::spawn(async move {
                let answer = second.commit(commit).await;
                second.close().await;
                answer
            })
        };
        // The second waits on the first's row lock.
        tokio::time::sleep(Duration::from_millis(300)).await;
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
        reached.notified().await;
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

    fn with_query(database: &Fresh, query: &str) -> DatabaseUrl {
        let mut url = database.url.clone();
        url.set_query(Some(query));
        DatabaseUrl::parse(Some(url.as_str())).unwrap()
    }

    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn serves_with_sslmode_disable_and_with_no_sslmode() {
        let database = Fresh::new().await;
        for url in [
            database.database_url(),
            with_query(&database, "sslmode=disable"),
        ] {
            let store = PostgresSpaceRepository::open(&url).unwrap();
            assert_eq!(store.load_meta_space_id().await, Ok(None));
            store.close().await;
        }
    }

    // `pg` reads `require` as `verify-full`, so against a server with no TLS
    // it is refused, not served in plaintext or unverified.
    #[tokio::test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    async fn refuses_sslmode_require_against_a_server_without_tls_unclassified() {
        let database = Fresh::new().await;
        let store =
            PostgresSpaceRepository::open(&with_query(&database, "sslmode=require")).unwrap();
        let answer = store.load_meta_space_id().await;
        assert!(
            matches!(answer, Err(RepositoryError::Unclassified(_))),
            "{answer:?}"
        );
        store.close().await;
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
