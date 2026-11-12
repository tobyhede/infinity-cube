# Trace: Rendering

For audit only. Every source rule that feeds `../rendering.md` appears exactly once in §1 or §2, with one of five dispositions:
- **→ RD-n**: kept.
- **folded → RD-n**: the source restates or implies a kept rule.
- **dropped**: with the reason.
- **sent → DOC**: it belongs to another doc.
- **→ removed (drafting rule 6)**: presentation, not a requirement.

Where an ADR feeds RD only in part, only the parts the mapping tables send to RD are listed; the rest are traced by the doc named. §3 groups the sends by receiving doc. §3a lists every item other traces send here. §4 lists code-only rules. §5 holds code notes.

Abbreviations:
- "rN" is the Nth rule of an ADR as numbered in the mapping tables (`map-*.md`); where a table gives no numbers, rules are named by their first words.
- "R" ids are the old contract `docs/adr/archive/agent-guides/maps-and-graphs.md`. "G§" is the old guide `docs/adr/archive/agent-guides/rendering.md`, by section and bullet.
- "DEC n" is a ruling in `../DECISIONS.md`.
- Docs: SR space-and-resources.md, MG maps-and-graphs.md, ED editing.md, ST storage.md, UI ui.md, NV navigation.md, GL `CONTEXT.md`, PROC process docs (AGENTS.md, workflow.md, anti-slop.md, build-tooling.md).

The rule ids in `../rendering.md` are append-only from this version on.

## 1. ADRs

