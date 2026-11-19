//! `load_space` and `load_aggregate` given a snapshot a host built in memory
//! rather than decoded: its shape is checked as `loadSpaceSnapshot` checks a
//! stored snapshot's, before its references are.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

use intake::json::{self, JsonValue};
use intake::{
    Edge, RefusalKind, ResourceId, Size, SpaceId, SpaceSnapshot, decode_space_snapshot,
    load_aggregate, load_space,
};

const SPACE: &str = "10000000-0000-4000-8000-000000000001";
const UR: &str = "00000000-0000-4000-8000-000000000101";
const REFERENCE: &str = "00000000-0000-4000-8000-000000000102";

/// A Space holding an Ur Resource and a Reference to it, both placed on its
/// one Map, whose one Graph has an Edge between them.
fn snapshot() -> SpaceSnapshot {
    let text = format!(
        r#"{{"id": "{SPACE}", "document": {{"version": 1, "title": "Talk", "maps": [
            {{"id": "00000000-0000-4000-8000-000000000a01", "title": "Working", "kind": "positioned",
              "positions": {{"{UR}": {{"x": 0, "y": 0}}, "{REFERENCE}": {{"x": 320, "y": 0}}}},
              "graphs": [{{"id": "00000000-0000-4000-8000-000000000b01", "title": "Main",
                          "edges": [{{"from": "{UR}", "to": "{REFERENCE}"}}]}}]}}
        ]}}, "resources": [
            {{"id": "{UR}", "document": {{"title": "Ur", "kind": "ur", "content": {{}}}}}},
            {{"id": "{REFERENCE}", "document": {{"title": "Reference", "kind": "reference",
                                                 "content": {{"target": "{UR}"}}}}}}
        ]}}"#
    );
    decode_space_snapshot(&json::parse(&text).unwrap(), space()).unwrap()
}

fn space() -> SpaceId {
    SpaceId::parse(SPACE).unwrap()
}

/// Each refusal's kind, file and field.
fn refused(snapshot: SpaceSnapshot) -> Vec<(RefusalKind, String, Option<String>)> {
    load_space(snapshot)
        .expect_err("the snapshot should be refused")
        .into_iter()
        .map(|refusal| {
            (
                refusal.kind(),
                refusal.file().into_owned(),
                refusal.field().map(|field| field.into_owned()),
            )
        })
        .collect()
}

fn invalid_shape(file: &str, field: &str) -> (RefusalKind, String, Option<String>) {
    (
        RefusalKind::InvalidShape,
        format!("{SPACE}/{file}"),
        Some(field.to_owned()),
    )
}

fn first_map(snapshot: &mut SpaceSnapshot) -> &mut intake::Map {
    snapshot
        .document
        .maps
        .as_mut()
        .and_then(|maps| maps.first_mut())
        .unwrap()
}

mod given_a_snapshot_built_in_memory {
    use super::*;

    #[test]
    fn loads_one_whose_shape_holds() {
        let loaded = load_space(snapshot()).unwrap();

        assert_eq!(
            loaded.snapshot(),
            &snapshot(),
            "a snapshot decoded from JSON loads unchanged"
        );
    }

    #[test]
    fn refuses_content_its_plugin_refuses_rather_than_read_it_as_declaring_nothing() {
        let mut snapshot = snapshot();
        let reference = ResourceId::parse(REFERENCE).unwrap();
        for resource in &mut snapshot.resources {
            if resource.id == reference {
                resource.content = JsonValue::Null;
            }
        }

        assert_eq!(
            refused(snapshot),
            vec![invalid_shape(
                &format!("resources/{REFERENCE}.json"),
                "content"
            )],
            "the Reference's content is no object"
        );
    }

    #[test]
    fn refuses_a_size_below_the_closed_size() {
        let mut snapshot = snapshot();
        let ur = ResourceId::parse(UR).unwrap();
        for (id, placement) in &mut first_map(&mut snapshot).positions {
            if *id == ur {
                placement.size = Some(Size {
                    width: 259.0,
                    height: 146.0,
                });
            }
        }

        assert_eq!(
            refused(snapshot),
            vec![invalid_shape(
                "space.json",
                &format!("maps.0.positions.{UR}.size.width")
            )],
            "a width one below the Closed Size"
        );
    }

