//! The Rust counterpart of the TypeScript repository contract
//! (`spaceRepositoryContract`, `test/support/repository-contract.ts`): its
//! cases written once, here, and run against every Rust store by
//! [`repository_cases!`], as `http_conformance::cases!` runs the HTTP cases
//! against every adapter. Each case asserts the contract's own answers,
//! values read back from the store (after a reopen where the store keeps
//! anything), never agreement with another store.
//!
//! A case porting a contract case carries `// Case: <its name>`, which
//! `test/unit/repository-contract-rust-ports.test.ts` holds to the contract.
//! A case needing what a store's [`Harness`] cannot provide answers
//! [`Unprovided`], and its test says it was skipped and why rather than
//! passing empty, as the TypeScript contract's `context.skip()` does.

#![allow(
    dead_code,
    reason = "each test binary running the table uses part of its support"
)]

pub mod assets;
pub mod broken;
pub mod commits;
pub mod content;
pub mod lifecycle;

use std::sync::Arc;

use host::{
    AggregateInput, AggregateLoad, AssetStored, CommitResult, InitializeResult, LoadedAggregate,
    LoadedSpace, ReplaceResult, RepositoryError, Revision, SpaceChange, SpaceCommit, SpaceConflict,
    SpaceRepository,
};
use intake::json::JsonValue;
use intake::{SpaceId, SpaceSnapshot};
use serde_json::{Value, json};

/// The contract's Meta Space, and the first Space every case seeds.
pub const SPACE_ID: &str = "c0000000-0000-4000-8000-000000000001";
pub const OTHER_SPACE_ID: &str = "c0000000-0000-4000-8000-000000000002";
pub const MISSING_SPACE_ID: &str = "c0000000-0000-4000-8000-000000000003";
pub const RESOURCE_ID: &str = "c0000000-0000-4000-8000-000000000010";
pub const SECOND_RESOURCE_ID: &str = "c0000000-0000-4000-8000-000000000011";
pub const OTHER_RESOURCE_ID: &str = "c0000000-0000-4000-8000-000000000012";
pub const LINK_RESOURCE_ID: &str = "c0000000-0000-4000-8000-000000000013";
pub const THIRD_SPACE_RESOURCE_ID: &str = "c0000000-0000-4000-8000-000000000014";
pub const FOURTH_SPACE_RESOURCE_ID: &str = "c0000000-0000-4000-8000-000000000015";
pub const MISSING_RESOURCE_ID: &str = "c0000000-0000-4000-8000-000000000016";
pub const GRAPH_ID: &str = "c0000000-0000-4000-8000-000000000020";
pub const MAP_ID: &str = "c0000000-0000-4000-8000-000000000021";
pub const SECOND_GRAPH_ID: &str = "c0000000-0000-4000-8000-000000000022";
pub const SECOND_MAP_ID: &str = "c0000000-0000-4000-8000-000000000023";
pub const THIRD_GRAPH_ID: &str = "c0000000-0000-4000-8000-000000000024";
pub const FOURTH_GRAPH_ID: &str = "c0000000-0000-4000-8000-000000000025";

/// The empty asset's reference, which a Markdown Resource with no text names.
pub const EMPTY_ASSET_REF: &str = "/assets/47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU";

/// The highest revision a store keeps.
pub const CEILING: u64 = Revision::CEILING;

/// What a case needed of a store's harness that the store cannot provide,
/// and why: the case is skipped, saying so.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Unprovided(pub &'static str);

/// A case's outcome: it ran, or it needed what the harness cannot provide.
pub type Ran = Result<(), Unprovided>;

/// The stored states the contract's broken-state cases arrange, which no
/// valid write produces (`arrangeBrokenState`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BrokenState {
    /// The Meta Space's document has no title.
    InvalidSpaceDocument,
    /// A second Space no Space Resource references.
    InvalidAggregate,
}

