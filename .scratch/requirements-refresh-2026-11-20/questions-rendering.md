# Fresh-reader questions: Rendering

Written during Inventory, before drafting, from the sources at `d461223`. Each expected answer cites the ADR, code or test it rests on, not the requirements doc being refreshed.

## Q1 (ordinary task). An Open Markdown Resource on the canvas has more text than its rect holds. Should I make its body scroll?

**Expected answer.** No. Open content that does not fit its rect is clipped at the rect on the canvas, and Markdown longer than its rect does not scroll there; the author resizes the Resource to see more. Presenting still scrolls long Markdown (that rule is Navigation's). The reason is that the wheel belongs to the canvas, so a scrolling body would be reachable only by its scrollbar.

- Sources: ADR 0149 ("Open content that does not fit its rect is clipped at the rect on the canvas. Markdown longer than its rect does not scroll there"; "A picture still scales down to its rect. Presenting still scrolls long Markdown"), refining ADR 0122.
- Code: `packages/ui/src/markdown-resource-body.css`, `overflow: hidden` on the rendered body.
- Tests: none for Markdown clipping (ADR 0149, Consequences: "clipping Markdown is untested"). The unframed drawn Map half is tested by `packages/app/test/embedded-map.test.ts` › "draws a Resource beyond the containing bounds where it was authored, clipped rather than moved".
- Owner: Rendering RD-5; the wheel rule is RD-67.

## Q2 (crosses into Space and Resources). An Open Mermaid Resource draws an SVG on the canvas. Does that SVG go through the host's Markdown renderer and its sanitiser, and which document owns the rules for its theme and for a source Mermaid cannot draw?

**Expected answer.** It does not go through the Markdown renderer. The Mermaid plugin draws with the Mermaid library itself, fetched on first draw, and inserts the SVG Mermaid answers into its own rect; that is safe because Mermaid passes it through DOMPurify and the plugin sets Mermaid's `strict` security level, with Mermaid's error drawing suppressed. No diagram renderer is added to the Resource API. The theme (Mermaid's `neutral` where the rect's `color-scheme` is light, `dark` where it is dark, a source's own theme kept), the note for a source Mermaid cannot draw and the empty-source note are what the Mermaid Resource draws, owned with the kind by Space and Resources (SR-67); Rendering only says that it is not drawn through the Markdown renderer (RD-6), that its glyph is drawn Closed (RD-9), and that it draws under its Title like Markdown (RD-2).

- Sources: ADR 0158 ("The Mermaid plugin draws with the Mermaid library itself"; "The SVG Mermaid answers is inserted into the plugin's rect"; "A diagram is drawn in the canvas's colour scheme"; Negative: "Do not lower Mermaid's security level below `strict`"), refining ADR 0142.
- Code: `packages/plugin-mermaid/src/mermaid.ts` `MERMAID_SETTINGS` (`securityLevel: 'strict'`, `suppressErrorRendering: true`); `packages/plugin-mermaid/src/view.tsx` `DrawnDiagram` (`dangerouslySetInnerHTML` of the SVG).
- Tests: `packages/plugin-mermaid/test/mermaid-plugin.test.tsx` › "is set up at its `strict` security level, with its error drawing suppressed", "draws its diagram in the canvas’s colour scheme, again when that changes", "draws its kind glyph, named for a screen reader, only while Closed"; `packages/app/e2e/mermaid-resource.spec.ts` › "a Mermaid Resource draws its saved source with Mermaid, in the canvas’s colour scheme".

## Q3 (crosses into UI and build tooling). I am adding the WebKit Playwright project. Which rendering behaviours must also hold there, and may I hide an Edge handle with `display: none` to work around a WebKit difference?

**Expected answer.** Every behaviour `pnpm e2e` tests must hold in WebKit as well as Chromium, so every rendering rule whose evidence is an `app/e2e/` spec is in scope; the Ladle story suite's engine is left to the ticket that adds the project. The WebKit project is not built today: the e2e evidence in the rendering doc was observed in Chromium only. The rule that WebKit is a supported engine is UI's (UI-110). A hidden handle must still use `opacity: 0` or `visibility: hidden`, never `display: none`, because React Flow measures handles and a `display: none` one reports 0×0, so Edges stop attaching.

- Sources: ADR 0157 ("WebKit is a supported engine. CI runs the Playwright end-to-end suite in a WebKit project beside the Chromium one"; Consequences: "Every behaviour `pnpm e2e` tests must hold in WebKit as well as Chromium. Whether the Ladle story suite (ADR 0052) also runs in WebKit is left to the ticket that adds the WebKit project"); ADR 0086 and ADR 0087 for the handle rule.
- Code: `playwright.config.ts` declares the `chromium` and new-space projects and no WebKit one; `.scratch/rust-host/issues/05-webkit-in-ci-and-minimum-systems.md`.
- Tests: `packages/app/e2e/overview.spec.ts` › "anchors stay measurable, so Edges attach where the Resource is".
- Owner: UI-110 (engine floor), Rendering RD-74 (handle hiding) and the Status paragraph (which engine the evidence was observed in).

## Baseline against the existing reading path (before drafting)

- Q1: found. AGENTS.md routes "Open content" to Rendering; RD-5 answers it with ADR 0149 and names the untested Markdown clip.
- Q2: partly found. RD-6 says the SVG is not drawn through the Markdown renderer and points to SR-67, which carries the theme and notes. RD-2 says only that "an Open Markdown Resource draws it under its Title", and RD-9's evidence names no Mermaid test, so a reader cannot tell from Rendering whether the Mermaid Resource draws its Title and glyph as Markdown does. The trace has no row for ADR 0158.
- Q3: partly found. RD-74 answers the handle half. Nothing in Rendering says its e2e evidence is Chromium's alone or points to UI-110; a reader reaches ADR 0157 only by checking ADRs above the marker (0158), where 0157 is below it and so looks incorporated.
