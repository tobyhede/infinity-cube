//! Import's rules the conformance corpus cannot hold: entries git cannot check
//! out (a symbolic link, an unreadable file), an asset over its cap, a kind no
//! listed plugin draws, and the Title order the cycle walk follows.

#![allow(
    clippy::unwrap_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

use intake::assets::{MAX_ASSET_BYTES, asset_hash_of};
use intake::{AggregateFiles, Entry, ImportedAggregate, Refusals, SpaceId, import_aggregate};

const META: &str = "10000000-0000-4000-8000-000000000001";
const SECOND: &str = "20000000-0000-4000-8000-000000000002";
const THIRD: &str = "30000000-0000-4000-8000-000000000003";

/// A Space with one empty Map, `<n>a01`, owning one Graph, `<n>b01`, where
/// `<n>` is the Space id's first digit.
fn space_json(id: &str) -> String {
    let n = &id[..1];
    format!(
        r#"{{"version": 1, "id": "{id}", "title": "Space {n}", "maps": [{{"id": "00000000-0000-4000-8000-00000000{n}a01", "title": "Working", "kind": "positioned", "positions": {{}}, "graphs": [{{"id": "00000000-0000-4000-8000-00000000{n}b01", "title": "Main", "edges": []}}]}}]}}"#
    )
}

