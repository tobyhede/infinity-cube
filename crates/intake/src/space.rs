//! One Space's intake (ADR 0010): its shape and references checked and its
//! entities indexed. A [`Space`] exists only as [`load_space`]'s answer, so
//! every one is consistent by construction.

use std::collections::{HashMap, HashSet};

use crate::ids::{GraphId, MapId, ResourceId, SpaceId};
use crate::model::{Graph, Map, Resource, SpaceSnapshot};
use crate::plugins::{listed, map_content_problem};
use crate::refusal::{EdgeEnd, EdgeEnds, Refusal, Refusals};
use crate::snapshot::checked_shape;
use crate::text::compare_utf16;

/// A validated, indexed Space: its snapshot, and lookups over its Resources,
/// Maps and Graphs.
#[derive(Debug, Clone, PartialEq)]
pub struct Space {
    snapshot: SpaceSnapshot,
    resources: HashMap<ResourceId, usize>,
    maps: HashMap<MapId, usize>,
    graphs: HashMap<GraphId, (usize, usize)>,
    /// The Resources by Title, then id, each compared by UTF-16 code unit.
    title_order: Vec<usize>,
}

impl Space {
    /// Its id.
    #[must_use]
    pub fn id(&self) -> SpaceId {
        self.snapshot.id
    }

    /// The snapshot it was loaded from, as its shape's decoding normalized it.
    #[must_use]
    pub fn snapshot(&self) -> &SpaceSnapshot {
        &self.snapshot
    }

    /// The snapshot, owned.
    #[must_use]
    pub fn into_snapshot(self) -> SpaceSnapshot {
        self.snapshot
    }

    /// Its Maps, in declared order.
    #[must_use]
    pub fn maps(&self) -> &[Map] {
        self.snapshot.document.maps.as_deref().unwrap_or_default()
    }

    /// The Resource with this id.
    #[must_use]
    pub fn resource(&self, id: ResourceId) -> Option<&Resource> {
        self.snapshot.resources.get(*self.resources.get(&id)?)
    }

    /// The Map with this id.
    #[must_use]
    pub fn map(&self, id: MapId) -> Option<&Map> {
        self.maps().get(*self.maps.get(&id)?)
    }

    /// The Graph with this id, and the Map that owns it.
    #[must_use]
    pub fn graph(&self, id: GraphId) -> Option<(&Graph, &Map)> {
        let (map_index, graph_index) = *self.graphs.get(&id)?;
        let map = self.maps().get(map_index)?;
        Some((map.graphs.get(graph_index)?, map))
    }

    /// Its Resources by Title, then id, each compared by UTF-16 code unit: the
    /// order the Space reference cycle walk follows.
    pub fn resources_by_title(&self) -> impl Iterator<Item = &Resource> {
        self.title_order
            .iter()
            .filter_map(|index| self.snapshot.resources.get(*index))
    }
}