impl BrokenState {
    pub const ALL: [Self; 2] = [Self::InvalidSpaceDocument, Self::InvalidAggregate];
}

/// A store under test, and what the contract asks of it beyond the
/// repository seam (`RepositoryHarness`). A member the store cannot provide
/// answers [`Unprovided`].
#[allow(async_fn_in_trait, reason = "the cases run on one test's own runtime")]
pub trait Harness: Sized {
    /// The store.
    type Store: SpaceRepository;

    /// Whether the store keeps the key order of the content it is given,
    /// which decides how [`assert_same!`] compares what it answers.
    const KEY_ORDER: KeyOrder = KeyOrder::Kept;

    /// A fresh, empty store.
    async fn open() -> Self;

    /// The store as it stands now.
    fn store(&self) -> &Arc<Self::Store>;

    /// Close the store and open it again as a fresh host over what it kept.
    async fn reopen(&mut self) -> Result<(), Unprovided>;

    /// Store `state` directly, with `space` as the Meta identity and `other`
    /// as the second Space where it needs one, answering the Meta identity a
    /// replacement must expect.
    async fn arrange_broken_state(
        &mut self,
        state: BrokenState,
        space: SpaceId,
        other: SpaceId,
    ) -> Result<SpaceId, Unprovided>;

    /// Remove the stored Meta identity, leaving every Space stored.
    async fn remove_meta_identity(&mut self) -> Result<(), Unprovided>;

    /// Write a stored Space's revision, and its exported revision when
    /// `exported` is given, as text, past the store's own codec.
    async fn write_raw_revision(
        &mut self,
        space: SpaceId,
        revision: &str,
        exported: Option<Option<&str>>,
    ) -> Result<(), Unprovided>;

    /// Every Resource id the repository has asked the store to write a row
    /// for (to insert or upsert) since the last call, in the order asked,
    /// including a write its transaction later rolled back
    /// (`recordResourceWrites`).
    async fn take_resource_writes(&mut self) -> Result<Vec<String>, Unprovided>;

    /// Replace `snapshot`'s Space's Resource rows with `snapshot`'s inside
    /// the next commit that writes that Space, after the commit's read and
    /// before its row lock, in the commit's own transaction
    /// (`recreateBeforeRowLock`).
    async fn recreate_before_row_lock(&mut self, snapshot: SpaceSnapshot)
    -> Result<(), Unprovided>;

    /// Close the store.
    async fn close(self);
}

/// The id `text` names.
pub fn id(text: &str) -> SpaceId {
    SpaceId::parse(text).unwrap()
}

/// A revision.
pub fn revision(value: u64) -> Revision {
    Revision::new(value).unwrap()
}

/// A snapshot of Space `space_id` from its JSON, as intake decodes it, each
/// Resource's content keys in its plugin's order, as a file Export wrote
/// holds them and as a store answers them (`serde_json` sorts them).
pub fn snapshot(space_id: &str, value: &Value) -> SpaceSnapshot {
    let parsed = intake::json::parse(&in_plugin_order(value)).unwrap();
    intake::decode_space_snapshot(&parsed, id(space_id))
        .unwrap_or_else(|refusals| panic!("the fixture decodes: {refusals:?}"))
}

/// A snapshot of Space `space_id` from JSON text written out, every object's
/// keys in the order written, as intake decodes it.
pub fn snapshot_text(space_id: &str, text: &str) -> SpaceSnapshot {
    let parsed = intake::json::parse(text).unwrap();
    intake::decode_space_snapshot(&parsed, id(space_id))
        .unwrap_or_else(|refusals| panic!("the fixture decodes: {refusals:?}"))
}

