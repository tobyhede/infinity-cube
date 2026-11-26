//! The contract's stored-content cases: what a stored Space keeps of every
//! plugin's content, Map content, Edges, Graphs and selections, and what an
//! Export of what the store read back writes (rust-sqlite-test-coverage 12).
//! Their fixtures are JSON text written out, so each object's keys stay in
//! the order a case commits them.

use std::path::Path;

use bytes::Bytes;
use host::{
    AggregateLoad, AssetStored, CommitResult, LoadedAggregate, MemorySpaceRepository,
    SpaceRepository, StoredAsset, TokioFilesystem, export_aggregate, import_directory,
};
use http_conformance::Counted;
use intake::json::JsonValue;

use super::*;

/// `value` with every object's keys in ascending order: what a value read
/// back from files Export wrote is compared as, since Export writes
/// content it does not own in canonical order (TypeScript's `toEqual`
/// ignores key order alike).
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

/// `snapshot` with each Resource's content and each placement's Map
/// content in ascending key order.
fn sorted(snapshot: &SpaceSnapshot) -> SpaceSnapshot {
    let mut snapshot = snapshot.clone();
    for resource in &mut snapshot.resources {
        resource.content = keys_sorted(&resource.content);
    }
    for map in snapshot.document.maps.iter_mut().flatten() {
        for (_, placement) in &mut map.positions {
            placement.content = placement.content.as_ref().map(keys_sorted);
        }
    }
    snapshot
}

/// A Markdown Resource with no text, as JSON text.
fn markdown(resource_id: &str, title: &str) -> String {
    format!(
        r#"{{"id":"{resource_id}","document":{{"title":"{title}","kind":"markdown","content":{{"url":"{EMPTY_ASSET_REF}"}}}}}}"#
    )
}

/// A Space's JSON text from its document's text and its Resources' texts.
fn space_text(space_id: &str, document: &str, resources: &[String]) -> String {
    format!(
        r#"{{"id":"{space_id}","document":{document},"resources":[{}]}}"#,
        resources.join(",")
    )
}

/// What a commit committing a change to `space` alone answers.
fn committed_one(space: &str, revision: u64) -> CommitResult {
    committed(&[(space, revision)], &[])
}

/// Store `first`, read it back, commit `then` over it, and read that back
/// after a reopen, by Space and by aggregate.
async fn stores_then_commits<H: Harness>(
    harness: &mut H,
    first: &SpaceSnapshot,
    then: &SpaceSnapshot,
) -> Ran {
    let store = harness.store().as_ref();
    seed(store, &[first]).await;
    let store = reopened(harness).await;
    assert_eq!(
        store.load_space(first.id).await,
        Ok(Some(stored(first, 0, None))),
        "what was initialized"
    );
    assert_eq!(
        commit_update(store, then, 0).await,
        committed_one(&first.id.to_string(), 1)
    );
    let store = reopened(harness).await;
    assert_eq!(
        store.load_space(then.id).await,
        Ok(Some(stored(then, 1, None))),
        "what was committed"
    );
    assert_eq!(
        store.load_aggregate().await,
        Ok(AggregateLoad::Loaded(LoadedAggregate {
            meta_space_id: then.id,
            spaces: vec![stored(then, 1, None)],
        }))
    );
    Ok(())
}