/// Check a Space and index it (`loadSpaceSnapshot`): first its shape, as
/// [`decode_space_snapshot`](crate::decode_space_snapshot) checks a snapshot
/// as JSON, so a snapshot built in memory is held to the rules a decoded one
/// met; then its references: every reference resolves, no id repeats, every
/// Edge is closed over its Map, every placement's Map content is its plugin's,
/// and no Resource references its own Space.
///
/// # Errors
///
/// Returns every shape fault the snapshot has, as `invalid-shape` refusals;
/// or, when its shape holds, every reference fault; each located in its
/// directory.
///
/// # Examples
///
/// ```
/// use intake::{RefusalKind, SpaceId, decode_space_snapshot, json, load_space};
///
/// let id = SpaceId::parse("10000000-0000-4000-8000-000000000001").unwrap();
/// let snapshot = json::parse(&format!(
///     r#"{{"id": "{id}", "document": {{"version": 1, "title": "Talk", "maps": [
///         {{"id": "00000000-0000-4000-8000-000000000a01", "title": "Working", "kind": "positioned",
///           "positions": {{"00000000-0000-4000-8000-000000000101": {{"x": 0, "y": 0}}}},
///           "graphs": [{{"id": "00000000-0000-4000-8000-000000000b01", "title": "Main", "edges": []}}]}}
///     ]}}, "resources": []}}"#
/// ))
/// .unwrap();
/// let snapshot = decode_space_snapshot(&snapshot, id).unwrap();
///
/// let refused = load_space(snapshot).unwrap_err();
/// assert_eq!(refused.as_slice()[0].kind(), RefusalKind::MapMemberMissingResource);
/// ```
pub fn load_space(snapshot: SpaceSnapshot) -> Result<Space, Refusals> {
    let snapshot = checked_shape(&snapshot)?;
    Refusals::check(reference_refusals(&snapshot))?;
    let resources = snapshot
        .resources
        .iter()
        .enumerate()
        .map(|(index, resource)| (resource.id, index))
        .collect();
    let maps_list = snapshot.document.maps.as_deref().unwrap_or_default();
    let maps = maps_list
        .iter()
        .enumerate()
        .map(|(index, map)| (map.id, index))
        .collect();
    let graphs = maps_list
        .iter()
        .enumerate()
        .flat_map(|(map_index, map)| {
            map.graphs
                .iter()
                .enumerate()
                .map(move |(graph_index, graph)| (graph.id, (map_index, graph_index)))
        })
        .collect();
    let mut title_order: Vec<usize> = (0..snapshot.resources.len()).collect();
    title_order.sort_by(|left, right| {
        match (
            snapshot.resources.get(*left),
            snapshot.resources.get(*right),
        ) {
            (Some(left), Some(right)) => compare_utf16(&left.title, &right.title)
                .then_with(|| compare_utf16(left.id.as_str(), right.id.as_str())),
            _ => std::cmp::Ordering::Equal,
        }
    });
    Ok(Space {
        snapshot,
        resources,
        maps,
        graphs,
        title_order,
    })
}

/// Each id `ids` yields more than once, once, in the order first repeated.
pub(crate) fn repeated<T: Copy + Eq + std::hash::Hash>(ids: impl Iterator<Item = T>) -> Vec<T> {
    let mut seen = HashSet::new();
    let mut reported = HashSet::new();
    let mut repeats = Vec::new();
    for id in ids {
        if !seen.insert(id) && reported.insert(id) {
            repeats.push(id);
        }
    }
    repeats
}