/// `space`'s JSON text, each Resource's content keys in its plugin's order
/// and every other object's as `serde_json` keeps them.
fn in_plugin_order(space: &Value) -> String {
    let mut space = space.clone();
    let mut contents = Vec::new();
    if let Some(resources) = space.get_mut("resources").and_then(Value::as_array_mut) {
        for (index, resource) in resources.iter_mut().enumerate() {
            let document = &mut resource["document"];
            let order = document["kind"]
                .as_str()
                .and_then(intake::plugin_content_keys)
                .unwrap_or_default();
            let Some(content) = document.get("content").and_then(Value::as_object) else {
                continue;
            };
            let mut keys: Vec<&String> = order
                .iter()
                .filter_map(|key| content.get_key_value(key.name).map(|(name, _)| name))
                .collect();
            let rest: Vec<&String> = content.keys().filter(|key| !keys.contains(key)).collect();
            keys.extend(rest);
            let text = keys
                .iter()
                .map(|key| format!("{}:{}", Value::from(key.as_str()), content[*key]))
                .collect::<Vec<_>>()
                .join(",");
            let placeholder = format!("\u{0}content-{index}");
            contents.push((
                Value::from(placeholder.clone()).to_string(),
                format!("{{{text}}}"),
            ));
            document["content"] = Value::from(placeholder);
        }
    }
    contents
        .into_iter()
        .fold(space.to_string(), |text, (placeholder, content)| {
            text.replace(&placeholder, &content)
        })
}

/// A Space's JSON from its document and its Resources.
pub fn space_json(space_id: &str, document: Value, resources: Vec<Value>) -> Value {
    json!({ "id": space_id, "document": document, "resources": resources })
}

/// A Markdown Resource with no text.
pub fn resource(resource_id: &str, title: &str) -> Value {
    json!({
        "id": resource_id,
        "document": { "title": title, "kind": "markdown", "content": { "url": EMPTY_ASSET_REF } },
    })
}

/// A Space Resource showing `target`, selecting `MAP_ID` and `GRAPH_ID`.
pub fn space_resource(resource_id: &str, target: &str) -> Value {
    json!({
        "id": resource_id,
        "document": {
            "title": format!("Open {target}"),
            "kind": "space",
            "content": { "spaceId": target, "map": MAP_ID, "graph": GRAPH_ID },
        },
    })
}

/// A Space with Resources and no Maps.
pub fn space(space_id: &str, title: &str, resource_ids: &[&str]) -> SpaceSnapshot {
    snapshot(space_id, &space_value(space_id, title, resource_ids))
}

/// [`space`]'s JSON.
pub fn space_value(space_id: &str, title: &str, resource_ids: &[&str]) -> Value {
    space_json(
        space_id,
        json!({ "version": 1, "title": title }),
        resource_ids
            .iter()
            .map(|resource_id| resource(resource_id, &format!("{title} resource")))
            .collect(),
    )
}

/// A Space with Resources and these exactly, and no Maps.
pub fn space_holding(space_id: &str, title: &str, resources: Vec<Value>) -> SpaceSnapshot {
    snapshot(
        space_id,
        &space_json(space_id, json!({ "version": 1, "title": title }), resources),
    )
}

/// The one Map a Space Resource can select: `MAP_ID`, owning `GRAPH_ID`.
pub fn target_document(title: &str) -> Value {
    json!({
        "version": 1,
        "title": title,
        "defaultMap": MAP_ID,
        "maps": [{
            "id": MAP_ID,
            "title": "Map 1",
            "kind": "positioned",
            "positions": {},
            "graphs": [{ "id": GRAPH_ID, "title": "Graph 1", "edges": [] }],
            "activeGraph": GRAPH_ID,
        }],
    })
}

/// A Space complete enough to be pointed at (`targetSpace`).
pub fn target_space(space_id: &str, title: &str, resource_ids: &[&str]) -> SpaceSnapshot {
    snapshot(
        space_id,
        &space_json(
            space_id,
            target_document(title),
            resource_ids
                .iter()
                .map(|resource_id| resource(resource_id, &format!("{title} resource")))
                .collect(),
        ),
    )
}

