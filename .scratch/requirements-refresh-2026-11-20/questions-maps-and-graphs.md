# Fresh-reader questions: Maps and Graphs

Written during Inventory of the 20 November 2026 refresh, before drafting, against source `d461223`. Each expected answer is taken from the accepted ADRs, `DECISIONS.md` and the code and tests at that commit, not from the refreshed doc. Baseline: the reading path before this refresh (`AGENTS.md` task table → `docs/requirements/maps-and-graphs.md` at marker `9e9b094`, ADRs through 0159).

## Q1 (ordinary task). Renaming a Graph to a title with a line break in it

*Task:* "I'm adding a test that renaming a Graph to a two-line title is refused. What code should it expect, and does the code refuse it today?"

*Expected answer:* A Map title and a Graph title are each one non-empty, trimmed line (ADR 0083). A blank rename is refused `graph-title-required` (`map-title-required` for a Map), and the same trimmed title is unchanged. A line break should be refused, but no refusal code is decided for it and neither authoring nor intake refuses it: TypeScript intake reads titles as `z.string().min(1)` (`packages/core/src/schema.ts`), and the Rust intake reads them as a non-empty string only (`crates/intake/src/schema.rs`, `non_empty_string` for the Map and Graph `title` keys), so both intakes also accept an untrimmed or all-space title. Status: **bug: code differs** (MG-8). Evidence: `packages/app/test/space-authoring-operations.test.ts` › "refuses a blank title and treats the stored title with padding as unchanged".

*Baseline (old reading path):* found at MG-8 with the right status; the old evidence named the TypeScript intake only, so a reader would not know the Rust intake shares the gap.

## Q2 (crosses into Storage and hosts). Opening a mapless Space under the Rust CLI

*Task:* "A hand-written Space has no `maps`. I run its directory with `infinity-cube run` and open the Space. Does it get a Map, what is it called, and is anything written to the directory?"

*Expected answer:* Yes. The first working read of a Space with no Map persists a starting Map titled `Map 1` with one Graph, `Graph 1`, in one commit to the store before the Space becomes working; it is a commit by the loader, not an Edit, and places no Resource (ADR 0079, ADR 0080; MG-74). The Rust host's single-Space route runs it (`crates/host/src/http.rs` `load_working_space` and `initialized_snapshot`, ADR 0155), and on a conflict it reloads and accepts the competing initialization or tries again (MG-77). Import does not initialize (`conformance/intake/directory/accepted-space-without-map`). The directory is not written by the opening: it is left byte for byte unchanged until the next Edit's write carries the initialization (`DECISIONS.md` ruling 3; Storage ST-65). Evidence: `crates/host/tests/wire.rs` › `counts_no_edit_for_a_read_that_initializes_a_space`; `crates/host/tests/run.rs` › `leaves_the_directory_unchanged_when_opening_it`, `writes_the_initialization_with_the_next_edit`.

*Baseline (old reading path):* MG-74 and MG-75 give the TypeScript side only; the Rust host's route is missing from MG-75's "Initializes" list, so the reader has to find it in Storage or the code.

## Q3 (crosses into Space and Resources and Navigation). Deleting the Active Graph inside an Open Space Resource

*Task:* "Inside an Open Space Resource, the author deletes the Graph the target Map has saved as its Active Graph. Which Graph does the target Map save, where do Space Resources that selected the deleted Graph go, and does the target's `defaultMap` change?"

*Expected answer:* The saved Active Graph is replaced by the first surviving Graph in list order, and that is saved, in every context, embedded included (`DECISIONS.md` ruling 2, ADR 0040; MG-54). Every Space Resource in any Space selecting the deleted Graph is repointed in the same Edit to that Graph and keeps its framing (ADR 0091; MG-55, MG-56). A drawn Edit leaves the target's `defaultMap` alone (ADR 0116; MG-80 and the table). Status: **bug: code differs** for MG-54 and MG-56: the code prefers the Graph the target Space's own canvas has active on that Map, if it survives (`packages/persistence/test/space-resource-planning.test.ts` › "prefers the named Graph and moves the Active Graph off the deleted one"; `packages/app/test/graph-authoring-commands.test.ts` › "prefers the Active Graph an embedded target shows when it is not the one going"). The last Graph cannot be deleted (MG-53).

*Baseline (old reading path):* found at MG-54–MG-56 and the table, with the right statuses.
