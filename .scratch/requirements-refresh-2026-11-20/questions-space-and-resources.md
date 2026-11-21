# Fresh-reader questions: Space and Resources

Written before drafting, from the sources at `d461223`. A reader starts at `AGENTS.md` and follows its pointers; the expected answers below are withheld from them.

## Q1 (ordinary task). Add a bundled Resource kind

"I want to add a new bundled Resource kind whose content is a CSV file. What must the change contain, and what may the plugin not do?"

Expected answer:

- One plugin package with a domain half (kind, content and Map content schemas, Target and creation facts, no React and no view) and a view half, both reaching only the Resource API (`@project/resource-api`). Sources: ADR 0142; SR-20. Evidence: `test/unit/resource-plugin-import-restrictions.test.ts` › "keeps %s out of a plugin’s domain half".
- One line in each half of `packages/plugins` (`PLUGINS`, `PLUGIN_VIEWS`); the position in that list is the order every choice among kinds is offered in; nothing else imports the plugin. Sources: ADR 0142; SR-15. Evidence: `core/test/plugin-kind.test.ts` › "lists every plugin this build draws"; `test/unit/plugin-list-imports.test.ts`.
- In the same change, the plugin's content and Map content rules as a Rust module in `crates/intake/src/plugins/` and one entry in its `PLUGINS`, with corpus cases for both intakes. Sources: ADR 0156 (accepted 2026-11-18); SR-15. Evidence: `crates/intake/src/plugins/mod.rs` › `lists_the_plugins_in_the_typescript_lists_order` (asserts the six kinds in the TypeScript list's order).
- A bare kind id (letters, digits, hyphens), never a media type (SR-17); the file is an asset named by its hash, and the plugin declares the media types it accepts for creation from dropped or pasted data (SR-19, SR-21 by analogy; storage ST-31, ST-34 for the extension table).
- The plugin never writes a position, size or Edge (SR-18).

Baseline (existing reading path, self-run by the topic agent, not independent): found. `AGENTS.md` routes "Add a Resource kind" to this doc and Rendering; SR-15 already names the Rust module (added with ADR 0156 before acceptance); SR-15's evidence names no Rust test.

## Q2 (crosses into Storage and Maps and Graphs). A repeated Resource id

"A Space directory holds two Resource files with the same `id`, under different file names, and a Reference Resource whose Target is that id. What does `pnpm cube check` report, located where, and does the Rust CLI agree?"

Expected answer:

- One `duplicate-resource-id` refusal for the repeated id, however many copies, located at `<space id>/resources/<resource id>.json`, the file Export writes for it, whatever the files are named. Sources: ADR 0159; SR-6. Evidence: `graph/test/intake-location.test.ts` › "locates a repeated Resource id in loadSpace at the file Export writes, whatever its files are named".
- The Reference is not judged by its Target's kind and is not refused as naming a missing Resource; Map content kept for the id is judged by no plugin (MG-86). Sources: ADR 0159; SR-30. Evidence: `graph/test/space-intake.test.ts` › "judges no Target kind for a reference to it, refusing only the repeated id"; corpus case `conformance/intake/directory/duplicate-resource-id-reference-target`.
- The two runtimes agree on kind and location, not words, because the corpus runs against both (ADR 0156; storage ST-117, ST-118).

Baseline: found in SR-6 and SR-30.

## Q3 (crosses into Maps and Graphs and Rendering). A Mermaid source that themes itself

"A Mermaid Resource's source sets `theme: forest` in its frontmatter, and the canvas is in dark mode. What does it draw? And if the Mermaid library is slow to fetch when the author presses Open, is Open held back?"

Expected answer:

- It draws in the source's own theme in either colour scheme; the canvas's theme (`neutral` light, `dark` dark) is the default only for a source that chooses none; the plugin adds nothing to the source, setting the canvas's theme in Mermaid's page-level settings before each draw. Sources: ADR 0158 (as amended 17–18 November 2026); SR-67. Evidence: `app/e2e/mermaid-resource.spec.ts` › "a Mermaid source that chooses its own theme keeps it in either colour scheme"; `plugin-mermaid/test/mermaid-plugin.test.tsx` › "sets Mermaid’s theme for the canvas’s colour scheme beside its other settings".
- Open is not held back: Opening carries a size hint measured at the reading width, or none where Mermaid has not drawn within the load wait that bounds Opening. Sources: ADR 0158; owned by maps-and-graphs.md MG-27 (and MG-88 for how a hint is applied), not this doc.

Baseline: theme found in SR-67; the size hint is in MG-27, which SR-67 does not point to, so a reader starting here must find it through the "Not here" table (Maps entries: Open).
