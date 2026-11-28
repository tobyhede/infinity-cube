//! The contract's asset cases: assets stored by hash with the media type
//! they were first stored as, kept outside the aggregate the lifecycle doors
//! replace and across a fresh host (rust-sqlite-test-coverage 06).

use std::path::Path;

use bytes::Bytes;
use host::{
    AggregateInput, AssetHash, AssetStored, ReplaceResult, SpaceRepository, StoredAsset,
    TokioFilesystem, export_aggregate, import_directory,
};

use super::*;

const PNG: &[u8] = &[
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0x7f, 0x80,
];
const TEXT: &[u8] = b"# Notes\n";
const BINARY: &[u8] = &[0x00, 0xff, 0x10, 0x80];

fn asset(bytes: &'static [u8], media_type: &str) -> StoredAsset {
    StoredAsset::admit(Bytes::from_static(bytes), media_type).unwrap()
}

// Case: stores an asset of any type and loads its bytes and media type unchanged
pub async fn stores_an_asset_of_any_type_and_loads_it_unchanged<H: Harness>(
    harness: &mut H,
) -> Ran {
    let assets = [
        asset(PNG, "image/png"),
        asset(TEXT, "text/markdown"),
        asset(BINARY, "application/x-made-up"),
    ];
    for stored in &assets {
        assert_same!(
            H,
            harness.store().store_asset(stored.clone()).await,
            Ok(AssetStored::Stored)
        );
    }
    let store = reopened(harness).await;
    for (stored, bytes, media_type) in [
        (&assets[0], PNG, "image/png"),
        (&assets[1], TEXT, "text/markdown"),
        (&assets[2], BINARY, "application/x-made-up"),
    ] {
        assert_same!(
            H,
            store.load_asset(&stored.hash).await,
            Ok(Some(StoredAsset {
                hash: AssetHash::of(bytes),
                media_type: media_type.to_owned(),
                bytes: Bytes::from_static(bytes),
            }))
        );
    }
    Ok(())
}

fn copy_tree(from: &Path, to: &Path) {
    std::fs::create_dir_all(to).unwrap();
    for entry in std::fs::read_dir(from).unwrap() {
        let entry = entry.unwrap();
        let target = to.join(entry.file_name());
        if entry.file_type().unwrap().is_dir() {
            copy_tree(&entry.path(), &target);
        } else {
            std::fs::copy(entry.path(), target).unwrap();
        }
    }
}

fn read_tree(root: &Path) -> Vec<(String, Vec<u8>)> {
    fn walk(root: &Path, directory: &Path, files: &mut Vec<(String, Vec<u8>)>) {
        for entry in std::fs::read_dir(directory).unwrap() {
            let entry = entry.unwrap();
            let path = entry.path();
            if entry.file_type().unwrap().is_dir() {
                walk(root, &path, files);
            } else if !entry.file_name().to_string_lossy().starts_with('.') {
                let name = path
                    .strip_prefix(root)
                    .unwrap()
                    .to_string_lossy()
                    .into_owned();
                files.push((name, std::fs::read(&path).unwrap()));
            }
        }
    }
    let mut files = Vec::new();
    walk(root, root, &mut files);
    files.sort();
    files
}

// Case: holds a Markdown Resource decoded from its file, and its text, as the same value
/// The new Space `infinity-cube init` writes (`conformance/init/expected`),
/// its one Markdown Resource naming a text asset the directory carries:
/// Imported, the Resource and its text are what the store holds, and
/// Exported in place, the directory's files are the bytes they were.
pub async fn holds_a_markdown_resource_from_its_file_and_its_text_as_one_value<H: Harness>(
    harness: &mut H,
) -> Ran {
    let text = asset(TEXT, "text/markdown");
    let temporary = tempfile::tempdir().unwrap();
    let directory = temporary.path().join("space");
    copy_tree(
        &Path::new(env!("CARGO_MANIFEST_DIR")).join("../../conformance/init/expected"),
        &directory,
    );
    let space_id = "00000000-0000-4000-8000-000000000001";
    let resource_file = directory
        .join(space_id)
        .join("resources/00000000-0000-4000-8000-000000000002.json");
    let written = std::fs::read_to_string(&resource_file)
        .unwrap()
        .replace(&EMPTY_ASSET_REF[8..], text.hash.as_str());
    std::fs::write(&resource_file, written).unwrap();
    std::fs::create_dir_all(directory.join("assets")).unwrap();
    std::fs::write(
        directory.join("assets").join(format!("{}.md", text.hash)),
        TEXT,
    )
    .unwrap();
    let before = read_tree(&directory);

    import_directory(
        harness.store().as_ref(),
        &TokioFilesystem,
        &directory,
        &http_conformance::Counted::default(),
    )
    .await
    .unwrap();
    let store = reopened(harness).await;
    let loaded = store.load_space(id(space_id)).await.unwrap().unwrap();
    let [resource] = loaded.snapshot.resources.as_slice() else {
        panic!("the one Resource: {:?}", loaded.snapshot.resources);
    };
    assert_same!(H, resource.title, "Resource 1");
    assert_same!(H, resource.kind.as_str(), "markdown");
    assert_eq!(
        resource
            .content
            .as_object()
            .and_then(|content| content.get("url")),
        Some(&intake::json::JsonValue::String(format!(
            "/assets/{}",
            text.hash
        )))
    );
    assert_same!(H, store.load_asset(&text.hash).await, Ok(Some(text)));

    let _exported = export_aggregate(store, &TokioFilesystem, &directory)
        .await
        .unwrap();
    assert_same!(
        H,
        read_tree(&directory),
        before,
        "the files Export writes back"
    );
    // Export in place skips a file it would write unchanged, so only an
    // Export into an empty directory shows it writes every file.
    let fresh = temporary.path().join("fresh");
    std::fs::create_dir_all(&fresh).unwrap();
    let _exported = export_aggregate(store, &TokioFilesystem, &fresh)
        .await
        .unwrap();
    assert_same!(
        H,
        read_tree(&fresh),
        before,
        "the files Export writes to an empty directory"
    );
    Ok(())
}