fn resource_json(id: &str, title: &str, kind: &str, content: &str) -> String {
    format!(r#"{{"id": "{id}", "title": "{title}", "kind": "{kind}", "content": {content}}}"#)
}

/// A Space Resource owning `target` and selecting its one Map and Graph.
fn space_resource(id: &str, title: &str, target: &str) -> String {
    let n = &target[..1];
    resource_json(
        id,
        title,
        "space",
        &format!(
            r#"{{"spaceId": "{target}", "map": "00000000-0000-4000-8000-00000000{n}a01", "graph": "00000000-0000-4000-8000-00000000{n}b01"}}"#
        ),
    )
}

fn resource_path(space: &str, id: &str) -> String {
    format!("{space}/resources/{id}.json")
}

fn aggregate(spaces: &[&str]) -> AggregateFiles {
    let mut files = AggregateFiles::new();
    files.insert_file(
        "aggregate.json",
        format!(r#"{{"version": 1, "metaSpaceId": "{META}"}}"#),
    );
    for space in spaces {
        files.insert_file(format!("{space}/space.json"), space_json(space));
    }
    files
}

fn import(files: AggregateFiles) -> Result<ImportedAggregate, Refusals> {
    import_aggregate(files, || panic!("every id is written down"))
}

/// Each refusal's kind and file.
fn located(refusals: &Refusals) -> Vec<(String, String)> {
    refusals
        .as_slice()
        .iter()
        .map(|refusal| {
            (
                refusal.kind().as_str().to_owned(),
                refusal.file().into_owned(),
            )
        })
        .collect()
}

fn pair(kind: &str, file: &str) -> (String, String) {
    (kind.to_owned(), file.to_owned())
}

mod given_entries_git_cannot_check_out {
    use super::*;

    const RESOURCE: &str = "00000000-0000-4000-8000-000000000101";

    #[test]
    fn refuses_a_symbolic_link_where_a_resource_file_belongs() {
        let mut files = aggregate(&[META]);
        files.insert(resource_path(META, RESOURCE), Entry::SymbolicLink);

        let refused = import(files).unwrap_err();

        assert_eq!(
            located(&refused),
            vec![pair("symbolic-link", &resource_path(META, RESOURCE))],
            "a linked Resource file should be the one refusal"
        );
    }

    #[test]
    fn refuses_an_unreadable_resource_file_at_that_file() {
        let mut files = aggregate(&[META]);
        files.insert(resource_path(META, RESOURCE), Entry::Unreadable);

        let refused = import(files).unwrap_err();

        assert_eq!(
            located(&refused),
            vec![pair("unreadable", &resource_path(META, RESOURCE))],
            "an unreadable Resource file should be the one refusal"
        );
    }

    #[test]
    fn reports_every_listing_fault_together() {
        let mut files = aggregate(&[META, SECOND]);
        files.insert(format!("{SECOND}/resources"), Entry::Unlistable);
        files.insert("assets", Entry::Unlistable);

        let refused = import(files).unwrap_err();

        let mut found = located(&refused);
        found.sort();
        assert_eq!(
            found,
            vec![
                pair("unreadable", &format!("{SECOND}/resources")),
                pair("unreadable", "assets"),
            ],
            "both unlistable directories should be reported in one stage"
        );
    }

    #[test]
    fn refuses_an_unlistable_root_alone() {
        let mut files = aggregate(&[META]);
        files.insert(".", Entry::Unlistable);

        let refused = import(files).unwrap_err();

        assert_eq!(
            located(&refused),
            vec![pair("unreadable", ".")],
            "the root should be named `.`"
        );
    }
}

mod given_an_asset_over_its_cap {
    use super::*;

    #[test]
    fn refuses_it_at_its_file() {
        let bytes = vec![b'x'; MAX_ASSET_BYTES + 1];
        let name = format!("assets/{}.txt", asset_hash_of(&bytes));
        let mut files = aggregate(&[META]);
        files.insert_file(name.clone(), bytes);

        let refused = import(files).unwrap_err();

        assert_eq!(
            located(&refused),
            vec![pair("asset-refused", &name)],
            "the asset should be refused"
        );
    }

    #[test]
    fn accepts_one_at_its_cap() {
        let bytes = vec![b'x'; MAX_ASSET_BYTES];
        let mut files = aggregate(&[META]);
        files.insert_file(format!("assets/{}.txt", asset_hash_of(&bytes)), bytes);

        let imported = import(files).unwrap();

        assert_eq!(
            imported.assets.len(),
            1,
            "the asset at its cap should be stored"
        );
        assert_eq!(
            imported.assets.first().map(|asset| asset.media_type),
            Some("text/plain"),
            "its media type from its extension"
        );
    }

    #[test]
    fn takes_its_media_type_from_its_extension_ignoring_case() {
        let bytes = b"not really a picture".to_vec();
        let mut files = aggregate(&[META]);
        files.insert_file(format!("assets/{}.PNG", asset_hash_of(&bytes)), bytes);
        let unnamed = b"no extension".to_vec();
        files.insert_file(format!("assets/{}", asset_hash_of(&unnamed)), unnamed);

        let mut media_types: Vec<&str> = import(files)
            .unwrap()
            .assets
            .iter()
            .map(|asset| asset.media_type)
            .collect();
        media_types.sort_unstable();

        assert_eq!(
            media_types,
            vec!["application/octet-stream", "image/png"],
            "an extension in any case, and none at all"
        );
    }
}

mod given_a_kind_no_listed_plugin_draws {
    use super::*;

    const WIDGET: &str = "00000000-0000-4000-8000-000000000101";
    const REFERENCE: &str = "00000000-0000-4000-8000-000000000102";

    fn with_widget(spaces: &[&str]) -> AggregateFiles {
        let mut files = aggregate(spaces);
        files.insert_file(
            resource_path(META, WIDGET),
            resource_json(WIDGET, "Widget", "vnd.acme.widget", r#"{"dial": 11}"#),
        );
        files
    }

    #[test]
    fn carries_a_reference_targeting_it() {
        let mut files = with_widget(&[META]);
        files.insert_file(
            resource_path(META, REFERENCE),
            resource_json(
                REFERENCE,
                "Pointer",
                "reference",
                &format!(r#"{{"target": "{WIDGET}"}}"#),
            ),
        );

        let imported = import(files);

        assert!(
            imported.is_ok(),
            "a Target of a missing kind should be carried: {imported:?}"
        );
    }

    #[test]
    fn holds_an_unreferenced_space_rather_than_refusing_it() {
        let imported = import(with_widget(&[META, SECOND])).unwrap();
        let second = SpaceId::parse(SECOND).unwrap();

        assert_eq!(
            imported.aggregate.held_space_ids(),
            &[second],
            "the unreferenced Space should be held"
        );
        assert_eq!(
            imported.aggregate.refused_unrooted_space_ids([second]),
            Vec::<SpaceId>::new(),
            "a Space already held should not be refused"
        );
        assert_eq!(
            imported.aggregate.refused_unrooted_space_ids([]),
            vec![second],
            "a Space not already held should be refused"
        );
    }

    #[test]
    fn refuses_an_unreferenced_space_once_no_such_resource_remains() {
        let refused = import(aggregate(&[META, SECOND])).unwrap_err();

        assert_eq!(
            located(&refused),
            vec![pair(
                "ordinary-space-unreferenced",
                &format!("{SECOND}/space.json")
            )],
            "the unreferenced Space should be refused"
        );
    }
}

mod given_a_cycle_reached_through_titles_of_either_case {
    use super::*;

    /// The Meta Space owns the second Space through "apple" and the third
    /// through "Banana"; the second and third own each other. Title order is
    /// by UTF-16 code unit, so "Banana" is walked first and the back edge is
    /// the second Space's reference to the third. A locale order would walk
    /// "apple" first and report the third Space's reference instead.
    #[test]
    fn reports_the_reference_code_unit_title_order_reaches_last() {
        let mut files = aggregate(&[META, SECOND, THIRD]);
        let apple = "00000000-0000-4000-8000-000000000101";
        let banana = "00000000-0000-4000-8000-000000000102";
        let second_back = "00000000-0000-4000-8000-000000000201";
        let third_back = "00000000-0000-4000-8000-000000000301";
        files.insert_file(
            resource_path(META, apple),
            space_resource(apple, "apple", SECOND),
        );
        files.insert_file(
            resource_path(META, banana),
            space_resource(banana, "Banana", THIRD),
        );
        files.insert_file(
            resource_path(SECOND, second_back),
            space_resource(second_back, "To third", THIRD),
        );
        files.insert_file(
            resource_path(THIRD, third_back),
            space_resource(third_back, "To second", SECOND),
        );

        let refused = import(files).unwrap_err();

        assert_eq!(
            located(&refused),
            vec![pair(
                "space-reference-cycle",
                &resource_path(SECOND, second_back)
            )],
            "the second Space's reference should close the cycle"
        );
    }
}

mod given_a_file_where_import_lists_a_directory {
    use super::*;

    #[test]
    fn refuses_a_file_named_assets_as_an_unreadable_directory() {
        let mut files = aggregate(&[META]);
        files.insert_file("assets", b"not a directory".to_vec());

        let refused = import(files).unwrap_err();

        assert_eq!(
            located(&refused),
            vec![pair("unreadable", "assets")],
            "a file at assets/ cannot be listed, as the TypeScript reader's ENOTDIR"
        );
    }

    #[test]
    fn refuses_a_file_named_resources_as_an_unreadable_directory() {
        let mut files = aggregate(&[META]);
        files.insert_file(format!("{META}/resources"), b"not a directory".to_vec());

        let refused = import(files).unwrap_err();

        assert_eq!(
            located(&refused),
            vec![pair("unreadable", &format!("{META}/resources"))],
            "a file at a Space's resources/ cannot be listed"
        );
    }

    #[test]
    fn refuses_an_unreadable_file_named_assets_as_an_unreadable_directory() {
        let mut files = aggregate(&[META]);
        files.insert("assets", Entry::Unreadable);

        let refused = import(files).unwrap_err();

        assert_eq!(
            located(&refused),
            vec![pair("unreadable", "assets")],
            "an unreadable file at assets/ cannot be listed either"
        );
    }
}

mod given_an_entry_at_the_root_import_does_not_read {
    use super::*;

    #[test]
    fn ignores_an_unreadable_file_beside_the_space_directories() {
        let mut files = aggregate(&[META]);
        files.insert("notes", Entry::Unreadable);

        assert!(
            import(files).is_ok(),
            "a file at the root other than aggregate.json is not read"
        );
    }

    #[test]
    fn refuses_a_space_directory_that_cannot_be_listed() {
        let mut files = aggregate(&[META]);
        files.insert(SECOND, Entry::Unlistable);

        assert_eq!(
            located(&import(files).unwrap_err()),
            vec![pair("unreadable", SECOND)],
            "a directory the host cannot open is Unlistable, and refused"
        );
    }
}
