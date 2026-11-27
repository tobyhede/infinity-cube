//! Generated commit sequences on the memory store and on a PostgreSQL
//! database (rust-postgresql-store 11), the port of the TypeScript
//! differential `aggregate-commit-differential.test.ts`: every step answers
//! the same on both, and both hold the same aggregate at the end, the
//! database read again through a new pool. The sequences are
//! `commit_sequences`', the ones `tests/store_properties.rs` runs on SQLite.
//!
//! **Which side normalises what.** PostgreSQL's `jsonb` stores an object's
//! keys sorted by length, then by bytes, so it answers the content of a
//! Resource of no plugin, and its Map content, in that order rather than the
//! order committed, which the memory store keeps; the comparison therefore
//! puts every JSON object on both sides in ascending key order
//! ([`KeyOrder::Reordered`]), as the TypeScript differential's `toEqual`
//! ignores key order, and the values must agree. Resource order is
//! normalised by neither side: every snapshot committed lists its Resources
//! out of id order, and each store's answers and stored Spaces are asserted
//! ascending by id (Storage ST-21) before the two are compared. The order
//! PostgreSQL answers content in, and the bytes Export writes of it, are
//! `given_content_jsonb_reorders` in `tests/postgres.rs`.
//!
//! This compares two stores sharing `decide_commit`, so a defect in it
//! passes here: the repository contract's table, run on PostgreSQL by
//! `tests/postgres.rs`, holds TypeScript's absolute answers and comes first.
//! Each case clones a database of its own, so the cases are few: the `rust`
//! job's PostgreSQL step must stay under five minutes.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

mod commit_sequences;
#[allow(dead_code, reason = "each test binary uses part of the support")]
mod postgres_support;
#[allow(
    unused_macros,
    unused_imports,
    reason = "this binary uses the table's support, not its cases"
)]
mod repository_contract;

use std::collections::BTreeSet;

use commit_sequences::{
    Case, Expected, KeyOrder, Start, Step, compare_final, compare_steps, initial, memory_at,
    revision_statement, start_revisions,
};
use host::{PostgresSpaceRepository, SpaceRepository};
use intake::SpaceSnapshot;
use postgres_support::Fresh;
use proptest::prelude::*;
use repository_contract::seed;

/// How many generated cases run. Each clones a database from the migrated
/// template and runs up to eleven commits, so this bounds the `rust` job's
/// PostgreSQL step.
const CASES: u32 = 32;

/// A database holding the initial aggregate at the revisions `start` puts
/// it at, and a repository over it.
async fn postgres_at(start: &[Start; 3]) -> (Fresh, PostgresSpaceRepository) {
    let database = Fresh::new().await;
    let store = database.open();
    let spaces = initial();
    seed(&store, &spaces.iter().collect::<Vec<&SpaceSnapshot>>()).await;
    let statements: String = start_revisions(start)
        .into_iter()
        .map(|(space, revision)| revision_statement(space, revision))
        .collect();
    database.execute(&statements).await;
    (database, store)
}

async fn run(case: Case) -> Vec<&'static str> {
    let (database, postgres) = postgres_at(&case.start).await;
    let memory = memory_at(&case.start);
    let kinds = compare_steps(
        &memory,
        &postgres,
        "PostgreSQL",
        KeyOrder::Reordered,
        &case.steps,
    )
    .await;
    postgres.close().await;
    let reopened = database.open();
    compare_final(
        &memory,
        &reopened,
        "PostgreSQL, reopened",
        KeyOrder::Reordered,
    )
    .await;
    reopened.close().await;
    kinds
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(CASES))]

    // Case: gives memory and PostgreSQL the same public outcome over generated aggregate changes
    #[test]
    #[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
    fn answers_every_commit_as_the_memory_store_does_and_ends_holding_the_same_aggregate(
        case in commit_sequences::case(12)
    ) {
        tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .build()
            .unwrap()
            .block_on(run(case));
    }
}

/// A fixed sequence reaching every kind of answer on PostgreSQL, Resources of
/// no plugin, placements holding Map content and the ceiling among them, so
/// the comparison holds for each whatever the generator happens to draw.
#[tokio::test]
#[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
async fn answers_every_kind_of_answer_as_the_memory_store_does() {
    let steps = [
        Step::Add {
            space: 1,
            note: 1,
            of_no_plugin: true,
            revision: Expected::Current,
        },
        Step::Add {
            space: 1,
            note: 2,
            of_no_plugin: true,
            revision: Expected::Current,
        },
        Step::Arrange { space: 1, x: 40 },
        Step::Retitle {
            space: 0,
            revision: Expected::Ahead,
        },
        Step::Move {
            from: 1,
            to: 2,
            index: 3,
            receiver_first: true,
        },
        Step::Retitle {
            space: 2,
            revision: Expected::Current,
        },
        Step::Create {
            space: 2,
            linked: true,
            meta_first: false,
        },
        Step::Twice {
            space: 1,
            delete_first: true,
        },
        Step::DropGraph { space: 0 },
        Step::Delete {
            space: 2,
            unlinked: true,
            meta_first: true,
            revision: Expected::Current,
        },
    ];
    let kinds = run(Case {
        start: [Start::First, Start::First, Start::BelowCeiling(1)],
        steps: steps.into_iter().map(|step| (step, 0x81)).collect(),
    })
    .await;
    assert_eq!(
        kinds.into_iter().collect::<BTreeSet<_>>(),
        BTreeSet::from([
            "aggregate-refused",
            "committed",
            "conflict",
            "invariant-failure",
            "rejected"
        ]),
    );
}