// Case: stores the same bytes once, keeping the first media type
pub async fn stores_the_same_bytes_once_keeping_the_first_media_type<H: Harness>(
    harness: &mut H,
) -> Ran {
    let first = asset(PNG, "image/png");
    let store = harness.store().as_ref();
    assert_same!(
        H,
        store.store_asset(first.clone()).await,
        Ok(AssetStored::Stored)
    );
    assert_same!(
        H,
        store.store_asset(asset(PNG, "text/plain")).await,
        Ok(AssetStored::Existing)
    );
    let store = reopened(harness).await;
    assert_same!(H, store.load_asset(&first.hash).await, Ok(Some(first)));
    Ok(())
}

// Case: answers an asset it does not store as absent
pub async fn answers_an_asset_it_does_not_store_as_absent<H: Harness>(harness: &mut H) -> Ran {
    assert_same!(
        H,
        harness.store().load_asset(&AssetHash::of(PNG)).await,
        Ok(None)
    );
    Ok(())
}

// Case: holds the asset of zero bytes already, under the type it always has
pub async fn holds_the_asset_of_zero_bytes_already<H: Harness>(harness: &mut H) -> Ran {
    let store = harness.store().as_ref();
    let empty = StoredAsset::empty();
    assert_same!(
        H,
        store.load_asset(&empty.hash).await,
        Ok(Some(empty.clone()))
    );
    let declared = StoredAsset::admit(Bytes::new(), "text/plain").unwrap();
    assert_same!(H, declared.hash, empty.hash);
    assert_same!(
        H,
        store.store_asset(declared).await,
        Ok(AssetStored::Existing)
    );
    let store = reopened(harness).await;
    assert_same!(H, store.load_asset(&empty.hash).await, Ok(Some(empty)));
    Ok(())
}

// Case: keeps stored assets outside the aggregate its lifecycle doors replace
pub async fn keeps_stored_assets_outside_the_aggregate_the_doors_replace<H: Harness>(
    harness: &mut H,
) -> Ran {
    let stored_asset = asset(PNG, "image/png");
    let store = harness.store().as_ref();
    seed(store, &[&space(SPACE_ID, "Before", &[RESOURCE_ID])]).await;
    store.store_asset(stored_asset.clone()).await.unwrap();
    let replaced = store
        .replace_aggregate(
            AggregateInput {
                meta_space_id: id(OTHER_SPACE_ID),
                spaces: vec![space(OTHER_SPACE_ID, "After", &[])],
            },
            Some(id(SPACE_ID)),
        )
        .await;
    assert!(
        matches!(replaced, Ok(ReplaceResult::Replaced(_))),
        "{replaced:?}"
    );
    let store = reopened(harness).await;
    assert_same!(
        H,
        store.load_asset(&stored_asset.hash).await,
        Ok(Some(stored_asset))
    );
    Ok(())
}

// Case: keeps a stored asset across a fresh repository host
pub async fn keeps_a_stored_asset_across_a_fresh_host<H: Harness>(harness: &mut H) -> Ran {
    let stored_asset = asset(TEXT, "text/markdown");
    harness
        .store()
        .store_asset(stored_asset.clone())
        .await
        .unwrap();
    harness.reopen().await?;
    assert_same!(
        H,
        harness.store().load_asset(&stored_asset.hash).await,
        Ok(Some(stored_asset))
    );
    Ok(())
}
