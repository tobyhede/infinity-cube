use bytes::Bytes;
use intake::json::parse;
use intake::{SpaceId, SpaceSnapshot, decode_space_snapshot};

use super::*;

const META: &str = "10000000-0000-4000-8000-000000000001";

fn meta(title: &str) -> SpaceSnapshot {
    let value = parse(&format!(
        r#"{{"id":"{META}","document":{{"version":1,"title":"{title}"}},"resources":[]}}"#
    ))
    .unwrap();
    decode_space_snapshot(&value, SpaceId::parse(META).unwrap()).unwrap()
}

fn input(title: &str) -> AggregateInput {
    AggregateInput {
        meta_space_id: SpaceId::parse(META).unwrap(),
        spaces: vec![meta(title)],
    }
}

fn run<F: std::future::Future>(future: F) -> F::Output {
    tokio::runtime::Builder::new_current_thread()
        .build()
        .unwrap()
        .block_on(future)
}

mod given_an_empty_store {
    use super::*;

    #[test]
    fn initializes_every_space_at_revision_zero() {
        run(async {
            let store = MemorySpaceRepository::new();
            let result = store.initialize_aggregate(input("Talk")).await.unwrap();
            assert!(
                matches!(result, InitializeResult::Initialized(_)),
                "got {result:?}"
            );
            let AggregateLoad::Loaded(aggregate) = store.load_aggregate().await.unwrap() else {
                panic!("expected a loaded aggregate");
            };
            assert_eq!(aggregate.spaces[0].revision, Revision::FIRST, "revision 0");
        });
    }

    #[test]
    fn will_not_replace_what_is_not_there() {
        run(async {
            let store = MemorySpaceRepository::new();
            let result = store.replace_aggregate(input("Talk"), None).await.unwrap();
            assert_eq!(
                result,
                ReplaceResult::Uninitialized,
                "first state is initialize's"
            );
        });
    }
}

mod given_an_initialized_store {
    use super::*;

    async fn store() -> MemorySpaceRepository {
        let store = MemorySpaceRepository::new();
        store.initialize_aggregate(input("Talk")).await.unwrap();
        store
    }

    #[test]
    fn answers_existing_for_the_same_aggregate_and_keeps_another() {
        run(async {
            let store = store().await;
            let same = store.initialize_aggregate(input("Talk")).await.unwrap();
            assert!(
                matches!(same, InitializeResult::Existing(_)),
                "got {same:?}"
            );
            let other = store.initialize_aggregate(input("Other")).await.unwrap();
            assert!(
                matches!(other, InitializeResult::AlreadyInitialized(_)),
                "got {other:?}"
            );
        });
    }

    #[test]
    fn replaces_only_for_the_meta_identity_it_holds() {
        run(async {
            let store = store().await;
            let stale = store
                .replace_aggregate(
                    input("New"),
                    Some(SpaceId::parse("10000000-0000-4000-8000-000000000009").unwrap()),
                )
                .await
                .unwrap();
            assert!(
                matches!(stale, ReplaceResult::Conflict { .. }),
                "got {stale:?}"
            );
            let replaced = store
                .replace_aggregate(input("New"), SpaceId::parse(META))
                .await
                .unwrap();
            assert!(
                matches!(replaced, ReplaceResult::Replaced(_)),
                "got {replaced:?}"
            );
        });
    }

    #[test]
    fn records_the_revision_an_export_wrote() {
        run(async {
            let store = store().await;
            let id = SpaceId::parse(META).unwrap();
            store.mark_exported(id, Revision::FIRST).await.unwrap();
            let loaded = store.load_space(id).await.unwrap().unwrap();
            assert_eq!(loaded.exported_revision, Some(Revision::FIRST), "marked");
        });
    }
}

mod assets {
    use super::*;

    #[test]
    fn stores_by_content_once_keeping_the_first_type() {
        run(async {
            let store = MemorySpaceRepository::new();
            let first = StoredAsset::admit(Bytes::from_static(b"png"), "image/png").unwrap();
            let again = StoredAsset::admit(Bytes::from_static(b"png"), "text/plain").unwrap();
            assert_eq!(
                store.store_asset(first.clone()).await,
                Ok(AssetStored::Stored),
                "first"
            );
            assert_eq!(
                store.store_asset(again).await,
                Ok(AssetStored::Existing),
                "again"
            );
            let loaded = store.load_asset(&first.hash).await.unwrap().unwrap();
            assert_eq!(loaded.media_type, "image/png", "the first type stands");
        });
    }

    #[test]
    fn always_holds_the_asset_of_zero_bytes() {
        run(async {
            let store = MemorySpaceRepository::new();
            let empty = StoredAsset::empty();
            assert_eq!(
                store.store_asset(empty.clone()).await,
                Ok(AssetStored::Existing),
                "held"
            );
            assert_eq!(
                store.load_asset(&empty.hash).await,
                Ok(Some(empty)),
                "served"
            );
        });
    }
}
