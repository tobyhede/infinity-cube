//! Generated commit sequences on the memory store and on a PostgreSQL
//! database (rust-postgresql-store 11), the port of the TypeScript
//! differential `aggregate-commit-differential.test.ts`: every step answers
//! the same on both, both hold the same aggregate after every step, exported
//! revisions among it, and both hold it at the end, the database read again
//! through a new pool. Its scenarios are ported as fixed sequences, each
//! asserting the answer it exists to reach: those needing no deletion and
//! no ceiling in `scenario_steps`, "partial-deletion",
//! "incomplete-deletion-proposal" and "complete-deletion" in
//! `deletion_from_several_parents_steps`, on a Space three ordinary Spaces
//! refer to, as the TypeScript parents refer to its shared Space. The sequences are
//! `commit_sequences`', the ones `tests/store_properties.rs` runs on SQLite.
//!
//! **Which side normalises what.** PostgreSQL's `jsonb` stores an object's
//! keys sorted by length, then by bytes, so it answers the content of a
//! Resource of no plugin, its Map content and a Map's positions (an object
//! keyed by Resource id) in that order rather than the order committed,
//! which the memory store keeps; the comparison therefore puts every JSON
//! object on both sides in ascending key order ([`KeyOrder::Reordered`]), as
//! the TypeScript differential's `toEqual` ignores key order, and the values
//! must agree. Resource order is
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

use commit_sequences::{
    Case, Expected, Fixed, KeyOrder, Referrers, Start, Step, compare_final, compare_steps, initial,
    memory_at, revision_statement, start_revisions,
};
use host::PostgresSpaceRepository;
use intake::SpaceSnapshot;
use postgres_support::Fresh;
use proptest::prelude::*;
use repository_contract::seed;

/// How many generated cases run. Each clones a database from the migrated
/// template and runs up to eleven commits, so this bounds the `rust` job's
/// PostgreSQL step.
const CASES: u32 = 64;

/// How many shrinking iterations a failing case may run before proptest
/// reports the smallest case found so far. Each iteration runs a whole case
/// on a database cloned for it, as a generated case does, so this bounds
/// shrinking at twice the cost of the generated cases. Left unset, proptest
/// takes four times `CASES` and sets no time limit.
const MAX_SHRINK_ITERS: u32 = 128;

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
    #![proptest_config(ProptestConfig {
        max_shrink_iters: MAX_SHRINK_ITERS,
        ..ProptestConfig::with_cases(CASES)
    })]

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

/// Run `fixed` on the memory store and on PostgreSQL, comparing every answer,
/// the aggregate each holds after every step and the final aggregate, and
/// assert that each step made the answer it
/// exists to reach: a step that made no commit, or a different answer on
/// both, fails here rather than passing as agreement.
async fn assert_reaches(fixed: Fixed, sequence: &str) {
    let answered = run(fixed.case()).await;
    assert_eq!(
        answered,
        fixed.answers(),
        "{sequence}: each step reaches the answer it exists for, on memory and PostgreSQL alike"
    );
}

/// A fixed sequence reaching every kind of answer on PostgreSQL, Resources of
/// no plugin, placements holding Map content and the ceiling among them, so
/// the comparison holds for each whatever the generator happens to draw.
#[tokio::test]
#[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
async fn answers_every_kind_of_answer_as_the_memory_store_does() {
    let steps = vec![
        (
            Step::Add {
                space: 1,
                note: 1,
                of_no_plugin: true,
                revision: Expected::Current,
            },
            "committed",
        ),
        (
            Step::Add {
                space: 1,
                note: 2,
                of_no_plugin: true,
                revision: Expected::Current,
            },
            "committed",
        ),
        (Step::Arrange { space: 1, x: 40 }, "committed"),
        (
            Step::Retitle {
                space: 0,
                revision: Expected::Ahead,
            },
            "conflict",
        ),
        (
            Step::Move {
                from: 1,
                to: 2,
                index: 3,
                receiver_first: true,
            },
            "committed",
        ),
        (
            Step::Retitle {
                space: 2,
                revision: Expected::Current,
            },
            "invariant-failure",
        ),
        (
            Step::Create {
                space: 2,
                from_meta: true,
                meta_first: false,
            },
            "committed",
        ),
        (
            Step::Twice {
                space: 1,
                delete_first: true,
            },
            "rejected",
        ),
        (Step::DropGraph { space: 0 }, "aggregate-refused"),
        (
            Step::Delete {
                space: 2,
                referrers: Referrers::Dropped,
                updates_first: true,
                revision: Expected::Current,
            },
            "committed",
        ),
    ];
    assert_reaches(
        Fixed {
            start: [Start::First, Start::First, Start::BelowCeiling(1)],
            steps,
        },
        "every kind of answer",
    )
    .await;
}

/// The TypeScript differential's scenarios that need no Space Resource
/// added, no deletion and no ceiling, each compared on PostgreSQL on every
/// run, as that test's fixed `examples` are.
#[tokio::test]
#[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
async fn answers_each_differential_scenario_as_the_memory_store_does() {
    assert_reaches(commit_sequences::scenario_steps(), "the scenario steps").await;
}

/// Placing Resources, drawing an Edge, adding a Graph and committing near
/// the revision ceiling.
#[tokio::test]
#[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
async fn answers_the_map_internal_and_ceiling_steps_as_the_memory_store_does() {
    assert_reaches(
        commit_sequences::map_internal_and_ceiling_steps(),
        "the map-internal and ceiling steps",
    )
    .await;
}

/// Giving an ordinary Space a Space Resource referring to another, and
/// deleting a Space Meta and an ordinary Space refer to with the Spaces
/// referring to it untouched, retitled or dropping their Space Resources.
#[tokio::test]
#[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
async fn answers_the_reference_and_deletion_steps_as_the_memory_store_does() {
    assert_reaches(
        commit_sequences::reference_and_deletion_steps(),
        "the reference and deletion steps",
    )
    .await;
}

/// The TypeScript differential's "partial-deletion",
/// "incomplete-deletion-proposal" and "complete-deletion", on a Space three
/// ordinary Spaces refer to, each compared on PostgreSQL on every run.
#[tokio::test]
#[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
async fn answers_the_deletion_scenarios_as_the_memory_store_does() {
    assert_reaches(
        commit_sequences::deletion_from_several_parents_steps(),
        "the deletion scenarios",
    )
    .await;
}

/// An Export recorded for a Space is kept as later commits rewrite its row,
/// on memory and PostgreSQL alike.
#[tokio::test]
#[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
async fn keeps_each_exported_revision_as_the_memory_store_does() {
    assert_reaches(commit_sequences::export_steps(), "the export steps").await;
}