/// A Space whose one Map places two Resources and owns one Graph with one
/// Edge between them (`graphedSpace`).
pub fn graphed_value(
    space_id: &str,
    title: &str,
    [from, to]: [&str; 2],
    map_id: &str,
    graph_id: &str,
    graph_title: &str,
) -> Value {
    space_json(
        space_id,
        json!({
            "version": 1,
            "title": title,
            "defaultMap": map_id,
            "maps": [{
                "id": map_id,
                "title": "Owner",
                "kind": "positioned",
                "positions": { from: { "x": 0, "y": 0 }, to: { "x": 300, "y": 0 } },
                "graphs": [{ "id": graph_id, "title": graph_title, "edges": [{ "from": from, "to": to }] }],
                "activeGraph": graph_id,
            }],
        }),
        vec![resource(from, "From"), resource(to, "To")],
    )
}

/// [`graphed_value`] with the contract's own Map and Graph.
pub fn graphed_space(space_id: &str, title: &str, resources: [&str; 2]) -> SpaceSnapshot {
    snapshot(
        space_id,
        &graphed_value(space_id, title, resources, MAP_ID, GRAPH_ID, "Graph"),
    )
}

/// A Space whose one Map's Graph has an Edge to a Resource it does not hold.
pub fn space_with_dangling_edge(space_id: &str, title: &str, member: &str) -> SpaceSnapshot {
    snapshot(
        space_id,
        &space_json(
            space_id,
            json!({
                "version": 1,
                "title": title,
                "maps": [{
                    "id": MAP_ID,
                    "title": "Dangling",
                    "kind": "positioned",
                    "positions": { member: { "x": 0, "y": 0 } },
                    "graphs": [{
                        "id": GRAPH_ID,
                        "title": "Dangling",
                        "edges": [{ "from": member, "to": MISSING_RESOURCE_ID }],
                    }],
                }],
            }),
            vec![resource(member, &format!("{title} resource"))],
        ),
    )
}

/// `snapshot` with another title.
pub fn retitled(snapshot: &SpaceSnapshot, title: &str) -> SpaceSnapshot {
    let mut retitled = snapshot.clone();
    title.clone_into(&mut retitled.document.title);
    retitled
}

/// A Space as stored.
pub fn stored(snapshot: &SpaceSnapshot, revision: u64, exported: Option<u64>) -> LoadedSpace {
    LoadedSpace {
        snapshot: snapshot.clone(),
        revision: self::revision(revision),
        exported_revision: exported.map(self::revision),
    }
}

/// `harness`'s store, as a fresh host over what it kept where it keeps
/// anything: what a case reads back last, it reads from there.
pub async fn reopened<H: Harness>(harness: &mut H) -> &H::Store {
    harness.reopen().await.ok();
    harness.store().as_ref()
}

/// Initialize `store` with `spaces`, the first the Meta Space.
pub async fn seed<R: SpaceRepository>(store: &R, spaces: &[&SpaceSnapshot]) -> Vec<LoadedSpace> {
    let meta = spaces.first().expect("seeding needs a Meta Space").id;
    match store
        .initialize_aggregate(AggregateInput {
            meta_space_id: meta,
            spaces: spaces.iter().map(|space| (*space).clone()).collect(),
        })
        .await
        .unwrap()
    {
        InitializeResult::Initialized(aggregate) => aggregate.spaces,
        other => panic!("seeding failed: {other:?}"),
    }
}

/// An update of `snapshot`'s Space at `expected`.
pub fn update(snapshot: &SpaceSnapshot, expected: u64) -> SpaceChange {
    SpaceChange::Update {
        space_id: snapshot.id,
        snapshot: snapshot.clone(),
        expected_revision: revision(expected),
    }
}

/// Whether a store keeps the key order of the content it is given.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KeyOrder {
    /// It answers content as committed, so it is compared exactly.
    Kept,
    /// It answers content in an order of its own (PostgreSQL's `jsonb` sorts
    /// keys by length, then by bytes), so both sides are compared with every
    /// JSON object in ascending key order, as the TypeScript contract's
    /// `toEqual` compares.
    Reordered,
}

