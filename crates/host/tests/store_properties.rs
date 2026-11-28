//! Generated commit sequences on the memory store and on a SQLite file
//! (rust-sqlite-test-coverage 07): every step answers the same on both, and
//! both hold the same aggregate at the end, the file read again by a fresh
//! repository. The sequences, and what is and is not normalised before the
//! two are compared, are `commit_sequences`'; SQLite keeps the content key
//! order it is given, so it is compared exactly.
//!
//! The two stores share `decide_commit`, so a defect in it is the same on
//! both and passes here; the repository contract
//! (`tests/repository_contract/`) holds TypeScript's answers, and
//! `given_a_space_at_the_revision_ceiling` in `src/commit/tests.rs` and in
//! `tests/sqlite.rs` the ceiling's.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

mod commit_sequences;
#[allow(
    unused_macros,
    unused_imports,
    reason = "this binary uses the table's support, not its cases"
)]
mod repository_contract;
#[allow(dead_code, reason = "each test binary uses part of the support")]
mod sqlite_support;

use std::collections::BTreeSet;

use commit_sequences::{
    Case, Expected, Fixed, KeyOrder, Start, Step, Unlinking, compare_final, compare_steps, initial,
    memory_at, reordered, revision_statement, start_revisions,
};
use host::SqliteSpaceRepository;
use intake::{Resource, SpaceSnapshot};
use proptest::prelude::*;
use repository_contract::{SPACE_ID, resource, seed, space_holding};
use sqlite_support::{Migrated, execute};

/// A SQLite file holding the initial aggregate at the revisions `start`
/// puts it at, and a repository over it.
async fn sqlite_at(start: &[Start; 3]) -> (Migrated, SqliteSpaceRepository) {
    let file = Migrated::new().await;
    let store = SqliteSpaceRepository::open(&file.path());
    let spaces = initial();
    seed(&store, &spaces.iter().collect::<Vec<&SpaceSnapshot>>()).await;
    let statements: String = start_revisions(start)
        .into_iter()
        .map(|(space, revision)| revision_statement(space, revision))
        .collect();
    execute(&file.file, &statements).await;
    (file, store)
}

async fn run(case: Case) -> Vec<&'static str> {
    let (file, sqlite) = sqlite_at(&case.start).await;
    let memory = memory_at(&case.start);
    let kinds = compare_steps(&memory, &sqlite, "SQLite", KeyOrder::Kept, &case.steps).await;
    sqlite.close().await;
    let reopened = SqliteSpaceRepository::open(&file.path());
    compare_final(&memory, &reopened, "SQLite, read again", KeyOrder::Kept).await;
    reopened.close().await;
    kinds
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(64))]

    #[test]
    fn answers_every_commit_the_same_and_ends_holding_the_same_aggregate(
        case in commit_sequences::case(12)
    ) {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(run(case));
    }
}

/// The steps a generated case is made of reach each kind of answer: a
/// generator that only ever conflicted would hold little.
#[tokio::test]
async fn the_generated_steps_reach_every_kind_of_answer() {
    let steps = [
        Step::Retitle {
            space: 1,
            revision: Expected::Current,
        },
        Step::Retitle {
            space: 0,
            revision: Expected::Ahead,
        },
        Step::Create {
            space: 2,
            linked: false,
            meta_first: false,
        },
        Step::Create {
            space: 2,
            linked: true,
            meta_first: true,
        },
        Step::Move {
            from: 1,
            to: 2,
            index: 0,
            receiver_first: true,
        },
        Step::Delete {
            space: 1,
            unlinking: Unlinking::Dropped,
            updates_first: false,
            revision: Expected::Current,
        },
        Step::Twice {
            space: 1,
            delete_first: false,
        },
        Step::Retitle {
            space: 2,
            revision: Expected::Current,
        },
    ];
    let kinds = run(Case {
        start: [Start::First, Start::First, Start::BelowCeiling(0)],
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

/// The steps the TypeScript differential's scenarios name, beyond those
/// above, each make the answer that scenario exists to reach on the memory
/// store: placing Resources, drawing an Edge and adding a Graph commit, and
/// committing at revisions near the ceiling reaches it and then fails.
#[tokio::test]
async fn the_map_internal_and_ceiling_steps_reach_the_answers_they_exist_for() {
    assert_reaches(
        commit_sequences::map_internal_and_ceiling_steps(),
        "the map-internal and ceiling steps",
    )
    .await;
}

/// The TypeScript differential's scenarios that need no link or ceiling
/// each make the answer that scenario exists to reach.
#[tokio::test]
async fn the_scenario_steps_reach_the_answers_they_exist_for() {
    assert_reaches(commit_sequences::scenario_steps(), "the scenario steps").await;
}

/// Run `fixed` on the memory store and on SQLite, comparing every answer and
/// the final aggregate, and assert that each step made the answer it exists
/// to reach: a step that made no commit, or a different answer on both,
/// fails here rather than passing as agreement.
async fn assert_reaches(fixed: Fixed, sequence: &str) {
    let answered = run(fixed.case()).await;
    assert_eq!(
        answered,
        fixed.answers(),
        "{sequence}: each step reaches the answer it exists for, on memory and SQLite alike"
    );
}

/// The linking and deletion steps make the answers the TypeScript
/// differential's deletion scenarios exist to reach: an ordinary Space links
/// another; deleting a Space two Spaces link, alone, is a conflict
/// ("partial-deletion"); deleting it while each Space linking it changes but
/// keeps its link is refused ("incomplete-deletion-proposal"); deleting it
/// while each drops its link, Meta and an ordinary Space both, commits
/// ("complete-deletion"); and a link to a Space no longer stored is refused.
#[tokio::test]
async fn the_linking_and_deletion_steps_reach_the_answers_they_exist_for() {
    assert_reaches(
        commit_sequences::linking_and_deletion_steps(),
        "the linking and deletion steps",
    )
    .await;
}

/// `reordered` lists two or more Resources out of ascending order for every
/// `order`, so no generated snapshot reaches a store already sorted.
#[test]
fn reorders_every_snapshot_of_two_or_more_resources_out_of_ascending_order() {
    for count in 2_u8..=4 {
        let resources: Vec<Resource> = (0..count)
            .map(|index| {
                let id = format!("c2000000-0000-4000-8000-0000000001{index:02x}");
                let holder = space_holding(SPACE_ID, "Holder", vec![resource(&id, "Note")]);
                holder.resources.into_iter().next().unwrap()
            })
            .collect();
        for order in 0..=u8::MAX {
            let ids: Vec<String> = reordered(resources.clone(), order)
                .iter()
                .map(|held| held.id.as_str().to_owned())
                .collect();
            assert!(
                ids.windows(2).any(|pair| pair[0] > pair[1]),
                "{count} Resources reordered by {order:#04x}: {ids:?}"
            );
        }
    }
}
