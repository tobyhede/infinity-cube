//! What the rows-across-runtimes tests share (Storage ST-125): the script
//! `conformance/rows/script.json`, run on any repository, and what each
//! store's rows must read as, the script run on the memory store.

use std::path::{Path, PathBuf};

use bytes::Bytes;
use host::{
    AggregateInput, AggregateLoad, AssetHash, AssetStored, CommitResult, InitializeResult,
    MemorySpaceRepository, RepositoryError, SpaceChange, SpaceCommit, SpaceRepository, StoredAsset,
    decode_commit,
};
use intake::SpaceId;
use intake::json::{JsonValue, parse};

/// The repository's root directory.
pub fn repository_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn script() -> JsonValue {
    let text =
        std::fs::read_to_string(repository_root().join("conformance/rows/script.json")).unwrap();
    parse(&text).unwrap()
}

fn field<'a>(value: &'a JsonValue, key: &str) -> &'a JsonValue {
    value
        .as_object()
        .and_then(|object| object.get(key))
        .unwrap_or_else(|| panic!("the script has {key}"))
}

fn text<'a>(value: &'a JsonValue, key: &str) -> &'a str {
    field(value, key).as_str().unwrap()
}

fn array(value: &JsonValue) -> &[JsonValue] {
    let JsonValue::Array(items) = value else {
        panic!("the script has an array");
    };
    items
}

/// The Meta Space the script initializes.
pub fn meta() -> SpaceId {
    SpaceId::parse(text(field(&script(), "initialize"), "metaSpaceId")).unwrap()
}

/// An asset step's bytes: its `text` as UTF-8, or its `hex`.
fn bytes_of(asset: &JsonValue) -> Bytes {
    let object = asset.as_object().unwrap();
    match (object.get("text"), object.get("hex")) {
        (Some(JsonValue::String(text)), None) => Bytes::from(text.clone()),
        (None, Some(JsonValue::String(hex))) => (0..hex.len())
            .step_by(2)
            .map(|at| u8::from_str_radix(&hex[at..at + 2], 16).unwrap())
            .collect(),
        _ => panic!("an asset step has its text or its hex"),
    }
}

/// Each asset the script stores, as it stores it.
pub fn assets() -> Vec<StoredAsset> {
    array(field(&script(), "steps"))
        .iter()
        .filter_map(|step| step.as_object().and_then(|step| step.get("asset")))
        .map(|asset| {
            let stored = StoredAsset::admit(bytes_of(asset), text(asset, "mediaType")).unwrap();
            assert_eq!(
                stored.hash,
                AssetHash::parse(text(asset, "hash")).unwrap(),
                "the script names the hash of its asset"
            );
            stored
        })
        .collect()
}

/// Run the script on `store`, failing unless each step lands.
pub async fn run_script<R: SpaceRepository>(store: &R) {
    let script = script();
    let initialize = field(&script, "initialize");
    let spaces = array(field(initialize, "spaces"))
        .iter()
        .map(|space| {
            let SpaceChange::Create { snapshot, .. } = commit_of(&format!(
                r#"{{"changes":[{{"kind":"create","spaceId":"{}","snapshot":{space}}}]}}"#,
                text(space, "id")
            ))
            .changes
            .remove(0) else {
                panic!("a create change");
            };
            snapshot
        })
        .collect();
    let initialized = store
        .initialize_aggregate(AggregateInput {
            meta_space_id: meta(),
            spaces,
        })
        .await
        .unwrap();
    assert!(
        matches!(initialized, InitializeResult::Initialized(_)),
        "the script initializes an empty store: {initialized:?}"
    );
    let mut assets = assets().into_iter();
    for (index, step) in array(field(&script, "steps")).iter().enumerate() {
        let step = step.as_object().unwrap();
        if step.get("asset").is_some() {
            let stored = store.store_asset(assets.next().unwrap()).await.unwrap();
            assert_eq!(stored, AssetStored::Stored, "step {index} stores its asset");
        } else {
            let commit = commit_of(&step.get("commit").unwrap().to_string());
            let answer = store.commit(commit).await.unwrap();
            assert!(
                matches!(answer, CommitResult::Committed { .. }),
                "step {index} commits: {answer:?}"
            );
        }
    }
}

