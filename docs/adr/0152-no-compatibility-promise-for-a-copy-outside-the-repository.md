# No compatibility promise for a copy outside the repository

Status: accepted
Date: 2026-11-12
Refines: 0054, 0056
Related: 0117, 0130, 0132

ADR 0054 rolls a format change forward with its fixtures, and ADR 0056 gave the reason that every database, Space directory and generated artifact is derived from the repository, so no byte outlives a reset. Since ADR 0117 an Aggregate directory run with `cube run` is an author's durable copy, kept in its own git repository rather than this one, and ADR 0132 would keep a mounted talk's edits in a browser. Those copies are not derived from this repository, so 0056's reason no longer covers them. The maintainer ruled on 12 November 2026 (ruling Storage S2 in `docs/requirements/DECISIONS.md`).

## The decision

- **The format still rolls forward**, with no versioned reader, transitional key, alias, document migration or compatibility parser, as ADRs 0054 and 0056 decide.
- **The reason is that InfinityCube is unreleased and makes no compatibility promise for any copy outside the repository.** An Aggregate directory is recovered from git or read with the build that wrote it. A browser's stored copy of a mounted talk may be unreadable after a deploy.
- What ADR 0056 decides for the repository itself stands: every database and generated artifact in it is derived, and generated state that disagrees with its generator is fixed at the source.

## Why

- **A directory may be an author's only copy**, so "a reset regenerates it" is not true of it. The rule holds for a different reason, and stating the real one keeps it from being argued away.

## Consequences

- No code changes (Storage ST-36). An author whose directory a new build refuses reads it with the build that wrote it, or recovers it from git.