    #[test]
    fn refuses_an_edge_title_not_trimmed() {
        let mut snapshot = snapshot();
        let graph = first_map(&mut snapshot).graphs.first_mut().unwrap();
        graph.edges = vec![Edge {
            title: Some(" Leads to".to_owned()),
            ..graph.edges.first().unwrap().clone()
        }];

        assert_eq!(
            refused(snapshot),
            vec![invalid_shape("space.json", "maps.0.graphs.0.edges.0.title")],
            "an Edge Title is trimmed"
        );
    }

    #[test]
    fn refuses_a_resource_placed_twice() {
        let mut snapshot = snapshot();
        let map = first_map(&mut snapshot);
        let first = map.positions.first().unwrap().clone();
        map.positions.push(first);

        assert_eq!(
            refused(snapshot),
            vec![invalid_shape(
                "space.json",
                &format!("maps.0.positions.{UR}")
            )],
            "a Map places each Resource once"
        );
    }

    #[test]
    fn refuses_it_through_the_aggregate_too() {
        let mut snapshot = snapshot();
        for resource in &mut snapshot.resources {
            resource.content = JsonValue::Null;
        }

        let refused = load_aggregate(space(), vec![snapshot])
            .expect_err("the aggregate's Space should be refused");

        assert!(
            refused
                .as_slice()
                .iter()
                .all(|refusal| refusal.kind() == RefusalKind::InvalidShape),
            "every Space through its own intake, shape first: {refused:?}"
        );
    }
}

mod given_an_aggregate_whose_space_stage_refuses {
    use super::*;

    const OTHER: &str = "10000000-0000-4000-8000-000000000002";

    /// A Space that passes its own intake, under another id.
    fn accepted_other() -> SpaceSnapshot {
        let text = format!(
            r#"{{"id": "{OTHER}", "document": {{"version": 1, "title": "Other"}}, "resources": []}}"#
        );
        decode_space_snapshot(&json::parse(&text).unwrap(), SpaceId::parse(OTHER).unwrap()).unwrap()
    }

    fn refused_snapshot() -> SpaceSnapshot {
        let mut snapshot = snapshot();
        for resource in &mut snapshot.resources {
            resource.content = JsonValue::Null;
        }
        snapshot
    }

    #[test]
    fn names_each_refused_space_by_its_position_with_its_own_refusals() {
        let refused = load_aggregate(space(), vec![accepted_other(), refused_snapshot()])
            .expect_err("the aggregate's second Space should be refused");

        let stage = refused
            .space_stage()
            .expect("the Space stage refused, so its refusals are each Space's");
        let positions: Vec<usize> = stage.iter().map(|(position, _)| *position).collect();
        assert_eq!(positions, vec![1], "only the second snapshot is refused");
        let held: Vec<_> = stage
            .iter()
            .flat_map(|(_, refusals)| refusals.iter())
            .collect();
        let all: Vec<_> = refused.as_slice().iter().collect();
        assert_eq!(held, all, "the stage holds every refusal, in order");
    }

    #[test]
    fn names_no_space_when_a_later_stage_refuses() {
        let refused = load_aggregate(space(), vec![snapshot(), snapshot()])
            .expect_err("an aggregate holding one Space twice should be refused");

        assert_eq!(
            refused.space_stage(),
            None,
            "a repeated Space id is the aggregate stage's"
        );
    }
}

mod given_two_snapshots_of_one_space {
    use super::*;

    #[test]
    fn refuses_the_repeated_space_id_alone_at_its_space_file() {
        let refused = load_aggregate(space(), vec![snapshot(), snapshot()])
            .expect_err("an aggregate holding one Space twice should be refused");

        let located: Vec<_> = refused
            .as_slice()
            .iter()
            .map(|refusal| (refusal.kind(), refusal.file().into_owned(), refusal.id()))
            .collect();
        assert_eq!(
            located,
            vec![(
                RefusalKind::DuplicateSpaceId,
                format!("{SPACE}/space.json"),
                Some(space().uuid()),
            )],
            "the repeated Space id stops intake before its Resources are judged repeated across Spaces"
        );
    }
}