/// A value as a store that reorders keys is compared: with every JSON
/// object in it, each Resource's content and each placement's Map content,
/// in ascending key order. Everything else a store answers is typed, so it
/// compares as it is.
pub trait InKeyOrder {
    /// This value, every JSON object in it in ascending key order.
    #[must_use]
    fn in_key_order(&self) -> Self;
}

/// `InKeyOrder` for values holding no JSON object, each itself.
macro_rules! as_itself {
    ($($type:ty),* $(,)?) => {
        $(
            impl InKeyOrder for $type {
                fn in_key_order(&self) -> Self {
                    self.clone()
                }
            }
        )*
    };
}

as_itself!(
    bool,
    u64,
    usize,
    &str,
    String,
    SpaceId,
    Revision,
    RepositoryError,
    AssetStored,
    host::SpaceSummary,
    host::StoredAsset,
    host::AssetHash,
    serde_json::Value,
    (),
    bytes::Bytes,
    Vec<u8>,
);

impl InKeyOrder for JsonValue {
    fn in_key_order(&self) -> Self {
        match self {
            Self::Array(items) => Self::Array(items.iter().map(Self::in_key_order).collect()),
            Self::Object(object) => {
                let mut entries: Vec<(String, Self)> = object
                    .iter()
                    .map(|(key, value)| (key.to_owned(), value.in_key_order()))
                    .collect();
                entries.sort_by(|left, right| left.0.cmp(&right.0));
                Self::Object(entries.into_iter().collect())
            }
            other => other.clone(),
        }
    }
}

impl InKeyOrder for SpaceSnapshot {
    fn in_key_order(&self) -> Self {
        let mut snapshot = self.clone();
        for resource in &mut snapshot.resources {
            resource.content = resource.content.in_key_order();
        }
        for map in snapshot.document.maps.iter_mut().flatten() {
            for (_, placement) in &mut map.positions {
                placement.content = placement.content.in_key_order();
            }
        }
        snapshot
    }
}

impl InKeyOrder for LoadedSpace {
    fn in_key_order(&self) -> Self {
        Self {
            snapshot: self.snapshot.in_key_order(),
            ..self.clone()
        }
    }
}

impl InKeyOrder for LoadedAggregate {
    fn in_key_order(&self) -> Self {
        Self {
            meta_space_id: self.meta_space_id,
            spaces: self.spaces.in_key_order(),
        }
    }
}

impl InKeyOrder for AggregateLoad {
    fn in_key_order(&self) -> Self {
        match self {
            Self::Loaded(aggregate) => Self::Loaded(aggregate.in_key_order()),
            Self::Uninitialized => Self::Uninitialized,
        }
    }
}

impl InKeyOrder for SpaceConflict {
    fn in_key_order(&self) -> Self {
        Self {
            space_id: self.space_id,
            current: self.current.in_key_order(),
        }
    }
}

impl InKeyOrder for CommitResult {
    fn in_key_order(&self) -> Self {
        match self {
            Self::Conflict(conflicts) => Self::Conflict(conflicts.in_key_order()),
            other => other.clone(),
        }
    }
}

impl InKeyOrder for InitializeResult {
    fn in_key_order(&self) -> Self {
        match self {
            Self::Initialized(aggregate) => Self::Initialized(aggregate.in_key_order()),
            Self::Existing(aggregate) => Self::Existing(aggregate.in_key_order()),
            Self::AlreadyInitialized(aggregate) => {
                Self::AlreadyInitialized(aggregate.in_key_order())
            }
            other => other.clone(),
        }
    }
}

impl InKeyOrder for ReplaceResult {
    fn in_key_order(&self) -> Self {
        match self {
            Self::Replaced(aggregate) => Self::Replaced(aggregate.in_key_order()),
            other => other.clone(),
        }
    }
}

