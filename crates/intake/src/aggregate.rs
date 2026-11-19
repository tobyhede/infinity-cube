//! The aggregate's intake (`loadSpaceAggregate`): every Space through its own
//! intake, then the rules only the whole aggregate can answer, a stage at a
//! time, a stage that refuses stopping intake.

use std::borrow::Borrow;
use std::collections::{HashMap, HashSet};

use crate::ids::ResourceId;
use crate::ids::SpaceId;
use crate::model::SpaceSnapshot;
use crate::refusal::{Refusal, Refusals, SelectionProblem};
use crate::space::{Space, load_space, repeated};

/// A complete, validated, Meta-rooted collection of Spaces.
///
/// It exists only as [`load_aggregate`]'s answer (or
/// [`import_aggregate`](crate::import_aggregate)'s), so every one is consistent.
///
/// # Examples
///
/// ```
/// use intake::{AggregateFiles, SpaceId, import_aggregate};
///
/// let meta = "10000000-0000-4000-8000-000000000001";
/// let mut files = AggregateFiles::new();
/// files.insert_file("aggregate.json", format!(r#"{{"version": 1, "metaSpaceId": "{meta}"}}"#));
/// files.insert_file(
///     format!("{meta}/space.json"),
///     format!(r#"{{"version": 1, "id": "{meta}", "title": "Space"}}"#),
/// );
///
/// let aggregate = import_aggregate(files, || unreachable!("every id is written down"))
///     .unwrap()
///     .aggregate;
/// let meta = SpaceId::parse(meta).unwrap();
/// assert_eq!(aggregate.meta_space_id(), meta);
/// assert_eq!(aggregate.spaces().len(), 1);
/// assert!(aggregate.space(meta).is_some());
/// ```
#[derive(Debug, Clone, PartialEq)]
pub struct SpaceAggregate {
    meta_space_id: SpaceId,
    spaces: Vec<Space>,
    by_id: HashMap<SpaceId, usize>,
    held_space_ids: Vec<SpaceId>,
}

impl SpaceAggregate {
    /// The Meta Space.
    #[must_use]
    pub fn meta_space_id(&self) -> SpaceId {
        self.meta_space_id
    }

    /// Its Spaces, in the order they were given.
    #[must_use]
    pub fn spaces(&self) -> &[Space] {
        &self.spaces
    }

    /// The Spaces, owned.
    #[must_use]
    pub fn into_spaces(self) -> Vec<Space> {
        self.spaces
    }

    /// The Space with this id.
    #[must_use]
    pub fn space(&self, id: SpaceId) -> Option<&Space> {
        self.spaces.get(*self.by_id.get(&id)?)
    }

    /// The Spaces no lifetime reference holds that are held rather than
    /// refused, because a Resource of a kind no listed plugin draws may be what
    /// refers to each (ADR 0142). Empty while every kind has its plugin.
    #[must_use]
    pub fn held_space_ids(&self) -> &[SpaceId] {
        &self.held_space_ids
    }

    /// Whether a Resource of a kind no listed plugin draws is among its Spaces'.
    #[must_use]
    pub fn holds_missing_kind(&self) -> bool {
        holds_missing_kind(&self.spaces)
    }

    /// `refusedUnrootedSpaceIds`: of this aggregate's unrooted Spaces, those a
    /// change may not leave unrooted. A Space is held only while a Resource of
    /// a missing kind remains, and only one `already_held` names.
    #[must_use]
    pub fn refused_unrooted_space_ids(
        &self,
        already_held: impl IntoIterator<Item = SpaceId>,
    ) -> Vec<SpaceId> {
        let already: HashSet<SpaceId> = already_held.into_iter().collect();
        self.held_space_ids
            .iter()
            .copied()
            .filter(|id| !already.contains(id))
            .collect()
    }
}

fn holds_missing_kind(spaces: &[Space]) -> bool {
    spaces.iter().any(|space| {
        space
            .snapshot()
            .resources
            .iter()
            .any(|resource| resource.is_missing_kind())
    })
}

