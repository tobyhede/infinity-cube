//! Product addresses (ADR 0069, `packages/http/src/product-destination.ts`):
//! `/spaces/<compact id>` and the destinations below it, each id spelled as
//! the unpadded base64url of its 128 bits.

use intake::assets::{Base64, encode_base64};
use intake::{GraphId, MapId, ResourceId, SpaceId, SpaceSnapshot, Uuid};

const BASE64URL: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/// A UUID's compact spelling: its 16 bytes as 22 base64url digits.
pub(crate) fn encode_compact(id: Uuid) -> String {
    let hex: String = id.as_str().chars().filter(|ch| *ch != '-').collect();
    let value = u128::from_str_radix(&hex, 16).unwrap_or_default();
    encode_base64(&value.to_be_bytes(), Base64::Url)
}

/// The UUID a compact spelling names, in lower case; `None` for any other
/// spelling, including one whose unused low bits are not zero.
pub(crate) fn decode_compact(text: &str) -> Option<Uuid> {
    if text.len() != 22 {
        return None;
    }
    let mut digits = text.bytes().map(|byte| {
        BASE64URL
            .iter()
            .position(|digit| *digit == byte)
            .and_then(|value| u128::try_from(value).ok())
    });
    // The first 21 digits carry 126 bits; the last carries the id's two
    // lowest, then four bits of padding that must be zero.
    let mut value: u128 = 0;
    for digit in digits.by_ref().take(21) {
        value = (value << 6) | digit?;
    }
    let last = digits.next()??;
    if last & 0xf != 0 {
        return None;
    }
    Some(Uuid::from_u128((value << 2) | (last >> 4)))
}

/// Where a product address leads.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Destination {
    Space,
    Notes,
    Resource(ResourceId),
    Graph(GraphId),
    Map(MapId),
    MapResource(MapId, ResourceId),
    MapGraph(MapId, GraphId),
    Presentation(MapId, GraphId, ResourceId),
}

/// What a pathname claims, before any Space is read.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Address {
    /// Not a product address.
    Outside,
    /// A product address that cannot be read.
    Malformed,
    /// A destination in a Space.
    Addressed(SpaceId, Destination),
}

fn parse_destination(pathname: &str) -> Option<(SpaceId, Destination)> {
    let segments: Vec<&str> = pathname.split('/').collect();
    if !matches!(segments.len(), 3 | 4 | 5 | 7 | 9) {
        return None;
    }
    if segments.first() != Some(&"") || segments.get(1) != Some(&"spaces") {
        return None;
    }
    let compact = |index: usize| segments.get(index).and_then(|text| decode_compact(text));
    let space = SpaceId::from(compact(2)?);
    let destination = match (
        segments.len(),
        segments.get(3).copied(),
        segments.get(5).copied(),
    ) {
        (3, _, _) => Destination::Space,
        (4, Some("notes"), _) => Destination::Notes,
        (5, Some("resources"), _) => Destination::Resource(compact(4)?.into()),
        (5, Some("graphs"), _) => Destination::Graph(compact(4)?.into()),
        (5, Some("maps"), _) => Destination::Map(compact(4)?.into()),
        (7, Some("maps"), Some("resources")) => {
            Destination::MapResource(compact(4)?.into(), compact(6)?.into())
        }
        (7, Some("maps"), Some("graphs")) => {
            Destination::MapGraph(compact(4)?.into(), compact(6)?.into())
        }
        (9, Some("maps"), Some("graphs")) if segments.get(7) == Some(&"present") => {
            Destination::Presentation(compact(4)?.into(), compact(6)?.into(), compact(8)?.into())
        }
        _ => return None,
    };
    Some((space, destination))
}

/// `productAddress`: `/spaces` and everything below it are ours to answer.
pub(crate) fn address(pathname: &str) -> Address {
    if pathname != "/spaces" && !pathname.starts_with("/spaces/") {
        return Address::Outside;
    }
    parse_destination(pathname).map_or(Address::Malformed, |(space, destination)| {
        Address::Addressed(space, destination)
    })
}