impl<T: InKeyOrder> InKeyOrder for Option<T> {
    fn in_key_order(&self) -> Self {
        self.as_ref().map(T::in_key_order)
    }
}

impl<T: InKeyOrder> InKeyOrder for Vec<T> {
    fn in_key_order(&self) -> Self {
        self.iter().map(T::in_key_order).collect()
    }
}

impl<T: InKeyOrder, const N: usize> InKeyOrder for [T; N] {
    fn in_key_order(&self) -> Self {
        std::array::from_fn(|index| self[index].in_key_order())
    }
}

impl<T: InKeyOrder, E: InKeyOrder> InKeyOrder for Result<T, E> {
    fn in_key_order(&self) -> Self {
        match self {
            Ok(value) => Ok(value.in_key_order()),
            Err(error) => Err(error.in_key_order()),
        }
    }
}

impl<A: InKeyOrder, B: InKeyOrder> InKeyOrder for (A, B) {
    fn in_key_order(&self) -> Self {
        (self.0.in_key_order(), self.1.in_key_order())
    }
}

/// `assert_eq!` as harness `$harness`'s [`Harness::KEY_ORDER`] says: exactly
/// for a store that keeps key order, and for one that reorders it with both
/// sides [`InKeyOrder::in_key_order`], so content it answers in its own key
/// order equals the content written.
macro_rules! assert_same {
    ($harness:ty, $left:expr, $right:expr $(,)?) => {
        $crate::repository_contract::assert_same!(@compare $harness, $left, $right, [])
    };
    ($harness:ty, $left:expr, $right:expr, $($message:tt)+) => {
        $crate::repository_contract::assert_same!(
            @compare $harness, $left, $right, [, $($message)+]
        )
    };
    (@compare $harness:ty, $left:expr, $right:expr, [$($message:tt)*]) => {{
        let (left, right) = (&$left, &$right);
        match <$harness as $crate::repository_contract::Harness>::KEY_ORDER {
            $crate::repository_contract::KeyOrder::Kept => assert_eq!(left, right $($message)*),
            $crate::repository_contract::KeyOrder::Reordered => assert_eq!(
                $crate::repository_contract::InKeyOrder::in_key_order(left),
                $crate::repository_contract::InKeyOrder::in_key_order(right)
                $($message)*
            ),
        }
    }};
}

pub(crate) use assert_same;

/// A commit of `changes`.
pub fn commit(changes: Vec<SpaceChange>) -> SpaceCommit {
    SpaceCommit { changes }
}

/// Commit one update of `snapshot`'s Space at `expected`.
pub async fn commit_update<R: SpaceRepository>(
    store: &R,
    snapshot: &SpaceSnapshot,
    expected: u64,
) -> CommitResult {
    store
        .commit(commit(vec![update(snapshot, expected)]))
        .await
        .unwrap()
}

/// What a commit committing `revisions` and deleting `deleted` answers.
pub fn committed(revisions: &[(&str, u64)], deleted: &[&str]) -> CommitResult {
    CommitResult::Committed {
        revisions: revisions
            .iter()
            .map(|(space, value)| (id(space), revision(*value)))
            .collect(),
        deleted_space_ids: deleted.iter().map(|space| id(space)).collect(),
    }
}

/// The kinds of a refused commit's refusals, as the wire names them.
pub fn refused_kinds(result: &CommitResult) -> Vec<&'static str> {
    match result {
        CommitResult::AggregateRefused(refusal) => refusal
            .refusals
            .iter()
            .map(|refusal| refusal.kind().as_str())
            .collect(),
        other => panic!("an aggregate refusal, not {other:?}"),
    }
}

