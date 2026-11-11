# 10 — Retire the shared frame and the core fields

Status: ready-for-agent

**Blocked by:** 07 — The Space plugin; 08 — Creation through the API; 09 — The default plugin.

**What to build:** delete what every plugin has made unused: Open and expand (`open-and-expand.tsx`, `SnapshotEdit.openAndExpand`, `opened-resource-to-fit`, its key binding and shortcut sheet row), `opensToFit`, `CanvasResource`, `ResourceDisplay`'s `editing` arm, `ResourceContentEdit`, `KindView`'s `canvas` and `presented`, the fallback paths from `02`, the `kinds/` halves, and the Map entry's `open`. In the core, `canOpen`, `takesOpen`, the `opened-resource` and `closed-resource` Edits and the `open-requires-content` refusal go. The entry's `shape`, `takesResourceShape` and `shape-not-taken` went in `02`. A Map entry is `{ x, y, size?, content? }`.

**Roll forward:** `packages/app/stories/`, `design-system-inventory.ts`, the structural guards that name the frame (`kind-stylesheet-order`, `kind-css-selectors`, `kind-ids-in-modules`, `KIND_FEATURE_FILES`), `test/e2e/` and `packages/app/e2e/graph.ts`, `docs/agents/ui.md`, `rendering.md` and `authoring-refusal-cascade.md`, AGENTS.md's ADR 0128 and 0142 entries, and `maps-and-graphs.md`'s "Accepted, not built" entry. Domain vocabulary moves to Resource plugin in a separate rename commit.

**Acceptance:**

- `CI passed` is green with every required job, including the PostgreSQL and SQLite restart proofs.
- Nothing outside a plugin package names a Resource kind, bar what `kind-sites.md` still keeps with a reason.

## Decisions

- **Already gone before this change**, checked against the code: the Map entry's `shape`, `opensToFit`, `takesResourceShape`, the `shape-not-taken` refusal, `ResourceContentEdit` and `ResourceDisplay`'s `editing` arm (issues 05 and 07). `drawsKind` was no longer exported from core's index. Nothing to remove for them.
- **Removed here:** the Map entry's `open` (a Map entry is `{ x, y, size?, content? }`, strict, so a stored `open` is refused by the schema rather than by a refusal code); `resourceOpen`, `takesOpen`, `drawnByPlugin`, `keepsMapContent`, `resourceDrawnByPlugin` and `canOpen`; the `opened-resource`, `closed-resource` and `opened-resource-to-fit` completions and `SnapshotEdit.open`, `close` and `openAndExpand`; the `open-requires-content` and `map-content-not-kept` refusals (intake, Space Authoring, the HTTP protocol and their messages), so the wrong `open-requires-content` text survives nowhere; Open and expand (`open-and-expand.tsx`, its command, key binding, shortcut sheet row, rail item and icon); the canvas `OPEN_RESOURCE` command and its Enter binding; `CanvasResource`, `resource-display.ts` (`ResourceDisplay`, `CLOSED_DISPLAY`), `ResourceRail` and `resource-rail.css`; `KindView`'s `canvas` and `presented`, and the ui registry's `canvasContent`/`presentedContent`; the node data's `display`, `open`, `takesOpen` and `onOpenChange`; `availability.editResourceBody`, which nothing read once the frame's body editor was gone; and the frame's dead CSS (`.canvas-resource__body`, `__content`, `__rail` and their Open/Closed padding rules).
- **`kinds/` halves kept.** Each package's `kinds/` module is now a thin registration of its plugin (names, glyph, bare operations, decoration) read through `kinds/registry.ts`; they hold nothing the frame used, and collapsing them into the plugin lists is a separate change.
- **`resolveContent` and `resolveResourceContent` kept**: the projection reads them for the content facts (`authorsContent`, `embedsMap`) and the Notes window draws from the resolved content.
- **The Notes window's `PresentedResource`** draws the Title and then the plugin's read-only content for any resolved kind (`PresentedPluginContent`), replacing `KindView.presented`. Full View and the Stage use `PresentedPluginResource` alone.
- **Full View's Enter.** With no Open, "Open on Canvas" and `FULL_VIEW_KEYS.openOnCanvas` are gone, so Enter in Full View does nothing; Space and Escape leave. The canvas's accessible description drops Enter and Shift+Enter.
- **`data-open` on the host frame and the node is gone**; a plugin's own `data-open` inside `.canvas-resource__plugin` is what tests read.
- **The New Resource ghost** is a `PluginResource` drawn read-only from the default kind's new document.
- **The Reference dotted border** stays the canvas's one per-kind stylesheet, imported by `PluginResource` after `canvas-resource.css`; `kind-stylesheet-order` now names `PluginResource.tsx` as its surface.
- **`CanvasResourceState` and `CANVAS_RESOURCE_DRAG_TILT_DEGREES` keep their names**, now exported from `PluginResource.tsx`, because the `canvas-resource` CSS namespace they describe is unchanged.
- **Embedded nodes** stack one above their parent (`zIndex + 1`) rather than above an Open frame's `OPEN_RESOURCE_Z_INDEX`, which stays for the Space Resource a Map is embedded in.
- **`visibleCanvasCap`** (the cap on a plugin's size hint) moved to `visible-canvas-cap.ts`, the one survivor of `open-and-expand.tsx`.
- **The Title ladder's ceiling test** now measures the room a plugin leaves a Closed Title (the plugins' 30px band and 8px foot) instead of the frame's rail and body padding.
- **Vocabulary**, in its own rename commit: core's `KindModule` is `PluginModule` (`kinds/plugin-module.ts`, the registry's `PLUGIN_MODULES`), and ui's `KindView` is `PluginListing` (`kinds/plugin-listing.ts`), named for what it now holds: a plugin's names, glyph and bare operations as lists show them. `PluginView` (resource-api) and `PluginEntry` (ui) were taken. `KindId`, `KindFlags`, `defineKind` and the `kinds/` directories keep their names: a Resource kind is still the glossary's word for what names the plugin.
- **Ladle specs that held the frame's geometry**: `canvas-resource-exposes-kind-and-keyboard-actions` asserted an Open Resource's Title kept its Closed place at the foot of the rect, which was `CanvasResource`'s; the Markdown plugin draws an Open Title at the top, so the spec now holds only the left inset and padding. The laddered Title spec held the field beside `.resource-rail`, which is gone; it now holds the field inside the Resource's border, and its ceiling stays held by `canvas-resource-title-ladder.test.ts`.
- **Not touched**: who owns a Space Resource's controls (a separate thread), and the plugin skills, whose text stays true (an `"open"` key on a placement is still refused), so no manifest bump.