/// The canonical address of a Space.
pub(crate) fn space_path(space: SpaceId) -> String {
    format!("/spaces/{}", encode_compact(space.uuid()))
}

/// Whether `destination` names something `snapshot` holds.
pub(crate) fn resolves(snapshot: &SpaceSnapshot, destination: Destination) -> bool {
    let maps = snapshot.document.maps.as_deref().unwrap_or_default();
    let has_resource = |id: ResourceId| snapshot.resources.iter().any(|resource| resource.id == id);
    let owner = |graph: GraphId| {
        maps.iter()
            .find(|map| map.graphs.iter().any(|owned| owned.id == graph))
    };
    let map = |id: MapId| maps.iter().find(|map| map.id == id);
    match destination {
        Destination::Space | Destination::Notes => true,
        Destination::Resource(resource) => has_resource(resource),
        Destination::Graph(graph) => owner(graph).is_some(),
        Destination::Map(id) => map(id).is_some(),
        Destination::MapResource(id, resource) => {
            has_resource(resource)
                && map(id)
                    .is_some_and(|map| map.positions.iter().any(|(placed, _)| *placed == resource))
        }
        Destination::MapGraph(id, graph) => {
            owner(graph).is_some_and(|owner| owner.id == id) && map(id).is_some()
        }
        Destination::Presentation(id, graph, resource) => {
            has_resource(resource)
                && map(id).is_some()
                && owner(graph).is_some_and(|owner| {
                    owner.id == id
                        && owner.graphs.iter().any(|owned| {
                            owned.id == graph
                                && owned
                                    .edges
                                    .iter()
                                    .any(|edge| edge.from == resource || edge.to == resource)
                        })
                })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spells_a_uuid_in_twenty_two_digits_and_reads_it_back() {
        let id = Uuid::parse("00000000-0000-4000-8000-000000000040").unwrap();
        let compact = encode_compact(id);
        assert_eq!(
            compact, "AAAAAAAAQACAAAAAAAAAQA",
            "the fixture's Meta Space"
        );
        assert_eq!(decode_compact(&compact), Some(id), "read back");
        assert_eq!(
            decode_compact("AAAAAAAAQACAAAAAAAAAQB"),
            None,
            "unused bits set"
        );
        assert_eq!(decode_compact("not-an-id"), None, "too short");
    }

    #[test]
    fn reads_back_an_id_whose_first_digit_is_not_zero() {
        let id = Uuid::parse("a1234567-89ab-4cde-8fab-0123456789ab").unwrap();
        let compact = encode_compact(id);
        assert_eq!(
            compact, "oSNFZ4mrTN6PqwEjRWeJqw",
            "the top bits are spelled"
        );
        assert_eq!(decode_compact(&compact), Some(id), "and read back");
        let all = Uuid::parse("ffffffff-ffff-4fff-bfff-ffffffffffff").unwrap();
        assert_eq!(
            decode_compact(&encode_compact(all)),
            Some(all),
            "every bit set"
        );
    }

    proptest::proptest! {
        #[test]
        fn every_id_reads_back_from_its_compact_spelling(value: u128) {
            let id = Uuid::from_u128(value);
            proptest::prop_assert_eq!(decode_compact(&encode_compact(id)), Some(id));
        }
    }

    #[test]
    fn tells_outside_malformed_and_addressed_apart() {
        assert_eq!(address("/somewhere"), Address::Outside, "not ours");
        assert_eq!(
            address("/spaces"),
            Address::Malformed,
            "the collection is not addressable"
        );
        assert_eq!(address("/spaces/not-an-id"), Address::Malformed, "no id");
        assert_eq!(
            address("/spaces/AAAAAAAAQACAAAAAAAAAQA/nowhere"),
            Address::Malformed,
            "no such page"
        );
        assert!(
            matches!(
                address("/spaces/AAAAAAAAQACAAAAAAAAAQA/notes"),
                Address::Addressed(_, Destination::Notes)
            ),
            "notes"
        );
    }
}