// Case: stores and reloads an Image Resource unchanged
pub async fn stores_and_reloads_an_image_resource_unchanged<H: Harness>(harness: &mut H) -> Ran {
    let document = r#"{"version":1,"title":"Pictures"}"#;
    let image = |content: &str| {
        format!(
            r#"{{"id":"{SECOND_RESOURCE_ID}","document":{{"title":"Figure","kind":"image","content":{content}}}}}"#
        )
    };
    let first = snapshot_text(
        SPACE_ID,
        &space_text(
            SPACE_ID,
            document,
            &[
                markdown(RESOURCE_ID, "Pictures resource"),
                image(
                    r#"{"url":"https://example.com/figure.png","naturalSize":{"width":640,"height":480.5}}"#,
                ),
            ],
        ),
    );
    let replaced = snapshot_text(
        SPACE_ID,
        &space_text(
            SPACE_ID,
            document,
            &[
                markdown(RESOURCE_ID, "Pictures resource"),
                image(&format!(r#"{{"url":"{EMPTY_ASSET_REF}"}}"#)),
            ],
        ),
    );
    stores_then_commits(harness, &first, &replaced).await
}

// Case: stores and reloads an Ur Resource and a Reference Resource to it unchanged
pub async fn stores_and_reloads_an_ur_resource_and_a_reference_to_it<H: Harness>(
    harness: &mut H,
) -> Ran {
    let resources = |title: &str| {
        vec![
            format!(
                r#"{{"id":"{RESOURCE_ID}","document":{{"title":"{title}","kind":"ur","content":{{}}}}}}"#
            ),
            format!(
                r#"{{"id":"{SECOND_RESOURCE_ID}","document":{{"title":"Node, again","kind":"reference","content":{{"target":"{RESOURCE_ID}"}}}}}}"#
            ),
        ]
    };
    let document = r#"{"version":1,"title":"Diagram"}"#;
    let first = snapshot_text(
        SPACE_ID,
        &space_text(SPACE_ID, document, &resources("Node")),
    );
    let renamed = snapshot_text(
        SPACE_ID,
        &space_text(SPACE_ID, document, &resources("Renamed node")),
    );
    stores_then_commits(harness, &first, &renamed).await
}

/// A Space holding a Markdown Resource and a Resource of `kind`, which no
/// plugin in this build lists, holding `content`, placed on its one Map
/// with `map_content` where given.
fn holding_a_missing_plugin(
    title: &str,
    kind: &str,
    resource_title: &str,
    content: &str,
    map_content: Option<&str>,
) -> SpaceSnapshot {
    let placement = match map_content {
        Some(map_content) => format!(r#"{{"x":10,"y":20,"content":{map_content}}}"#),
        None => r#"{"x":10,"y":20}"#.to_owned(),
    };
    snapshot_text(
        SPACE_ID,
        &space_text(
            SPACE_ID,
            &format!(
                r#"{{"version":1,"title":"{title}","defaultMap":"{MAP_ID}","maps":[{{"id":"{MAP_ID}","title":"Map","kind":"positioned","positions":{{"{SECOND_RESOURCE_ID}":{placement}}},"graphs":[{{"id":"{GRAPH_ID}","title":"Graph","edges":[]}}]}}]}}"#
            ),
            &[
                markdown(RESOURCE_ID, "Note"),
                format!(
                    r#"{{"id":"{SECOND_RESOURCE_ID}","document":{{"title":"{resource_title}","kind":"{kind}","content":{content}}}}}"#
                ),
            ],
        ),
    )
}

// Case: stores, renames and reloads a Resource whose plugin is missing unchanged
/// Its content and Map content are committed with their keys out of
/// canonical order, nested, with nulls and a fractional number.
pub async fn stores_renames_and_reloads_a_resource_whose_plugin_is_missing<H: Harness>(
    harness: &mut H,
) -> Ran {
    let kind = "vnd.example.diagram";
    assert!(!intake::is_plugin_kind(kind), "no plugin draws {kind}");
    let content = format!(
        r#"{{"source":"{EMPTY_ASSET_REF}","options":{{"nodes":[1,2.5,null,{{"nested":true}}],"direction":"TD"}}}}"#
    );
    let map_content = r#"{"zoom":2,"layers":["ink",{"id":7}]}"#;
    let first = holding_a_missing_plugin("Diagram", kind, "Flow", &content, Some(map_content));
    let renamed =
        holding_a_missing_plugin("Diagram", kind, "Renamed flow", &content, Some(map_content));
    stores_then_commits(harness, &first, &renamed).await
}

/// Bytes that are not UTF-8, as an asset a missing plugin's content names.
const NOT_UTF8: &[u8] = &[0xff, 0xfe, 0x00, 0xc3, 0x28, 0xa0, 0xa1];

fn read_files(directory: &Path, files: &[String]) -> Vec<Vec<u8>> {
    files
        .iter()
        .map(|file| std::fs::read(directory.join(file)).unwrap())
        .collect()
}

fn asset_files(directory: &Path) -> Vec<(String, Vec<u8>)> {
    let mut files: Vec<(String, Vec<u8>)> = std::fs::read_dir(directory.join("assets"))
        .unwrap()
        .map(|entry| {
            let entry = entry.unwrap();
            (
                entry.file_name().to_string_lossy().into_owned(),
                std::fs::read(entry.path()).unwrap(),
            )
        })
        .collect();
    files.sort();
    files
}

/// Export `snapshot` and `asset` from a memory store into `directory`.
async fn exported_from_memory(snapshot: &SpaceSnapshot, asset: &StoredAsset, directory: &Path) {
    let writer = MemorySpaceRepository::new();
    assert_eq!(
        writer.store_asset(asset.clone()).await,
        Ok(AssetStored::Stored)
    );
    seed(&writer, &[snapshot]).await;
    let _exported = export_aggregate(&writer, &TokioFilesystem, directory)
        .await
        .unwrap();
}

/// What a memory store reads Importing `directory`.
async fn reread(directory: &Path) -> MemorySpaceRepository {
    let store = MemorySpaceRepository::new();
    import_directory(&store, &TokioFilesystem, directory, &Counted::default())
        .await
        .unwrap();
    store
}

// Case: carries a Resource whose plugin is missing through Import and Export byte-identical
pub async fn carries_a_missing_plugin_resource_through_import_and_export<H: Harness>(
    harness: &mut H,
) -> Ran {
    let kind = "vnd.example.chart";
    assert!(!intake::is_plugin_kind(kind), "no plugin draws {kind}");
    let asset = StoredAsset::admit(Bytes::from_static(NOT_UTF8), "application/pdf").unwrap();
    let content = format!(
        r#"{{"source":"/assets/{}","legend":"a longer value","options":{{"direction":"TD","at":[1,2.5,null,{{"nested":true}}]}}}}"#,
        asset.hash
    );
    let snapshot = holding_a_missing_plugin(
        "Chart",
        kind,
        "Flow",
        &content,
        Some(r#"{"zoom":2,"at":["ink",{"id":7}]}"#),
    );
    let scratch = tempfile::tempdir().unwrap();
    let source = scratch.path().join("source");
    exported_from_memory(&snapshot, &asset, &source).await;
    let files = vec![
        format!("{SPACE_ID}/space.json"),
        format!("{SPACE_ID}/resources/{SECOND_RESOURCE_ID}.json"),
    ];
    let written = read_files(&source, &files);
    let assets = asset_files(&source);

    import_directory(
        harness.store().as_ref(),
        &TokioFilesystem,
        &source,
        &Counted::default(),
    )
    .await
    .unwrap();
    std::fs::remove_dir_all(&source).unwrap();
    let store = reopened(harness).await;
    let exported = scratch.path().join("exported");
    let _exported = export_aggregate(store, &TokioFilesystem, &exported)
        .await
        .unwrap();

    assert_eq!(
        read_files(&exported, &files),
        written,
        "space.json and the Resource file"
    );
    assert_eq!(
        asset_files(&exported),
        assets,
        "the asset, by name and bytes"
    );
    let reread = reread(&exported).await;
    assert_eq!(
        reread
            .load_space(id(SPACE_ID))
            .await
            .unwrap()
            .map(|loaded| sorted(&loaded.snapshot)),
        Some(sorted(&snapshot))
    );
    assert_eq!(reread.load_asset(&asset.hash).await, Ok(Some(asset)));
    Ok(())
}

// Case: hands a Resource whose plugin is missing to that plugin when it returns
/// The return is simulated by a kind this build draws: the Resource is
/// stored under a kind no plugin lists, holding content the Image plugin
/// reads, and the plugin's return is that kind becoming `image`.
pub async fn hands_a_missing_plugin_resource_to_its_plugin_when_it_returns<H: Harness>(
    harness: &mut H,
) -> Ran {
    let kind = "vnd.example.picture";
    assert!(!intake::is_plugin_kind(kind), "no plugin draws {kind}");
    let asset = StoredAsset::admit(Bytes::from_static(NOT_UTF8), "application/pdf").unwrap();
    let content = format!(r#"{{"url":"/assets/{}"}}"#, asset.hash);
    let snapshot = holding_a_missing_plugin("Picture", kind, "Picture", &content, None);
    let restored = holding_a_missing_plugin("Picture", "image", "Picture", &content, None);
    let scratch = tempfile::tempdir().unwrap();
    let source = scratch.path().join("source");
    exported_from_memory(&snapshot, &asset, &source).await;
    import_directory(
        harness.store().as_ref(),
        &TokioFilesystem,
        &source,
        &Counted::default(),
    )
    .await
    .unwrap();
    std::fs::remove_dir_all(&source).unwrap();
    let store = reopened(harness).await;

    // Over the store itself, with no Export or Import.
    let Ok(AggregateLoad::Loaded(held)) = store.load_aggregate().await else {
        panic!("the store holds the aggregate");
    };
    let in_place: Vec<SpaceSnapshot> = held
        .spaces
        .into_iter()
        .map(|space| {
            let mut snapshot = space.snapshot;
            for resource in &mut snapshot.resources {
                if resource.id.to_string() == SECOND_RESOURCE_ID {
                    resource.kind = intake::Kind::parse("image").unwrap();
                }
            }
            snapshot
        })
        .collect();
    assert_eq!(in_place, vec![restored.clone()]);
    assert!(
        intake::load_aggregate(id(SPACE_ID), &in_place).is_ok(),
        "the Image plugin reads the Resource it held"
    );

    // Through an Export into an empty directory, read again by the plugin.
    let exported = scratch.path().join("exported");
    let _exported = export_aggregate(store, &TokioFilesystem, &exported)
        .await
        .unwrap();
    let file = exported
        .join(SPACE_ID)
        .join("resources")
        .join(format!("{SECOND_RESOURCE_ID}.json"));
    let written = std::fs::read_to_string(&file).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&written).unwrap();
    assert_eq!(
        parsed,
        serde_json::json!({
            "id": SECOND_RESOURCE_ID,
            "title": "Picture",
            "kind": kind,
            "content": { "url": format!("/assets/{}", asset.hash) },
        })
    );
    std::fs::write(&file, written.replace(&format!("\"{kind}\""), "\"image\"")).unwrap();
    let reread = reread(&exported).await;
    assert_eq!(
        reread
            .load_space(id(SPACE_ID))
            .await
            .unwrap()
            .map(|loaded| loaded.snapshot),
        Some(restored)
    );
    assert_eq!(
        reread
            .load_asset(&asset.hash)
            .await
            .unwrap()
            .map(|loaded| loaded.bytes),
        Some(Bytes::from_static(NOT_UTF8))
    );
    Ok(())
}

/// The contract's graphed Space, its one Graph's text `graph` and its
/// Resources' kind `kind` (Markdown or Ur), its positions `positions`.
fn graphed_text(title: &str, graph: &str, kind: &str, positions: &str) -> SpaceSnapshot {
    let resource = |resource_id: &str, resource_title: &str| match kind {
        "ur" => format!(
            r#"{{"id":"{resource_id}","document":{{"title":"{resource_title}","kind":"ur","content":{{}}}}}}"#
        ),
        _ => markdown(resource_id, resource_title),
    };
    snapshot_text(
        SPACE_ID,
        &space_text(
            SPACE_ID,
            &format!(
                r#"{{"version":1,"title":"{title}","defaultMap":"{MAP_ID}","maps":[{{"id":"{MAP_ID}","title":"Owner","kind":"positioned","positions":{positions},"graphs":[{graph}],"activeGraph":"{GRAPH_ID}"}}]}}"#
            ),
            &[
                resource(RESOURCE_ID, "From"),
                resource(SECOND_RESOURCE_ID, "To"),
            ],
        ),
    )
}

fn two_places() -> String {
    format!(r#"{{"{RESOURCE_ID}":{{"x":0,"y":0}},"{SECOND_RESOURCE_ID}":{{"x":300,"y":0}}}}"#)
}

// Case: keeps an Edge's Title and hidden flag through initialization, commit and load
pub async fn keeps_an_edges_title_and_hidden_flag<H: Harness>(harness: &mut H) -> Ran {
    let with_edge = |edge: &str| {
        graphed_text(
            "Titled",
            &format!(r#"{{"id":"{GRAPH_ID}","title":"Graph","edges":[{edge}]}}"#),
            "markdown",
            &two_places(),
        )
    };
    let hidden = with_edge(&format!(
        r#"{{"from":"{RESOURCE_ID}","to":"{SECOND_RESOURCE_ID}","title":"On success","titleHidden":true}}"#
    ));
    let shown = with_edge(&format!(
        r#"{{"from":"{RESOURCE_ID}","to":"{SECOND_RESOURCE_ID}","title":"On failure"}}"#
    ));
    stores_then_commits(harness, &hidden, &shown).await
}

// Case: keeps a Graph's head shape through initialization, commit and load
pub async fn keeps_a_graphs_head_shape<H: Harness>(harness: &mut H) -> Ran {
    let with_head = |head: &str| {
        graphed_text(
            "Shaped",
            &format!(
                r#"{{"id":"{GRAPH_ID}","title":"Graph","headShape":"{head}","edges":[{{"from":"{RESOURCE_ID}","to":"{SECOND_RESOURCE_ID}"}}]}}"#
            ),
            "ur",
            &two_places(),
        )
    };
    stores_then_commits(harness, &with_head("dot"), &with_head("diamond")).await
}

// Case: keeps every Resource's Map content through initialization, commit and load
pub async fn keeps_every_resources_map_content<H: Harness>(harness: &mut H) -> Ran {
    let graph = format!(
        r#"{{"id":"{GRAPH_ID}","title":"Graph","edges":[{{"from":"{RESOURCE_ID}","to":"{SECOND_RESOURCE_ID}"}}]}}"#
    );
    let initial = graphed_text(
        "Shaped",
        &graph,
        "ur",
        &format!(
            r#"{{"{RESOURCE_ID}":{{"x":0,"y":0,"content":{{"shape":"diamond"}}}},"{SECOND_RESOURCE_ID}":{{"x":300,"y":0,"content":{{"shape":"pill"}}}}}}"#
        ),
    );
    let changed = graphed_text(
        "Shaped",
        &graph,
        "ur",
        &format!(
            r#"{{"{RESOURCE_ID}":{{"x":0,"y":0,"content":{{"shape":"ellipse"}}}},"{SECOND_RESOURCE_ID}":{{"x":300,"y":0,"size":{{"width":560,"height":420}},"content":{{"shape":"diamond"}}}}}}"#
        ),
    );
    stores_then_commits(harness, &initial, &changed).await
}

// Case: keeps each Space Resource's own selection across a later default Map change
pub async fn keeps_each_space_resources_selection_across_a_default_map_change<H: Harness>(
    harness: &mut H,
) -> Ran {
    let store = harness.store().as_ref();
    let meta = space(SPACE_ID, "Meta", &[RESOURCE_ID]);
    seed(store, &[&meta]).await;
    let target = |default_map: &str| {
        snapshot_text(
            OTHER_SPACE_ID,
            &space_text(
                OTHER_SPACE_ID,
                &format!(
                    r#"{{"version":1,"title":"Target","defaultMap":"{default_map}","maps":[{{"id":"{MAP_ID}","title":"First map","kind":"positioned","positions":{{"{OTHER_RESOURCE_ID}":{{"x":0,"y":0}}}},"graphs":[{{"id":"{GRAPH_ID}","title":"First graph","edges":[]}},{{"id":"{THIRD_GRAPH_ID}","title":"Second graph","edges":[]}}],"activeGraph":"{GRAPH_ID}"}},{{"id":"{SECOND_MAP_ID}","title":"Second map","kind":"positioned","positions":{{"{OTHER_RESOURCE_ID}":{{"x":100,"y":100}}}},"graphs":[{{"id":"{SECOND_GRAPH_ID}","title":"Third graph","edges":[]}},{{"id":"{FOURTH_GRAPH_ID}","title":"Fourth graph","edges":[]}}],"activeGraph":"{SECOND_GRAPH_ID}"}}]}}"#
                ),
                &[markdown(OTHER_RESOURCE_ID, "Target resource")],
            ),
        )
    };
    let selecting = |resource_id: &str, map: &str, graph: &str| {
        format!(
            r#"{{"id":"{resource_id}","document":{{"title":"Open {OTHER_SPACE_ID}","kind":"space","content":{{"spaceId":"{OTHER_SPACE_ID}","map":"{map}","graph":"{graph}"}}}}}}"#
        )
    };
    // Four Space Resources on one target, no two selecting the same pair, so
    // the round trip carries both halves of a selection (ADR 0079).
    let linked = snapshot_text(
        SPACE_ID,
        &space_text(
            SPACE_ID,
            r#"{"version":1,"title":"Meta"}"#,
            &[
                markdown(RESOURCE_ID, "Meta resource"),
                selecting(SECOND_RESOURCE_ID, MAP_ID, GRAPH_ID),
                selecting(LINK_RESOURCE_ID, MAP_ID, THIRD_GRAPH_ID),
                selecting(THIRD_SPACE_RESOURCE_ID, SECOND_MAP_ID, SECOND_GRAPH_ID),
                selecting(FOURTH_SPACE_RESOURCE_ID, SECOND_MAP_ID, FOURTH_GRAPH_ID),
            ],
        ),
    );
    let first_target = target(MAP_ID);
    let result = store
        .commit(commit(vec![
            update(&linked, 0),
            SpaceChange::Create {
                space_id: id(OTHER_SPACE_ID),
                snapshot: first_target,
            },
        ]))
        .await
        .unwrap();
    assert!(
        matches!(result, CommitResult::Committed { .. }),
        "{result:?}"
    );

    // The target changes the Map it opens on, and nothing else changes.
    let retargeted = target(SECOND_MAP_ID);
    assert_eq!(
        commit_update(store, &retargeted, 0).await,
        committed_one(OTHER_SPACE_ID, 1)
    );
    let store = reopened(harness).await;
    assert_eq!(
        store.load_aggregate().await,
        Ok(AggregateLoad::Loaded(LoadedAggregate {
            meta_space_id: id(SPACE_ID),
            spaces: vec![stored(&linked, 1, None), stored(&retargeted, 1, None)],
        }))
    );
    Ok(())
}

/// Not a port: content the tracked fixture lacks, each kept as committed —
/// a Graph's `color`, a Map's `activeGraph`, a Space Resource's `framing`,
/// and a missing plugin's content and Map content with their keys out of
/// canonical order — through initialization, a commit changing each, a
/// reopen, and an Export read again.
pub async fn keeps_what_the_fixture_lacks_as_committed<H: Harness>(harness: &mut H) -> Ran {
    let target = |color: &str, active: &str, framing: &str, unread: &str, unread_map: &str| {
        let meta = snapshot_text(
            SPACE_ID,
            &space_text(
                SPACE_ID,
                r#"{"version":1,"title":"Meta"}"#,
                &[
                    markdown(RESOURCE_ID, "Meta resource"),
                    format!(
                        r#"{{"id":"{LINK_RESOURCE_ID}","document":{{"title":"Framed","kind":"space","content":{{"spaceId":"{OTHER_SPACE_ID}","map":"{MAP_ID}","graph":"{GRAPH_ID}","framing":{framing}}}}}}}"#
                    ),
                ],
            ),
        );
        let other = snapshot_text(
            OTHER_SPACE_ID,
            &space_text(
                OTHER_SPACE_ID,
                &format!(
                    r#"{{"version":1,"title":"Coloured","defaultMap":"{MAP_ID}","maps":[{{"id":"{MAP_ID}","title":"Map","kind":"positioned","positions":{{"{OTHER_RESOURCE_ID}":{{"x":0,"y":0,"content":{unread_map}}}}},"graphs":[{{"id":"{GRAPH_ID}","title":"First","color":"{color}","edges":[]}},{{"id":"{SECOND_GRAPH_ID}","title":"Second","edges":[]}}],"activeGraph":"{active}"}}]}}"#
                ),
                &[format!(
                    r#"{{"id":"{OTHER_RESOURCE_ID}","document":{{"title":"Unread","kind":"vnd.example.unread","content":{unread}}}}}"#
                )],
            ),
        );
        (meta, other)
    };
    let (meta, other) = target(
        "#1f77b4",
        GRAPH_ID,
        r#"{"centreX":1.5,"centreY":-2,"zoom":0.75}"#,
        r#"{"zeta":1,"alpha":{"y":2,"x":1}}"#,
        r#"{"zoom":2,"layers":["ink"]}"#,
    );
    let store = harness.store().as_ref();
    seed(store, &[&meta, &other]).await;
    let store = reopened(harness).await;
    assert_eq!(
        store.load_space(id(OTHER_SPACE_ID)).await,
        Ok(Some(stored(&other, 0, None)))
    );
    assert_eq!(
        store.load_space(id(SPACE_ID)).await,
        Ok(Some(stored(&meta, 0, None)))
    );

    let (changed_meta, changed_other) = target(
        "#ff7f0e",
        SECOND_GRAPH_ID,
        r#"{"centreX":-3,"centreY":4.25,"zoom":2}"#,
        r#"{"zeta":[null,2.5],"alpha":{"y":3,"x":0}}"#,
        r#"{"zoom":3,"layers":[{"id":7}]}"#,
    );
    assert_eq!(
        store
            .commit(commit(vec![
                update(&changed_meta, 0),
                update(&changed_other, 0)
            ]))
            .await,
        Ok(committed(&[(SPACE_ID, 1), (OTHER_SPACE_ID, 1)], &[]))
    );
    let store = reopened(harness).await;
    assert_eq!(
        store.load_aggregate().await,
        Ok(AggregateLoad::Loaded(LoadedAggregate {
            meta_space_id: id(SPACE_ID),
            spaces: vec![
                stored(&changed_meta, 1, None),
                stored(&changed_other, 1, None)
            ],
        }))
    );

    let scratch = tempfile::tempdir().unwrap();
    let _exported = export_aggregate(store, &TokioFilesystem, scratch.path())
        .await
        .unwrap();
    let reread = reread(scratch.path()).await;
    let mut held = Vec::new();
    for space_id in [SPACE_ID, OTHER_SPACE_ID] {
        held.push(
            reread
                .load_space(id(space_id))
                .await
                .unwrap()
                .unwrap()
                .snapshot,
        );
    }
    let [read_meta, read_other] = held.as_slice() else {
        panic!("two Spaces");
    };
    assert_eq!(
        sorted(read_meta),
        sorted(&changed_meta),
        "the Meta Space, read from its files"
    );
    assert_eq!(
        sorted(read_other),
        sorted(&changed_other),
        "the Coloured Space and its unread Resource, read from their files"
    );
    Ok(())
}