/// One test per case of the table, in a module `contract`, each opening a
/// fresh `$harness`, running the case, and closing it. A case that needs
/// what the harness cannot provide says it was skipped and why; under
/// `repository_cases!($harness, every_member)` it fails instead, for a store
/// whose every `// Case:` line must port a case that runs on it. Attributes
/// after the harness (and `every_member`) go on every test, as
/// `#[ignore = "…"]` does for a store whose tests need a server.
macro_rules! repository_cases {
    ($harness:ty, every_member $(, #[$attribute:meta])* $(,)?) => {
        repository_cases! { @table $harness; every_member; [$(#[$attribute])*] }
    };
    ($harness:ty $(, #[$attribute:meta])* $(,)?) => {
        repository_cases! { @table $harness; skip; [$(#[$attribute])*] }
    };
    (@unprovided skip, $why:expr) => {
        eprintln!("skipped: {}", $why)
    };
    (@unprovided every_member, $why:expr) => {
        panic!("the harness must provide every member, but: {}", $why)
    };
    (@table $harness:ty; $mode:ident; $attributes:tt) => {
        repository_cases! { @emit $harness; $mode; $attributes;
            // table:begin
            lifecycle {
                preserves_the_established_aggregate_across_a_fresh_host,
                persists_first_working_load_initialization_for_a_fresh_host,
                initializes_and_replaces_only_through_meta_rooted_aggregates,
                classifies_canonical_and_different_initialization_proposals,
                refuses_a_replacement_naming_a_meta_space_it_does_not_hold,
                ignores_object_key_order_when_classifying_initialization,
                lets_only_one_different_concurrent_initialization_establish_state,
                rolls_back_a_refused_replacement,
                refuses_replacement_before_initialization,
                reads_the_meta_identity_as_each_door_leaves_it,
                refuses_a_replacement_expecting_no_meta_identity_where_one_is_stored,
                refuses_a_replacement_authorized_against_a_superseded_meta_identity,
                refuses_to_record_an_exported_revision_for_a_space_it_does_not_store,
                refuses_an_aggregate_repeating_a_space_identity,
                refuses_an_aggregate_repeating_a_resource_identity,
                refuses_a_replacement_repeating_a_space_identity,
                refuses_a_replacement_repeating_a_resource_identity,
                refuses_an_initialization_failing_domain_intake,
                replaces_everything_stored_freeing_the_resource_ids_it_clears,
                becomes_committable_from_an_empty_store,
                leaves_no_dropped_space_after_a_replacement_across_a_reopen,
            }
            commits {
                stores_an_initialized_space_then_lists_loads_and_commits_it,
                keeps_every_resource_through_a_topology_preserving_commits_own_delete,
                refuses_to_create_an_unreachable_space_by_removing_its_last_reference,
                atomically_creates_links_reads_converges_on_and_deletes_a_space,
                refuses_an_authored_commit_deleting_the_meta_space,
                reports_every_conflict_and_rolls_back_every_refused_aggregate,
                answers_a_stale_expected_revision_with_the_current_space,
                refuses_a_commit_failing_domain_intake_storing_nothing,
                refuses_a_commit_for_a_space_it_does_not_store,
                refuses_a_commit_whose_space_id_differs_from_its_snapshot_id,
                refuses_an_update_naming_another_stored_space_at_a_matching_revision,
                places_a_single_updates_failed_intake_at_its_position,
                refuses_a_commit_naming_one_space_more_than_once,
                refuses_a_commit_claiming_a_resource_another_space_owns,
                scopes_graph_identities_to_their_space,
                refuses_an_unreferenced_space_even_reusing_a_graph_identity,
                permits_a_graph_and_a_resource_to_share_an_identity,
                refuses_two_maps_owning_one_graph_identity,
                keeps_the_resources_a_commit_names_and_drops_the_rest,
                drops_every_resource_when_a_commit_omits_them_all,
                answers_resources_in_ascending_id_order_however_supplied,
                records_an_exported_revision_and_carries_it_across_commits,
                refuses_to_mark_an_exported_revision_above_the_ceiling,
                stores_and_commits_a_revision_above_the_largest_safe_integer,
                writes_only_the_resource_a_topology_preserving_commit_changed,
                writes_only_the_new_and_changed_resources_on_the_aggregate_path,
                writes_no_resource_for_a_commit_at_a_stale_revision,
                moves_an_unchanged_resource_between_spaces_in_one_commit,
                commits_a_move_whichever_space_it_lists_first,
                answers_a_create_of_a_stored_space_as_a_conflict,
                keeps_an_exported_revision_through_an_aggregate_commit,
                answers_a_stale_revision_on_the_aggregate_path_as_a_conflict,
                adopts_a_resource_id_from_the_space_a_commit_deletes,
                stores_a_topology_preserving_commits_whole_snapshot_over_recreated_resource_rows,
                stores_a_complete_aggregate_commits_whole_snapshot_over_recreated_resource_rows,
            }
            broken {
                replaces_an_invalid_space_document,
                replaces_an_invalid_aggregate,
                names_a_broken_document_broken_on_the_fast_path_and_load_space,
                lists_every_space_when_one_fails_intake,
                lists_a_space_without_a_title_by_its_id,
                truncates_spaces_without_a_meta_identity_only_when_none_was_expected,
                fails_a_stored_revision_that_is_not_canonical,
                refuses_an_update_when_stored_spaces_have_no_meta_identity,
                refuses_to_store_a_revision_above_the_ceiling,
                deletes_a_space_at_the_ceiling,
                fails_a_stored_revision_above_the_ceiling,
                fails_a_fast_path_commit_over_a_revision_that_is_not_canonical,
                fails_a_stored_exported_revision_that_is_not_canonical,
            }
            assets {
                stores_an_asset_of_any_type_and_loads_it_unchanged,
                holds_a_markdown_resource_from_its_file_and_its_text_as_one_value,
                stores_the_same_bytes_once_keeping_the_first_media_type,
                answers_an_asset_it_does_not_store_as_absent,
                holds_the_asset_of_zero_bytes_already,
                keeps_stored_assets_outside_the_aggregate_the_doors_replace,
                keeps_a_stored_asset_across_a_fresh_host,
            }
            content {
                stores_and_reloads_an_image_resource_unchanged,
                stores_and_reloads_an_ur_resource_and_a_reference_to_it,
                stores_renames_and_reloads_a_resource_whose_plugin_is_missing,
                carries_a_missing_plugin_resource_through_import_and_export,
                hands_a_missing_plugin_resource_to_its_plugin_when_it_returns,
                keeps_an_edges_title_and_hidden_flag,
                keeps_a_graphs_head_shape,
                keeps_every_resources_map_content,
                keeps_each_space_resources_selection_across_a_default_map_change,
                keeps_what_the_fixture_lacks_as_committed,
            }
            // table:end
        }
    };
    (@emit $harness:ty; $mode:ident; $attributes:tt; $($group:ident { $($case:ident),* $(,)? })*) => {
        mod contract {
            #[allow(unused_imports, reason = "the harness may be named by a path")]
            use super::*;

            type Subject = $harness;

            $(
                mod $group {
                    $(
                        $crate::repository_contract::repository_cases! {
                            @case $mode $attributes $group $case
                        }
                    )*
                }
            )*
        }
    };
    (@case $mode:ident [$(#[$attribute:meta])*] $group:ident $case:ident) => {
        #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
        #[allow(clippy::print_stderr, reason = "a skipped case says so")]
        $(#[$attribute])*
        async fn $case() {
            use $crate::repository_contract::Harness as _;
            let mut harness = <super::Subject>::open().await;
            let ran = $crate::repository_contract::$group::$case(&mut harness).await;
            harness.close().await;
            if let Err($crate::repository_contract::Unprovided(why)) = ran {
                $crate::repository_contract::repository_cases!(@unprovided $mode, why);
            }
        }
    };
}

pub(crate) use repository_cases;