/// A commit request as the wire carries it.
pub fn commit_of(json: &str) -> SpaceCommit {
    decode_commit(json.as_bytes()).unwrap()
}

/// The script run on the memory store: what each runtime's rows must read as.
pub async fn expected() -> MemorySpaceRepository {
    let memory = MemorySpaceRepository::new();
    run_script(&memory).await;
    memory
}

/// `value` with every object's keys in ascending order.
fn keys_sorted(value: &JsonValue) -> JsonValue {
    match value {
        JsonValue::Array(items) => JsonValue::Array(items.iter().map(keys_sorted).collect()),
        JsonValue::Object(object) => {
            let mut entries: Vec<(String, JsonValue)> = object
                .iter()
                .map(|(key, value)| (key.to_owned(), keys_sorted(value)))
                .collect();
            entries.sort_by(|left, right| left.0.cmp(&right.0));
            JsonValue::Object(entries.into_iter().collect())
        }
        other => other.clone(),
    }
}

/// `load` with what `jsonb` stores by key rather than in order put in one
/// order: each Map's placements by Resource id, and every key of each
/// Resource's content and each placement's Map content ascending.
/// PostgreSQL's `jsonb` keeps an object's keys in an order of its own, in
/// both runtimes, and TypeScript's `toEqual` ignores key order alike;
/// arrays keep their order, so Edges, Graphs and Maps are still compared in
/// order.
fn key_order_free(
    load: Result<AggregateLoad, RepositoryError>,
) -> Result<AggregateLoad, RepositoryError> {
    let Ok(AggregateLoad::Loaded(mut aggregate)) = load else {
        return load;
    };
    for space in &mut aggregate.spaces {
        for resource in &mut space.snapshot.resources {
            resource.content = keys_sorted(&resource.content);
        }
        for map in space.snapshot.document.maps.iter_mut().flatten() {
            map.positions.sort_by_key(|(id, _)| id.to_string());
            for (_, placement) in &mut map.positions {
                placement.content = placement.content.as_ref().map(keys_sorted);
            }
        }
    }
    Ok(AggregateLoad::Loaded(aggregate))
}

/// Assert that `store` reads as the script run on the memory store: the
/// aggregate, the Spaces listed, and each asset the script stores, which
/// must also be the asset the script names. With `keys_by_jsonb`, the
/// aggregate is compared with the order of an object's keys left out, as
/// [`key_order_free`] says.
pub async fn assert_reads_as_the_script<R: SpaceRepository>(store: &R, keys_by_jsonb: bool) {
    let memory = expected().await;
    let (read, expected) = (store.load_aggregate().await, memory.load_aggregate().await);
    if keys_by_jsonb {
        assert_eq!(
            key_order_free(read),
            key_order_free(expected),
            "the aggregate, its keys in any order"
        );
    } else {
        assert_eq!(read, expected, "the aggregate");
    }
    assert_eq!(
        store.list_spaces().await,
        memory.list_spaces().await,
        "the Spaces listed"
    );
    let assets = assets();
    assert!(!assets.is_empty(), "the script stores assets");
    for asset in assets {
        let stored = store.load_asset(&asset.hash).await.unwrap();
        assert_eq!(stored, Some(asset.clone()), "asset {}", asset.hash);
        assert_eq!(
            stored,
            memory.load_asset(&asset.hash).await.unwrap(),
            "asset {}",
            asset.hash
        );
    }
}

/// Hold the checked-in fixture `name` (under `tests/fixtures/`) to `rows`,
/// first writing it when `INFINITY_CUBE_WRITE_ROWS` is set, and naming
/// `regenerate` when it is not current.
pub fn hold_current(name: &str, rows: &str, regenerate: &str) {
    let checked_in = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures")
        .join(name);
    if std::env::var_os("INFINITY_CUBE_WRITE_ROWS").is_some() {
        std::fs::write(&checked_in, rows).unwrap();
    }
    assert!(
        std::fs::read_to_string(&checked_in).ok().as_deref() == Some(rows),
        "{} is not the rows the script writes now; regenerate it with: {regenerate}",
        checked_in.display()
    );
}