/// `validateReferences`: every reference fault, each reported once.
fn reference_refusals(snapshot: &SpaceSnapshot) -> Vec<Refusal> {
    let space = snapshot.id;
    let mut refusals = Vec::new();
    let by_id: HashMap<ResourceId, &Resource> = snapshot
        .resources
        .iter()
        .map(|resource| (resource.id, resource))
        .collect();
    let maps = snapshot.document.maps.as_deref().unwrap_or_default();

    // A repeated id names no one Resource, so no copy's plugin judges Map
    // content kept for it, nor whether its kind may be a Target: the repeat is
    // the one fault (the corpus README's rule).
    let repeated_resources = repeated(snapshot.resources.iter().map(|resource| resource.id));
    for resource in &repeated_resources {
        refusals.push(Refusal::DuplicateResourceId {
            space,
            resource: *resource,
        });
    }
    let repeated_resources: HashSet<ResourceId> = repeated_resources.into_iter().collect();
    for map in repeated(maps.iter().map(|map| map.id)) {
        refusals.push(Refusal::DuplicateMapId { space, map });
    }
    let owned_graphs: HashSet<GraphId> = maps
        .iter()
        .flat_map(|map| map.graphs.iter().map(|graph| graph.id))
        .collect();
    for graph in repeated(
        maps.iter()
            .flat_map(|map| map.graphs.iter().map(|graph| graph.id)),
    ) {
        refusals.push(Refusal::DuplicateGraphId { space, graph });
    }

    for map in maps {
        map_refusals(
            space,
            map,
            &by_id,
            &repeated_resources,
            &owned_graphs,
            &mut refusals,
        );
    }

    if let Some(default_map) = snapshot.document.default_map
        && !maps.iter().any(|map| map.id == default_map)
    {
        refusals.push(Refusal::UnresolvedDefaultMap {
            space,
            map: default_map,
        });
    }

    for resource in &snapshot.resources {
        for target in resource.resource_references() {
            if target == resource.id {
                refusals.push(Refusal::ReferenceTargetsSelf {
                    space,
                    resource: resource.id,
                });
                continue;
            }
            match by_id.get(&target) {
                None => refusals.push(Refusal::ReferenceTargetMissing {
                    space,
                    resource: resource.id,
                    target,
                }),
                // A repeated id names no one Resource, so no copy's kind judges it.
                Some(_) if repeated_resources.contains(&target) => {}
                // A Target whose kind no listed plugin draws is carried: nothing
                // here can say whether its plugin lets it be one.
                Some(found) => {
                    if listed(found.kind.as_str()).is_some_and(|plugin| !plugin.may_be_target()) {
                        refusals.push(Refusal::ReferenceTargetNotTargetable {
                            space,
                            resource: resource.id,
                            target,
                        });
                    }
                }
            }
        }
    }

    for resource in &snapshot.resources {
        if resource.space_references().contains(&space) {
            refusals.push(Refusal::SpaceReferenceCycle {
                space,
                resource: resource.id,
                target: space,
            });
        }
    }
    refusals
}

fn map_refusals(
    space: SpaceId,
    map: &Map,
    by_id: &HashMap<ResourceId, &Resource>,
    repeated_resources: &HashSet<ResourceId>,
    owned_graphs: &HashSet<GraphId>,
    refusals: &mut Vec<Refusal>,
) {
    // A key naming a missing Resource still joins the members, so an Edge into
    // it is a consequence of that one fault rather than a second.
    let members: HashSet<ResourceId> = map.positions.iter().map(|(id, _)| *id).collect();
    for (resource, placement) in &map.positions {
        let Some(member) = by_id.get(resource) else {
            refusals.push(Refusal::MapMemberMissingResource {
                space,
                map: map.id,
                resource: *resource,
            });
            continue;
        };
        if let Some(content) = &placement.content
            && !repeated_resources.contains(resource)
            && let Some(problem) = map_content_problem(member.plugin(), content)
        {
            refusals.push(Refusal::MapContentInvalid {
                space,
                map: map.id,
                resource: *resource,
                problem,
            });
        }
    }

    for graph in &map.graphs {
        let mut seen = HashSet::with_capacity(graph.edges.len());
        for edge in &graph.edges {
            let ends = EdgeEnds {
                from: edge.from,
                to: edge.to,
            };
            for (end, id) in [(EdgeEnd::From, edge.from), (EdgeEnd::To, edge.to)] {
                if members.contains(&id) {
                    continue;
                }
                refusals.push(if by_id.contains_key(&id) {
                    Refusal::GraphEdgeResourceOutsideMap {
                        space,
                        graph: graph.id,
                        edge: ends,
                        end,
                    }
                } else {
                    Refusal::GraphEdgeMissingResource {
                        space,
                        graph: graph.id,
                        edge: ends,
                        end,
                    }
                });
            }
            if !seen.insert((edge.from, edge.to)) {
                refusals.push(Refusal::DuplicateGraphEdge {
                    space,
                    graph: graph.id,
                    edge: ends,
                });
            }
        }
    }

    if let Some(active) = map.active_graph
        && !map.graphs.iter().any(|graph| graph.id == active)
    {
        refusals.push(if owned_graphs.contains(&active) {
            Refusal::MapActiveGraphOutsideMap {
                space,
                map: map.id,
                graph: active,
            }
        } else {
            Refusal::MapActiveGraphMissing {
                space,
                map: map.id,
                graph: active,
            }
        });
    }
}