| Source | Disposition |
|---|---|
| 0002 r1 a Map is distinct from how it is drawn; the drawing is no domain entity | folded → "What the canvas reads" (the canvas stores nothing) and RD-71 |
| 0002 r2 the seam between arranging and rendering is kept in code | folded → RD-71. The strategy seam itself is MG-68–MG-70 |
| 0002 several layouts and views; ELK presentation view | dropped: superseded (a Map is the only canvas context; no ELK) |
| 0003 r1 Graphs independent, may order a pair oppositely | sent → MG (MG-36) |
| 0003 r2 no code assumes one global order | folded → RD-32 |
| 0003 r3 drawing several Graphs must cope with conflicting orders | → RD-32 (lanes RD-37 are how pairs are drawn) |
| 0006s Closed Resource draws its Title, not content | → RD-1 |
| 0006s Closed Size a constant, not measured | sent → MG (MG-22). Declared geometry folded → RD-72 |
| 0006s Open one verb across kinds | sent → UI, MG |
| 0018 r1 new Space contents | sent → SR (via MG trace) |
| 0018 r2 the first Resource reads as centred | → RD-62 (stored at the origin; the opening fit centres it, audit-facts) |
| 0018 r3 empty repository starts from a new Space | sent → ST |
| 0024 presenting traverses; no deck; no `isLinear`; revisits | sent → NV |
| 0028 / R29 activation is emphasis, not filtering; every Graph drawn | → RD-29. Activation as navigation sent → NV; what writes `activeGraph` is MG (DEC 1) |
| 0033 four side handles; drag to a Resource | → RD-50 |
| 0033 Active Graph receives the Edge | sent → MG (MG-62) |
| 0033 handles coloured as the Active Graph | → RD-51 |
| 0033 route-less Space uses first palette colour / mints `Route 1` | dropped: every Map has a Graph (MG-34). The first-slot fallback survives as code → RD-51 |
| 0033 source handles on hovered or selected Resource | → RD-52 |
| 0033 seeking targets on every Resource for the whole drag | dropped: replaced by 0090 (→ RD-53) |
| 0033 self-Edges accepted | folded → RD-50, RD-53 |
| 0033 preview in Active Graph colour with a head | → RD-54 |
| 0033 on success the target becomes selected | sent → UI (per MG trace §3) |
| 0033 Edge rendering endpoints are not permanent controls | folded → RD-47 (no endpoint handles) |
| 0033 side is interaction geometry; Edge stores `{from,to}` | folded → RD-35, RD-50 |
| 0033 empty drop cancels; Option/Alt previews and creates | gesture and preview → RD-55. The Edit sent → MG (MG-63); the modifier key sent → UI |
| 0033 cancelled gesture changes nothing | folded → RD-55, RD-56 |
| 0033 Algorithmic View conversion; exact duplicate is a no-op | dropped: no Algorithmic View (MG); duplicate refused (DEC C3, MG-61) |
| 0035 r2 render adapter installs completed placement, then reports a completed fact | sent → ED (code note §5) |
| 0035 r8 React Flow adapter owns pointer attempts, transient node state, measurements, visual selection | → RD-75. "First Graph id minted only when its Edit succeeds" dropped: every Map has a Graph |
| 0035 r1, r3–7, r9 | traced by ED, NV |
| 0036 r1 click selects | sent → UI |
| 0036 r2 no pointer gesture on the body Opens | sent → UI |
| 0036 r3 double-click zoom off for the whole canvas | → RD-66 |
| 0036 r4 never wire click or double-click to Open | sent → UI |
| 0042 r1 drafts stay local to their surface | sent → ED |
| 0042 r8 every draft owner cancels on replacement | general rule sent → ED. The Edge gesture's own cancel triggers → RD-56 |
| 0042 r11 every new target-bound interaction handles replacement | sent → ED, PROC |
| 0042 other rules | traced by ED, NV |
| 0043 r1 never chain work on a camera Promise; sequence on the effect's timer | → RD-68 |
| 0043 r2 never `.catch` a camera Promise | folded → RD-68 |
| 0043 r3 `fitView` before `panZoom` is a caller ordering error | folded → RD-68 (caller's sequencing). Kept as a code note §5 |
| 0043 r4 re-verify on a pin move | → RD-70 |
| 0043 split presentation move timer | dropped: presenting no longer moves the canvas camera (0123) |
| 0047, 0050, 0067 UI foundation | sent → UI, PROC |
| 0048 surface decides commit and Escape | sent → UI |
| 0057 r3 application words codes at the conducting surface | sent → UI, ED |
| 0063 r2–5 CodeMirror behind `MarkdownSourceEditor`, key policy, no chrome, lazy | sent → UI (r1 to SR) |
| 0064 r1 Open draws content on the Resource where it sits; no covering surface; several Open | → RD-2 |
| 0064 r2 Open is authored per entry | sent → MG |
| 0064 r3, r4, r6, r7 Open/Edit/Save/Cancel controls, exits, one content edit | sent → UI |
| 0064 r5 Open Markdown via the shared sanitised renderer; editing swaps in the editor | renderer → RD-6. Editor sent → UI |
| 0064 r8 no `nowheel`, no 16:9, the camera does not follow | → RD-67 (its Edit exception is RD-61's wheel, DEC Rendering C1); no aspect constraint folded → RD-2; camera → RD-65 (RD-3 points to it) |
| 0064 r9 one Resource component, no second one for Open; kinds fill the content region | → RD-2 |
| 0064 derived displacement on Open | dropped: superseded by 0122 (only Resize displaces, MG-26) |
| 0065 Title one-activation control, F2, focus | sent → UI |
| 0068 r9 Opening a Space Resource embeds its selected Map | drawing → RD-59. Enter and new tab sent → NV |
| 0068 r19 an Entered Space has its own React Flow instance and camera | → RD-69 |
| 0068 other rules | traced by SR, NV, ED, MG |
| 0070 Target chosen once, never retargeted; ordinary Resource otherwise | sent → SR |
| 0070 Open Reference keeps its own Title, draws Target content read-only (single hop) | → RD-11 |
| 0070 Markdown Target drawn with no source editor | drawing folded → RD-11. No editor control sent → UI |
| 0070 Space Resource Target: draws content, cannot change its selection | sent → SR |
| 0070 renders through the Target kind's renderer, no Reference-specific renderer | folded → RD-11 |
| 0070 Close and Resize normal; Jump to Target | sent → MG, NV (Jump to Target not built) |
| 0073 Resource toolbar (role, roving tabindex, groups, order, focusable disabled) | sent → UI |
| 0082 command surface obligations | sent → UI; "selecting is navigation" sent → NV |
| 0083 Title Lines stored as one string; roles; `titleLines`/`titleName` | data sent → SR |
| 0083 the Resource draws the ladder, Open or Closed | → RD-12, RD-13 |
| 0083 lists and accessible names show the name; heading named by its lines; control wraps heading | sent → UI |
| 0083 search filters on the whole Title | sent → UI |
| 0083 an authored break is not a wrapped break; wrap within role; clamp counts visual lines per role | → RD-14 |
| 0083 a Title never resizes a Resource; clamped | → RD-15 |
| 0083 normalization, refusal code, multiline only on Resources, Reference default Title | sent → SR (Reference Title: 0089 wins, audit-facts) |
| 0083 Enter, Shift+Enter, Escape; field grows | sent → UI |
| 0084 a live resize previews only its own rect | → RD-57 |
| 0084 a drag authors the drop exactly; no `move` draft; dragged Resource displaces nobody | folded → RD-58, which points to MG-21 and MG-83 (MG-26 holds displacement) |
| 0084 other rules | traced by MG |
| 0086 only `positionedStrategy` at render; Auto-arrange; no routed output; grid stays; elkjs | sent → MG (MG-68–MG-71). "Nothing routes an Edge" → RD-32 |
| 0086 handle ids distinguishable per Resource per side | → RD-73 |
| 0086 hide a handle with opacity or visibility, never `display:none` | → RD-74 |
| 0086 declared geometry, never re-measured; no `useUpdateNodeInternals` | → RD-72 |
| 0086 `toNode` and the DOM together answer "empty canvas" | folded → RD-55 |
| 0086 per-Graph anchors spread evenly down the box | dropped: superseded by 0087 (four anchors) |
| 0087 four anchors, one per side, same as handles | → RD-33 |
| 0087 attaches to the facing side, from current positions; nothing stored | → RD-35 (rule RD-34) |
| 0087 per-Graph `::in`/`::out` family gone | dropped: describes a removal |
| 0087 anchors always render; hidden by opacity | folded → RD-33, RD-74 |
| 0087 anchor and affordance are separate layers | folded → RD-33, RD-52 |
| 0087 side chosen in the Edge component from live positions; rule pure | folded → RD-35; siting is a code note §5 |
| 0087 four fixed anchors, not a sliding point | folded → RD-33 |
| 0087 self-Edge gets a fixed loop | → RD-36 |
| 0087 `ConnectionMode` unchanged | dropped: no requirement |
| 0087 several Graphs on one pair draw over one another (accepted cost) | dropped: superseded by 0100 (lanes) |
| 0090 seeking handles only within proximity and eligible | → RD-53 |
| 0090 proximity 80, distance to bounds, 0 over body | folded → RD-53 |
| 0090 ineligible: no handles, not `isConnectableEnd` | folded → RD-53 |
| 0090 `isValidConnection` gates release | sent → MG (MG-59) |
| 0090 self-Edges legal; source eligible when near | folded → RD-53 |
| 0090 anchors still render on every Resource | folded → RD-33 |
| 0090 reconnect drag (sources when a `from` end moves) | dropped: there is no reconnection (MG-67, RD-47) |
| 0100 each Edge sharing a pair in its own lane, 8 apart | → RD-37; the spacing → removed (drafting rule 6) |
| 0100 Active Graph centred and connects; both directions split the centre | → RD-38 |
| 0100 other Graphs below (right when stacked), one spacing further each | → RD-39 |
| 0100 trim a fifth at each end, along the curve, in geometry | → RD-40; the fraction and its measure → removed (drafting rule 6) |
| 0100 only the connecting Edge carries an arrowhead | dropped: superseded by 0105 (→ RD-43) |
| 0100 non-active stops short even alone; with no Active Graph nothing stops short | folded → RD-40 |
| 0100 lanes parallel, never fanned | folded → RD-37 |
| 0100 lanes decided in the projection; activation moves lanes; sign is the screen's; drag carries lanes | → RD-39 (siting is a code note §5) |
| 0100 Active Graph painted last; others recede by opacity, narrower stroke | folded → RD-29; opacity and stroke width → removed (drafting rule 6) |
| 0100 lane as a translate of the anchors | dropped: superseded by 0103, except as the fallback (→ RD-41) |
| 0102 commands in `NodeToolbar`, when drawn, click selects first, right-click menu, keyboard reach (not built, DEC 6) | sent → UI |
| 0102 kind glyph on the Resource at top-right; Open draws none | → RD-9; the corner → removed (drafting rule 6) |
| 0102 band shrinks to the glyph's room | folded → RD-9 (code note §5) |
| 0102 without an adapter the toolbar draws in the band | sent → UI |
| 0102 `@project/ui` names no React Flow type | sent → UI |
| 0103 lane is the lone curve offset along its normal | → RD-41 |
| 0103 offset drawn over the pair's span; bridges outside | folded → RD-41 |
| 0103 span per pair, so lanes never cross | folded → RD-41 |
| 0103 no span: whole pair falls back to the translate | folded → RD-41 |
| 0103 lanes parallel, never fanned | folded → RD-37 |
| 0103 ends and heads where a translate puts them; sign convention; label at offset midpoint; trim along the lane | → RD-42 (trim folded → RD-40; sign folded → RD-39) |
| 0103 self-Edge lanes unchanged | folded → RD-42 |
| 0104 render id `${graphId}::${from}::${to}`; Title no part of identity | → RD-31 |
| 0104 Edge Title, `titleHidden`, refusals, no per-Edge style, no reconnect | sent → MG (MG-57, MG-64–MG-67); "Title not Label" sent → GL |
| 0104 what a long Title does on a short Edge is the canvas's | → RD-46 |
| 0105 every Edge draws its Graph's head shape at its `to` end | → RD-43 |
| 0105 no `none`, no tail, no per-Edge override; optional, `arrow` default | sent → MG (MG-50) |
| 0105 every drawn Edge carries it, stop-short included, at the Edge's opacity | folded → RD-43; the opacity → removed (drafting rule 6) |
| 0105 four shapes, distinct at small zoom, drawn from one glyph in `@project/ui` | → RD-45 |
| 0105 markers once per canvas in hidden `<defs>`, keyed by Graph id, sized in stroke widths | → RD-44; the sizing → removed (drafting rule 6) |
| 0105 Graph menu Shape… | sent → UI |
| 0105 legend mark beside every Graph title (key, Dock, Open Space Resource) | → RD-49 |
| 0105 connection preview draws the joined Graph's head shape and colour | → RD-54 |
| 0105 vocabulary (tail, head, head shape, marker) | sent → GL |
| 0106 kind, URL, store, replace, Title as text alternative, creation | sent → SR, ST |
| 0106 Open, its content is its image | folded → RD-4 |
| 0106 natural size measured on set; first Open sizes from it | dropped: first-Open sizing superseded by 0122. The recorded natural size has no reader (audit-facts); sent → SR |
| 0106 an image that will not load is not a refusal; still Opens | drawing → RD-7; validity sent → SR (SR-27, pointed to from RD-7) |
| 0110 axis = larger gap; side = sign of centre difference on that axis | → RD-34 |
| 0110 self-Edge takes its fixed loop (Right to Top) first | → RD-36 |
| 0110 centre-vector rule rejected | dropped: rejected alternative |
| 0112 a drawn Map offers every command; policy; occurrences; holds; notices; navigation held; never contains its own Map | sent → SR, NV, ED, UI |
| 0112 per drawn Map: the render adapter; occurrence names ids | → RD-31, RD-59 |
| 0112 recorded difference: one camera | → RD-59 |
| 0112 recorded difference: a cross-drawing connection is refused | sent → MG (MG-59), UI (wording) |
| 0114 canvas facts follow resolved content (embeds a Map, content area) | → RD-77 |
| 0114 first-Open size and resize floor from content | dropped: superseded by 0122 |
| 0114 a Reference's kind decides only content actions (none) | sent → SR, UI |
| 0114 kind glyph decided by stored kind | → RD-9 |
| 0121 set, storage, only Ur, optional, Remove forgets | sent → MG (MG-29–MG-31) |
| 0121 drawn at the rect; changes no rect; proportional fill; pill half-circles; side midpoints | → RD-16 (rect rule MG-32) |
| 0121 Title centred in the inscribed rectangle, clamped | → RD-17; the centring → removed (drafting rule 6) |
| 0121 selection ring follows the outline | → removed (drafting rule 6) |
| 0121 Ur Resource draws no glyph | folded → RD-9 |
| 0121 Shape drawn Open and Closed alike | dropped as stated: an Ur Resource is never Open (MG-28). "Drawn at every size" → RD-16 |
| 0121 resize control at the rect's bottom-right | sent → UI |
| 0121 presented Resource is the rectangle | sent → NV |
| 0121 Shape choice on the rail (`ChoiceMenu`) | sent → UI |
| 0121 embedded Map draws Shapes | → RD-19 |
| 0122 entry shape, Resize only, one floor, `open` optional, only Resize displaces | sent → MG |
| 0122 content adapts: document scrolls, picture scales down, embedded Map fits | picture → RD-4. Document and embedded Map → RD-5: DEC Rendering C1 clips both on the canvas and places an unframed drawn Map at authored scale instead of fitting it (the placement moved there from RD-60) |
| 0122 resize control on the selected Resource; one control; no keyboard resize | sent → UI |
| 0122 a selected non-rectangle Shape draws a thin frame at its rect | → RD-18 |
| 0123 Stage, canvas inert while presenting, no presenting camera | sent → NV |
| 0129 Presentation Notes | sent → NV |
| 0135 in a Graph = Edge endpoint | sent → MG (MG-33) |
| 0135 border is the Graph's colour | → RD-23 |
| 0135 recede: solid face, border half-mixed, Title/rail/content half opacity; interactive | → RD-24; the border mix and half opacity → removed (drafting rule 6) |
| 0135 full strength while hovered, focused, selected, edited, offered as a connection end | → RD-25 |
| 0135 nothing recedes while the Active Graph has no Edges | → RD-26 |
| 0135 only border and outline take colour; handles and underline in Active colour | handles → RD-51; the rest (RD-27) → removed (drafting rule 6) |
| 0135 change of Active Graph fades on hover timing | RD-28 → removed (drafting rule 6); conflict C2 closed |
| 0135 every drawn Map by its own Active Graph; Stage unchanged | → RD-81; Stage sent → NV |

## 2. Guides and the old contract

| Source | Disposition |
|---|---|
| G§Edge Authoring b1: four handles coloured as the Active Graph; source reveal on hover or selection, withheld while dragged or resized | → RD-50, RD-51, RD-52 |
| G§b1 resize control only on a selected Resource; frame on a selected Shape | control sent → UI; frame → RD-18 |
| G§b1 seeking handles: 80 units and `edgeEligibility` | → RD-53 |
| G§b1 Connect to Resource, keyboard form, `connectChoices`, continues selected and focused | sent → UI |
| G§b1 every gesture writes to the Active Graph; `map-active-graph-required` | sent → MG (MG-62) |
| G§b1 Alt empty-drop create-and-connect | → RD-55 |
| G§b1 no reconnection; `edgesReconnectable={false}`; no endpoint anchors | → RD-47 |
| G§b1 Add Resource, `C`, Backspace/Delete, Delete from Space | sent → UI |
| G§b1 four handles are anchors everywhere, affordances only where authorable | folded → RD-33 |
| G§b2 Edge Authoring module, render adapter authority, selection folding, Edge subject is the domain triple, continuation spent a commit later, commands context, delete keys, `queued` | Edge subject and id → RD-31. Rest sent → ED, NV, UI; code notes §5 |
| G§b3 Edge chrome: `EdgeTitle`, `EdgeToolbar`, reveal, keyboard, legend in `GraphHud` | Title drawing → RD-46, RD-47; key → RD-48. Toolbar, reveal, keyboard and Title editing sent → UI (UI-78–UI-82, pointed to from the Edge Titles section) |
| G§b4 structured refusal across Edge Authoring | sent → ED, UI |
| G§b5 0042 draft invalidation (Map, Active Graph, epoch, subject) | Edge gesture → RD-56; epoch sent → ED |
| G§b6 controls reach `CanvasResource` only with their operation | sent → UI (code note §5) |
| G§b7 content resolves once through the kinds; display `closed`/`open`/`editing`; a drawn Resource names nothing outside itself; glyph on every kind but Ur | resolution sent → SR; drawing → RD-11, RD-77; "names nothing outside itself" → RD-78; glyph → RD-9, RD-9 |
| G§b8–b10 drag lean as a rigid motion; Edges follow; clip turns with it; `nodeLookup`; angle written once | the lean → removed (drafting rule 6); the rigid motion and Edges following → RD-21 (code only). Mechanics are code notes §5 |
| G§b11 resizing is one canvas draft; preview only the resizing Resource; no `move` draft; floor; no snap | preview → RD-57; drag → RD-58; floor sent → UI (MG-82); displacement sent → MG |
| G§Strategy b1–b3 strategy contract in `graph`; `Placement` construction closed; `canvasProjection` pure | sent → MG (MG-68–MG-70); code notes §5 |
| G§Handle b1 four anchors = handles; no per-Graph family | → RD-33 |
| G§Handle b2 side chosen in the Edge component, not the projection | folded → RD-35 (code note §5) |
| G§Handle b3 gap axis, centre-difference side | → RD-34 |
| G§Handle b4 self-Edge first | → RD-36 |
| G§Handle b5 an Edge names no handle; all four of each role on every Resource; embedded clip slack | → RD-33; slack is a code note §5 |
| G§Handle b6 anchor is not an affordance; `data-connection-authoring` | folded → RD-52 |
| G§Handle b7 never `display: none` | → RD-74 |
| G§Handle b8 declared, never re-measured | → RD-72 |
| G§Handle b9 `anchorPoint` and `declaredHandles` share `AUTHORING_HANDLE_DIAMETER` | → RD-35 (outer rim) |
| G§Handle b10 `toNode` and the DOM; `dropTarget` | → RD-55 |
| G§Handle b11 the anchor set changes where an Alt drop authors | folded → RD-55 |
| G§Camera b1 issued, never awaited, never contained; where camera commands live | → RD-68 |
| G§Camera b2 `maxZoom` raised to 16 | → RD-64 |
| G§Camera b3 presenting on the Stage; fullscreen; chrome; presenting keys | sent → NV, UI |
| G§Camera b4 rehearsal notes | sent → NV |
| G§RF b1 pinned to 12.11.2 | → RD-70 |
| G§RF b2 React Flow's docs as reference (`llms-full.txt`) | sent → PROC: tooling guidance, not product |
| G§RF b3 every drawn Map uses `createMapSurface`; holds; root canvas reads its surface | one drawing → RD-59; policy and holds sent → SR, NV; prop set is a code note §5 |
| G§RF b4 an invariant from a canvas gesture is reported, not thrown | sent → ED (ED-79, bug: code differs, ruling Editing C3) |
| G§RF b5 React Flow's interaction model is the default; arrow-key deviation | principle → RD-76; arrow keys sent → UI |
| G§RF b6 head markers once per canvas | → RD-44 |
| G§Overlay activation is emphasis, not filtering | → RD-29 |
| G§Overlay Space-level `graphs` rejected at intake | sent → ST |
| G§Overlay nothing routes; a back-edge draws as a curve | → RD-32 |
| G§Overlay tracked fixture shape | sent → PROC (test data, `packages/app/README.md`) |
| R29 receding and colour (via MG trace) | → RD-23–RD-26 |
| R40 "a resize preview shows only the resizing Resource" (via MG trace) | → RD-57 |
| R48 Shape changes no rect; proportional; midpoints; Title inscribed; no glyph; ring | → RD-16, RD-17, RD-9; the ring → removed (drafting rule 6) |
| R49 Shape at every size; resize control; presented is the rectangle | → RD-16; control sent → UI; presented sent → NV |
| R50 embedded Map draws Shapes | → RD-19 |

## 3. Sent to other docs

**maps-and-graphs.md (MG):** 0003 r1; 0006s Closed Size constant; 0033 Active Graph receives the Edge, and the Alt-drop Edit; 0064 r2; 0084 drag and displacement rules; 0086 strategy rules; 0090 `isValidConnection` (MG-59); 0104 Edge data rules; 0105 head-shape data; 0112 cross-drawing connection refused; 0121 Shape data; 0122 size and Open data; 0135 "in a Graph"; G§b1 Active Graph write target; G§Strategy.

**space-and-resources.md (SR):** 0018 r1; 0070 Target immutability and Space Resource Target; 0083 Title Lines as data and normalization; 0106 kind, URL, recorded natural size (no reader) and load failure validity; 0112 policy, occurrences and "never contains its own Map"; 0114 content actions; G§b7 content resolution.

**editing.md (ED):** 0035 r2; 0042 r1, r8 (epoch), r11; 0057 r3 (outcome side); G§b2 lifecycle; G§b4 refusals; G§b5 epoch; G§RF b4 invariants reported (ED-79, bug: code differs, ruling Editing C3).

**storage.md (ST):** 0018 r3; G§Overlay Space-level `graphs` rejection.

**ui.md (UI):** 0006s Open as one verb; 0033 target selected after a connection, modifier key; 0036 r1, r2, r4; 0047, 0050, 0067; 0048; 0057 r3 wording; 0063 r2–5; 0064 r3–r7 controls and exits; 0065; 0070 no editor control on a Reference; 0073; 0082; 0083 names, search, keys; 0102 toolbar, keyboard reach (not built, DEC 6), `renderToolbar` seam; 0105 Graph menu; 0112 refusal wording; 0114 content actions; 0121 resize control and Shape choice; 0122 resize control; G§b1 Connect to Resource and key commands; G§b3 Edge toolbar, reveal and keyboard; G§b6 controls carry their operation; G§b11 resize floor; G§Camera b3 presenting keys; G§RF b5 arrow keys; RD-64 zoom control (UI-96).

**navigation.md (NV):** 0024; 0028 activation as navigation; 0068 r9 Enter and new tab; 0070 Jump to Target (not built); 0082 selecting is navigation; 0121 and R49 presented rectangle; 0123; 0129; 0135 Stage unchanged; G§Camera b3, b4; 0112 holds.

**CONTEXT.md (GL):** 0104 "Title not Label"; 0105 vocabulary.

**PROC:** RD-70's upgrade checklist (move both manifests together, then revalidate in a real browser handle resolution, consecutive connections, warning #008 and the camera-Promise facts of RD-68) belongs in build-tooling.md; 0042 r11 checklist; 0047, 0050, 0067 enforcement; G§RF b2 docs guidance; G§Overlay fixture.

## 3a. Items received from other traces

Every item another trace sends to rendering, with where it landed.

**From `trace/maps-and-graphs.md`:**

| Item | Disposition |
|---|---|
| R29, 0028 activation is emphasis; every Graph still drawn | → RD-29 |
| 0135 colour and receding | → RD-23–RD-26, RD-81; RD-27 and RD-28 → removed (drafting rule 6) |
| R48–R50, 0121 drawing (Title layout, no glyph, ring, Shapes at every size, embedded Shapes) | → RD-16–RD-19, RD-9; the ring → removed (drafting rule 6) |
| 0003 r3 | → RD-32 |
| 0018 r2 opening fit | → RD-62 |
| 0084 resize preview | → RD-57 |
| 0086 handle rules | → RD-72–RD-74, RD-55 |
| 0033 gesture and preview | → RD-50–RD-56 |
| 0105 markers and legend | → RD-43–RD-45, RD-49, RD-54 |
| 0104 render id | → RD-31 |

**From `trace/space-and-resources.md`:**

| Item | Disposition |
|---|---|
| 0009 "same content again" signal | folded → RD-9 (the glyph tells a Reference from its Target) |
| 0114 glyph by stored kind | → RD-9 |
| 0051 r4 drawing (a kind does not vary geometry) | folded → RD-4, RD-77 |
| 0068 r19 and the compound canvas (one camera) | → RD-59, RD-69 |
| 0070 r6 renderer reuse | → RD-11 |
| 0083 r6, r9, r10 ladder, clamp, no resize | → RD-12–RD-15 |
| A Space Resource with no framing is placed in its window | → RD-5: at authored scale from its Resources' top-left, not fitted (DEC Rendering C1) |

**From `trace/navigation.md`:**

| Item | Disposition |
|---|---|
| 0068 r19 entered camera | → RD-69 |
| 0112 one camera | → RD-59 |
| Emphasis (old guide line 62) | → RD-29 |
| Where an entered Space's camera starts (`cameras.test.tsx`) | → RD-63 |

**From `trace/editing.md`:**

| Item | Disposition |
|---|---|
| 0035 r8 the adapter owns pointer attempts, transient node state, measurements, visual selection | → RD-75 |

**From `trace/storage.md`:**

| Item | Disposition |
|---|---|
| How a stored image is fitted (0106) | → RD-4 |

**From `trace/ui.md`:**

| Item | Disposition |
|---|---|
| 0064 r1, r5 (renderer), r8, r9; G7 no `nowheel`, 16:9 or camera follow | → RD-2, RD-6, RD-67, RD-65 |
| G29 Markdown is sanitised | → RD-6 |
| G30 Open-Resource movement and motion token | RD-79 → removed (drafting rule 6) (RD-3 and RD-22 keep the rest) |
| G26 Resource text contrast to WCAG AA | → RD-80 |
| 0102 kind glyph placement; G18 Shape glyph geometry, no glyph on Ur | placement → removed (drafting rule 6); → RD-9, RD-17 |
| 0105 legend mark, markers, connection preview | → RD-43–RD-45, RD-49, RD-54 |
| 0036 handle reveal on selection; 0033 gesture | → RD-52, RD-50–RD-56 |
| The Edge-chrome bullet: point to UI for the Edge controls | pointer under "Head shapes, Edge Titles and the Graph key" and in "Not here" (UI-78–UI-82) |

## 4. Code only

Kept under drafting rule 5 (code plus a test, contradicted by nothing):
- RD-7 the image skeleton and failed state naming its URL.
- RD-8 the Close fade and reduced motion → removed (drafting rule 6).
- RD-10 the Reference Resource's distinct border at rest → removed (drafting rule 6); the glyph (RD-9) tells a Reference apart. Its solid border while hovered, selected or dragged (`ui/src/kinds/reference-canvas.css`) is untested and cut from the rule (§5).
- RD-12 the rung weights, same ink, and the `title`/`subtitle`/`caption` roles → removed (drafting rule 6).
- RD-15 three visual lines of a single-line Title. The per-Shape ceiling numbers are untested and kept as a code note (§5).
- RD-20 distinct rest, selected and dragging treatments.
- RD-21 the drag lean → removed (drafting rule 6); the drawn Map moving rigidly with it stays.
- RD-22 no animation while dragged or resized. No animation in from the origin → removed (drafting rule 6).
- RD-29 "no Edge animates" → removed (drafting rule 6).
- RD-46, RD-47 Edge Titles as drawn (only the Active Graph's; fitted at rest; hidden and dimmed). The fit constants → removed (drafting rule 6) (code note §5).
- RD-48 the Graph key.
- RD-56 the Edge gesture's cancel triggers.
- RD-60 drawn-Map zoom scales positions, not Resources.
- RD-61 dragging pans and the wheel zooms a drawn Map in Edit, writing framing; the extent is DEC Rendering C1.
- RD-67's exception: the wheel over a drawn Map in Edit stops at that drawn Map (untested, `SpaceCanvas.tsx` `onWheel`).
- RD-63 an entered Space opens at its framing.
- RD-65 fitting a Resource reached by URL.
- RD-51 the first palette colour for handles with no Active Graph.
- RD-58 no completed move for a drag that returns to its start.

## 5. Code notes

- The facing side is chosen in the Edge component (`useEdgeAttachment` in `react-flow-adapter/src/RoutedEdge.tsx`) because the projection does not re-run during a drag; the rule is the pure `facingSides` in `edge-attachment.ts`.
- Lanes are decided in the projection (`graphLanes`, `laneBezier` in `edge-lanes.ts`), which alone sees every Edge of a pair; constants `GRAPH_LANE_SPACING = 8`, `DETACHED_END_TRIM = 0.2`.
- Receding Edges: `OTHER_GRAPH_OPACITY = 0.35`, stroke 3 for the Active Graph and 2 for the rest (`projection.ts`).
- Head markers: `graphHeadMarkerId` is `graph-head-<graphId>`, unprefixed because a page draws Graph Edges in one `<ReactFlow>`; a second flow drawing Graph Edges would need ids namespaced per flow.
- Camera numbers: `OVERVIEW_FIT = { padding: 0.2, maxZoom: 1 }`, `MAX_ZOOM = 16`, `minZoom={0.2}` (untested) in `app/src/camera.ts` and `SpaceCanvas.tsx`. `fitView` runs only when the canvas has no opening framing.
- Framing gestures on a drawn Map in Edit are the portal handlers in `SpaceCanvas.tsx`: pointer drag pans and persists on release; the wheel listener runs in capture, stops propagation and persists after a 160 ms debounce.
- Camera command sites: `components/cameras.tsx`, `components/CanvasContinuation.tsx`, `react-flow-adapter/src/ZoomSlider.tsx`, and `SpaceCanvas`'s `fitView` prop. `fitView` before `panZoom` exists hangs; nothing calls it that early.
- Handle geometry: `declaredHandles` and `anchorPoint` both read `AUTHORING_HANDLE_DIAMETER` (24), so an Edge lands on the rim React Flow resolves. An embedded Resource's clip leaves half a handle diameter of slack.
- React Flow's `connectionRadius` is 20 at the pinned release; `dropTarget` and `newResourceDrop` in `app/src/edge-authoring.ts` compose the connection target with the DOM element.
- The drag lean: `CANVAS_RESOURCE_DRAG_TILT_DEGREES` in `@project/ui`, written once; the dragged Resource comes from React Flow's `nodeLookup`; the embedded canvas leans one frame late.
- `canvasProjection` is pure and tested in Node; the render adapter (Zustand) holds the published projection and the canvas selection.
- `ResourceNodeData` carries operations, never capability flags (`projection-types.test.ts`).
- The kind glyph is `CanvasResource`'s `kindMark`: null when Open or when the kind takes a Shape.
- 0122's "embedded Map fits" and Markdown "scrolls" are overruled by DEC Rendering C1 (RD-5). An unframed drawn Map's origin is the least `x` and `y` of its Resources, read once in `EmbeddedMapAuthoring.tsx` (`useState`).
- Title ladder ceilings (`--canvas-resource-title-ladder-lines` in `ui/src/canvas-resource.css`): 4 in the rectangle, 3 in an ellipse or pill, 2 in a diamond. Only the base token is tested.
- Lane span (`laneBezier`): the widest stretch around the curve's midpoint that bends no tighter than twice the pair's reach (how far out its outermost lane runs) and at whose ends the offsets at the reach lie ahead of the anchors along the facing axis; outside it, one cubic bridge per end. Each lane carries its pair's reach (`laneReach`).
- A Reference Resource's border turns solid while hovered, selected or dragged (`ui/src/kinds/reference-canvas.css`); untested, so not a rule.
- Edge Title fit constants in `ui/src/edge-title-room.ts`: `EDGE_TITLE_CEILING` 224, `EDGE_TITLE_CLEARANCE` 28, `EDGE_TITLE_BOX_CHROME` 26, `EDGE_TITLE_LEAST_TEXT` 34.
- The URL reveal calls `fitView({ nodes: [node], padding: 0.5, duration: 0 })` with no `maxZoom` (`CanvasContinuation.tsx`).
- Active Graph fade: content opacity transitions over `--resource-placement-duration * 0.4` (presentation; C2 closed by drafting rule 6).