/// One Space reference a Resource declares.
#[derive(Debug, Clone, Copy)]
struct SpaceReference {
    space: SpaceId,
    resource: ResourceId,
    target: SpaceId,
    lifetime: bool,
}

/// Every Space reference, by Space in the order given, then by Resource in
/// Title order, then in declared order.
fn declared_references(spaces: &[Space]) -> Vec<SpaceReference> {
    let mut references = Vec::new();
    for space in spaces {
        for resource in space.resources_by_title() {
            let held = resource.lifetime_space_references();
            for target in resource.space_references() {
                references.push(SpaceReference {
                    space: space.id(),
                    resource: resource.id,
                    target,
                    lifetime: held.contains(&target),
                });
            }
        }
    }
    references
}

/// The references that close a cycle: one per back edge of a depth-first walk
/// from each unvisited Space in the order given, following each Space's
/// references in order. A reference to a Space not given is not followed.
fn cycle_references(
    spaces: &[Space],
    index: &HashMap<SpaceId, usize>,
    references: &[SpaceReference],
) -> Vec<SpaceReference> {
    #[derive(Clone, Copy, PartialEq, Eq)]
    enum Visit {
        Unvisited,
        Visiting,
        Visited,
    }
    let mut outgoing: Vec<Vec<SpaceReference>> = vec![Vec::new(); spaces.len()];
    for reference in references {
        if let Some(list) = index
            .get(&reference.space)
            .and_then(|at| outgoing.get_mut(*at))
        {
            list.push(*reference);
        }
    }
    let mut state = vec![Visit::Unvisited; spaces.len()];
    let mut cycles = Vec::new();
    for start in 0..spaces.len() {
        if state.get(start) != Some(&Visit::Unvisited) {
            continue;
        }
        // An explicit stack of (Space, next reference), so a long chain of
        // Spaces cannot exhaust the call stack.
        let mut stack = vec![(start, 0usize)];
        if let Some(slot) = state.get_mut(start) {
            *slot = Visit::Visiting;
        }
        while let Some((current, next)) = stack.last_mut() {
            let current = *current;
            let Some(reference) = outgoing
                .get(current)
                .and_then(|list| list.get(*next))
                .copied()
            else {
                if let Some(slot) = state.get_mut(current) {
                    *slot = Visit::Visited;
                }
                stack.pop();
                continue;
            };
            *next += 1;
            let Some(&target) = index.get(&reference.target) else {
                continue;
            };
            match state.get(target) {
                Some(Visit::Visiting) => cycles.push(reference),
                Some(Visit::Unvisited) => {
                    if let Some(slot) = state.get_mut(target) {
                        *slot = Visit::Visiting;
                    }
                    stack.push((target, 0));
                }
                _ => {}
            }
        }
    }
    cycles
}

