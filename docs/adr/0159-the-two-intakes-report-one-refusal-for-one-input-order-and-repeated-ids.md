# The two intakes report one refusal for one input: order and repeated ids

Status: accepted
Date: 2026-11-18
Related: 0010, 0020, 0156

ADR 0156 gives each runtime one intake and holds the two to one conformance corpus (`conformance/intake/`), agreeing on the kind of each refusal and where it is. That holds only if an input has one answer. Some did not. Where a Space repeats a Resource id, intake judged Map content and a reference's Target against whichever copy it happened to keep: the TypeScript intake took the last copy in `localeCompare` Title order, the Rust intake the last in file order. The cross-Space cycle walk followed a Space's Resources in `localeCompare` order, so which Resource closed a cycle depended on the host's collation. And `decideCommit` judged a created Space after the stored ones, so its `snapshotIndex` depended on what the commit created rather than on the Space's id. The maintainer decided on 18 November 2026 to fix each answer as below, in both runtimes.

## The decision

- **A Resource id a Space repeats names no one Resource, and the repeat is the one fault.** It is refused once for each id repeated, however many copies hold it, as `duplicate-resource-id`, located at `<space id>/resources/<resource id>.json`, the file Export writes for it, whatever its files are named. Nothing else within that Space is judged against either copy: Map content kept for the id is judged by no plugin (Maps and Graphs MG-86), and a Resource reference to it is not judged by its Target's kind (Space and Resources SR-30). The id is still one the Space holds, so a placement, an Edge endpoint or a reference naming it is not refused as naming a missing Resource. An id repeated across Spaces is refused in each Space after the first, Spaces taken ascending by Space id (SR-6).
- **Where an answer depends on order, the order comes from the input's ids and Titles, compared by UTF-16 code unit, never by locale or by the order files or changes arrive in.**
  - The cross-Space cycle walk starts from each unvisited Space ascending by Space id and follows a Space's Resources by Title, then id, compared by code unit, so `"Zeta"` comes before `"alpha"`. A Space's own Resource order, which grid layout reads, stays SR-10's.
  - A commit's candidate aggregate is judged ascending by Space id, created Spaces among the stored ones. An `invalid-space-snapshot` refusal's `snapshotIndex`, the order of a `duplicate-resource-id` refusal's `spaceIds` and the Resource a cross-Space cycle is reported at follow that order, so a commit with several defects is refused the same way whatever order its changes list them in.

The corpus README (`conformance/intake/README.md`) states each rule as a runner applies it, with a case for each.

## Why

- **Two intakes can agree only on an answer the input decides.** ADR 0156 already decides that the intakes agree on kind and location and that one corpus holds them to it; it does not decide which refusal, and where, when an input admits several. An answer that turns on which copy of a repeated id survived an index, on a collation table or on the order of a change list is one two implementations will choose differently, and the corpus cannot state it.
- **The same is owed to one runtime on two machines.** A `localeCompare` order is the host's ICU data; the same directory could be refused at a different Resource on another machine.

## Rejected

- **Judging a repeated id against one chosen copy** (the first or last in file order, or in Title order). It is one more ordering rule both runtimes must reproduce, and the refusals it adds describe a Resource the id does not name: the author has one fault to fix, the repeat.
- **Judging a repeated id against every copy.** One fault would be reported as several, and how many would depend on the copies' kinds.
- **Locale-aware ordering for the cycle walk.** It is what a reader of Titles expects, but Rust has no `localeCompare`, and matching ICU's collation by hand is an approximation with exceptions of its own. Code unit order is what JavaScript's `<` gives and Rust reproduces exactly.
- **Judging created Spaces after the stored ones, in the commit's order.** Simpler to build, but a refusal's `snapshotIndex` would then differ from the position an ascending read gives the same Space, and from one commit to the next for the same aggregate.

## Consequences

- Space and Resources SR-6 and SR-30, Maps and Graphs MG-86, and Storage ST-117 restate these rules and cite this ADR.
- A second implementation of the commit decision judges in the same order; the corpus's commit cases are how it is held to it.