/// Load every snapshot through [`load_space`], then check the aggregate:
/// Space ids repeated; Resource ids repeated across Spaces; the Meta Space
/// missing; Space references to Spaces it does not hold; Space Resource
/// selections; Space reference cycles; ordinary Spaces nothing references,
/// held rather than refused while a Resource of a missing kind remains
/// (ADR 0142).
///
/// The snapshots are read, not kept: borrowed ones are not copied, since
/// each Space's intake builds the snapshot it holds from its shape.
///
/// Give the snapshots ascending by Space id, as Import and a commit both do:
/// a repeated Resource is reported in each Space after the first, and the
/// cycle walk starts from each Space, in the order given.
///
/// # Errors
///
/// Returns the refusals of the first stage that refuses: every Space's
/// refusals together, each Space named by its position among `snapshots`
/// ([`Refusals::space_stage`]), or the aggregate stage's.
pub fn load_aggregate(
    meta_space_id: SpaceId,
    snapshots: impl IntoIterator<Item = impl Borrow<SpaceSnapshot>>,
) -> Result<SpaceAggregate, Refusals> {
    let mut spaces = Vec::new();
    let mut refused = Vec::new();
    for (position, snapshot) in snapshots.into_iter().enumerate() {
        match load_space(snapshot) {
            Ok(space) => spaces.push(space),
            Err(refusals) => refused.push((position, refusals)),
        }
    }
    Refusals::check_spaces(refused)?;

    Refusals::check(
        repeated(spaces.iter().map(Space::id))
            .into_iter()
            .map(|space| Refusal::DuplicateSpaceId { space })
            .collect(),
    )?;

    let mut first_space: HashMap<ResourceId, SpaceId> = HashMap::new();
    let mut repeated_resources = Vec::new();
    for space in &spaces {
        for resource in &space.snapshot().resources {
            if first_space.entry(resource.id).or_insert(space.id()) != &space.id() {
                repeated_resources.push(Refusal::DuplicateResourceId {
                    space: space.id(),
                    resource: resource.id,
                });
            }
        }
    }
    Refusals::check(repeated_resources)?;

    let by_id: HashMap<SpaceId, usize> = spaces
        .iter()
        .enumerate()
        .map(|(index, space)| (space.id(), index))
        .collect();
    if !by_id.contains_key(&meta_space_id) {
        return Err(Refusals::from_one(Refusal::MetaSpaceMissing {
            meta: meta_space_id,
        }));
    }

    let references = declared_references(&spaces);
    Refusals::check(
        references
            .iter()
            .filter(|reference| !by_id.contains_key(&reference.target))
            .map(|reference| Refusal::SpaceReferenceMissing {
                space: reference.space,
                resource: reference.resource,
                target: reference.target,
            })
            .collect(),
    )?;

    Refusals::check(selection_refusals(&spaces, &by_id))?;

    Refusals::check(
        cycle_references(&spaces, &by_id, &references)
            .into_iter()
            .map(|reference| Refusal::SpaceReferenceCycle {
                space: reference.space,
                resource: reference.resource,
                target: reference.target,
            })
            .collect(),
    )?;

    let held: HashSet<SpaceId> = references
        .iter()
        .filter(|reference| reference.lifetime)
        .map(|reference| reference.target)
        .collect();
    let unrooted: Vec<SpaceId> = spaces
        .iter()
        .map(Space::id)
        .filter(|id| *id != meta_space_id && !held.contains(id))
        .collect();
    let held_space_ids = if holds_missing_kind(&spaces) {
        unrooted
    } else {
        Refusals::check(
            unrooted
                .into_iter()
                .map(|space| Refusal::OrdinarySpaceUnreferenced { space })
                .collect(),
        )?;
        Vec::new()
    };

    Ok(SpaceAggregate {
        meta_space_id,
        spaces,
        by_id,
        held_space_ids,
    })
}

/// Each Space Resource whose selection does not resolve in the Space it shows.
fn selection_refusals(spaces: &[Space], by_id: &HashMap<SpaceId, usize>) -> Vec<Refusal> {
    let mut refusals = Vec::new();
    for space in spaces {
        for resource in space.resources_by_title() {
            let plugin = resource.plugin();
            for target_id in plugin.space_references(&resource.content) {
                let Some(target) = by_id.get(&target_id).and_then(|index| spaces.get(*index))
                else {
                    continue;
                };
                let Some((map, graph)) = plugin.selection(&resource.content) else {
                    continue;
                };
                let problem = match target.map(map) {
                    None => Some(SelectionProblem::MapMissing { map }),
                    Some(_) if target.graph(graph).is_none() => {
                        Some(SelectionProblem::GraphMissing { graph })
                    }
                    Some(selected) if !selected.graphs.iter().any(|owned| owned.id == graph) => {
                        Some(SelectionProblem::GraphOutsideMap { map, graph })
                    }
                    Some(_) => None,
                };
                if let Some(problem) = problem {
                    refusals.push(Refusal::SpaceResourceSelection {
                        space: space.id(),
                        resource: resource.id,
                        target: target_id,
                        problem,
                    });
                }
            }
        }
    }
    refusals
}
