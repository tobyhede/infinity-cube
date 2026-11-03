# Trace: UI

For audit only. Every source rule appears exactly once in §1 or §2, with one of four dispositions:
- **→ UI-n**: kept.
- **folded → UI-n**: the source restates or implies a kept rule.
- **dropped**: with the reason.
- **sent → DOC**: it belongs to another doc.

§3 checks off what maps-and-graphs sent here. §4 groups this doc's sends by receiving doc. §5 lists code-only rules. §6 holds code notes.

Abbreviations:
- "G n" is the bullet of the old guide `docs/agents/ui.md` that starts on line n.
- "rN" is the Nth rule of an ADR as numbered in the mapping tables.
- "DEC n" is ruling n in `../DECISIONS.md`.
- Docs: SR is space-and-resources.md, MG maps-and-graphs.md, ED editing.md, ST storage.md, RD rendering.md, NV navigation.md, GL `CONTEXT.md`, PROC is process docs (AGENTS.md, workflow.md, anti-slop.md, build-tooling.md).

The rule ids in `../ui.md` are append-only from this version on.

## 1. Old guide (`docs/agents/ui.md`)

| Source | Disposition |
|---|---|
| G3 header (scope line) | dropped: replaced by the doc's purpose line |
| G5 application stories use the production host | sent → PROC (audit-split: workflow.md or anti-slop.md) |
| G7 Opening and editing are separate | Closed/Open offers → UI-53; Edit on Closed → UI-54; Save/Cancel/Close → UI-55; blur ends nothing → UI-56; editor swap → UI-55. "Open and Close author only `open`" sent → MG (MG-27). Sanitised renderer, no `nowheel`, no 16:9, no camera follow sent → RD |
| G8 Open Reference read-only | Offers Close and Title editing, no Edit, Save, Cancel or Target picker → UI-19. Ordinary Open by pointer, Enter, Space folded → UI-53. Draws through the Target kind's surfaces, content resolves once sent → RD. Target immutability, descendants read-only, authored like any Resource sent → SR. Create Reference copies the name and puts the caret in the Title: creation sent → SR, caret folded → UI-86. Unavailable on a Reference → UI-21. Space Resource menu groups → UI-20. `ResourceSearchCombobox` has no consumer: dropped (inventory fact, not behaviour) |
| G10 shadcn default; hand-roll a deviation | → UI-1. The `inert` dialog example dropped: reasoning, not a rule. "A contract contradicting a primitive default loses" folded → UI-1 |
| G11 Base UI and Lucide | Base UI only, `base-nova`/`neutral`/CSS variables, no `@radix-ui` → UI-2. Lucide default, custom icon only for a Hyper meaning → UI-3 (the OPEN artwork for Meta and the shared cube are its tested instances). Palette is Hyper's folded → UI-2. Manual QA report not run: dropped (status of a report, history). Version `1.7.0`, cmdk not migrated, no Anchor part, Positioner/Popup props, `null` controlled value, Dialog focus hooks: §6 code notes. `nokey` on portalled popups folded → "Keys pressed in chrome never act on the canvas" (Effects) |
| G12 every shortcut declared once | → UI-7. The guard → UI-9. No Ctrl/Meta/Alt, plain takes no Shift → UI-8. Enter/Space and Delete/Backspace aimed at a Resource → UI-10. "Don't add a listener testing `event.key`" folded → UI-7. `.nokey` not read by the guard; Save/Cancel cannot import the table; plan pointer: §6 code notes |
| G13 `Kbd`/`KbdGroup` | Shortcut hint and `aria-keyshortcuts` → UI-57. The `keyName="modifier"` registry extension: §6 code note |
| G14 Escape and commit decided by the surface | Title commits on blur, Escape reverts → UI-48. Body exits → UI-56. No surface pends several fields; creation completes on activation: sent → SR (creation, 0089) |
| G15 expected errors keep their owner | Mapping to the conducting surface, refused Title keeps its editor → UI-89, UI-90, UI-50. Persistence stays in its own states, not in the editor → UI-91. Problem Details and wire translation sent → ST. No surface prints wire prose → UI-89. Story given a structured refusal sent → PROC. Edge refusal channels → UI-90. `errorShownBy` folded → UI-50. Refusal-cascade pointer sent → ED |
| G16 where an Edit continues | "Continues at the entity it produced" → UI-86. One pending, never a queue → UI-87. Map rename needs no chrome address folded → UI-52. Invalidation on replacement and presenting → UI-87. Two adapters, addressing attribute, `staysOwed`, re-resolving on every render, `nameOnCreation`: §6 code notes. Word not in `CONTEXT.md`: sent → GL (stays out) |
| G17 operational feedback | Blocking failure as an announced alert with a focusable diagnostic, busy as one status → UI-92. `boundedDetail`, `panelClassName`, `FieldError` vs `AlertDialog`: §6 code notes |
| G18 Command Dock | One Map choice, no second control, no empty value → UI-34. Shared `ChoiceMenu` and command surface → UI-6. No layout space, floating → UI-33. Placement, grouping, glyphs are treatment: sent → PROC (0052 evidence). No second selector, no layout space for room → folded UI-33, UI-34. Responsive: no Sheet, caps and scrolls → UI-33. Presenting hides the toolbar, the way out and Retry while presenting: sent → NV. Persistence beside, never inside; no resting saving cue → UI-93. Rail carries copy links and Delete from Space → UI-20. Dock list carries Delete from Space only → UI-41. Canvas toolbar structure (`CanvasCommandToolbar`, `CanvasCommand`) → UI-14; class names §6. Ur Shape choice → UI-26. Shape glyph geometry, no kind glyph on Ur: sent → RD. `Select`/`Dialog` have no consumer: dropped (inventory fact). Space Resource creation chooses nothing; no third picker: folded → UI-41 and sent → SR. `nokey` at call sites: §6 |
| G19 chrome continuation | `'map-name'` → UI-86. `restoresFocusOnClose`, hidden sibling press: §6. `modal={false}` on the Resources list folded → UI-41 ("survives work on the canvas"). Connect purpose: hangs from the menu trigger, Escape returns to it → UI-72, UI-75; takes both dismissals, stops events reaching the canvas folded → UI-14; unmounts with close: §6. Test tips (jsdom `PointerEvent`, focus microtask): sent → PROC |
| G20 choosing a Resource is the Resources list | Two purposes → UI-41, UI-72. Refused row with reason → UI-72. New Resource row → UI-73. Choice continues at the Edge → UI-74. No second picker folded → UI-72 |
| G21 creation is one press per kind | → UI-40. No `AddResourceControl` (no default kind) folded → UI-40. Side-edge packing: treatment, sent → PROC (story evidence) |
| G22 no Sidebar, Sheet, Drawer or Tabs | → UI-33. Resources list is a popover → UI-41. Open Spaces menu sent → NV. Unwell words → UI-98. `skeleton.tsx`: dropped (code fact) |
| G23 `Textarea` for a multi-line Title | → UI-49 |
| G24 `MarkdownSourceEditor` | → UI-63 (one component, no `.cm-*` styling), UI-64 (withheld keys), UI-65 (split point, app never names it). The `@project/ui/*` import bar folded → UI-4 |
| G25 no creation pane | Creation on activation sent → SR. Refusal channels (`space-resource-create`, `map-create`, `reference-create`) → UI-90 |
| G26 styling split | Tailwind scan roots, `styles.css` contents, colocated CSS, tokens: sent → PROC. Presented-title source order and Stage CSS: sent → NV (§Presenting). Resource contrast to WCAG AA: sent → RD. Sanitised Markdown ownership folded with G29 |
| G27 structural tokens | sent → PROC |
| G28 design-system inventory | sent → PROC (the hand-roll bar itself is UI-1) |
| G29 Markdown is sanitised | sent → RD |
| G30 Open-Resource movement and motion token | sent → RD |

## 2. ADR rules

| Source | Disposition |
|---|---|
| 0033 target selected on success | → UI-76 |
| 0033 drop on empty canvas cancels; Option/Alt makes a Markdown Resource and the Edge | the key → UI-71. The release and preview sent → RD (RD-55). The Edit → MG-63 |
| 0033 handles, preview, self-drag, side not stored | sent → RD (gesture), MG (Edge) |
| 0036 r1 click selects | → UI-11 |
| 0036 r2 no body gesture Opens | → UI-11 |
| 0036 r3 double-click zoom off canvas-wide | sent → RD (RD-66); UI-11 points there |
| 0036 r4 do not wire click to Open | folded → UI-11 |
| 0036 double-click Title rename | dropped: replaced by 0065 (UI-44, UI-47) |
| 0036 `[data-selected]` reveals handles | sent → RD |
| 0042 r1 drafts local to the surface | sent → ED |
| 0042 r4 cancelling the rename keeps the created entity | sent → ED (ED-18); UI-52 points there |
| 0042 r5 refusal to the initiating surface, which keeps focus and draft | where → UI-90; the refused Markdown save → UI-59. Outcome semantics sent → ED |
| 0042 r6 nothing steals focus | retryable failure takes no focus → UI-93. Conflict and permanent rejection are focus-taking dialogs (UI-93): 0068 r17 covers the conflict dialog; for the permanent rejection the agreeing source is the old guide (G15: the Space's "existing `Alert`/`AlertDialog` states"), with the code and `app/ladle-e2e/command-dock.spec.ts` › "a permanent rejection explains itself and can be acknowledged". Drafting rule 1 narrows 0042's "none" accordingly; no conflict raised. Locking and coalescing sent → ED |
| 0042 r8 target-bound surfaces close, canvas focused | → UI-88 (bug: no focus placed). Selection and Traversal history clearing sent → NV. Epoch sent → ED |
| 0042 r2, r3, r7, r9–r11 | sent → ED (r11 checklist → PROC) |
| 0047 r1–r3 | → UI-1 |
| 0047 r4 pin and browser-revalidate focus primitives | sent → PROC (build-tooling.md) |
| 0047 stay on Radix | dropped: 0050 chose Base UI |
| 0048 r1 surface decides commit and Escape | → UI-48, UI-56; Effects "Escape" |
| 0048 r2 inline Title commits on blur, Escape reverts | → UI-48 |
| 0048 r3 no field-level two-stage Escape | folded → Effects "Escape" (Escape closes the nearest surface) |
| 0048 r4 do not commit a pane field on blur because the Edit is atomic | dropped: a pane rule; no pane exists (0064, 0089) |
| 0048 Card Editor pane, Done/Cancel, `NewAlias` | dropped: the pane is gone (0064, 0070, 0089) |
| 0048, 0074 "no undo" | sent → ED (DEC 5). UI-83's Why says Undo is not built |
| 0050 r1 Base UI, `base-nova`, no mixing | → UI-2 |
| 0050 r2 Lucide default, custom icon with a named meaning | → UI-3 |
| 0050 r3 Hyper's palette, not a restyle | folded → UI-2 |
| 0052 r1–r4 story parity | sent → PROC |
| 0057 r3 wording, field attribution and recovery owned by the conducting surface | → UI-89, UI-90, UI-91 |
| 0057 r3 "accepted Edit closes its surface without waiting for persistence" | sent → ED (completed is authoritative) |
| 0057 r1, r2, r4, r5, r7, r8 | sent → ED |
| 0057 r6 Problem Details | sent → ST |
| 0063 r1 source stored literally | sent → SR |
| 0063 r2 CodeMirror behind `MarkdownSourceEditor` | → UI-63 |
| 0063 r3 Escape and `Mod-Enter` belong to the surface; Tab is focus navigation | → UI-64 |
| 0063 r4 no toolbar, preview, format-on-save, panel chrome, rich text, autocomplete, dialect | → UI-64 |
| 0063 r5 lazy boundary | → UI-65 |
| 0063 `@uiw/react-codemirror` adapter | §6 code note |
| 0064 r1 content drawn on the Resource, several Open | sent → RD |
| 0064 r2 Open/Closed per entry | sent → MG (MG-27) |
| 0064 r3 Closed: Edit, Open; Open: Edit, Close; Edit on Closed opens first | → UI-53, UI-54 |
| 0064 r4 Save and Cancel replace Edit; Close visible and disabled | → UI-55 |
| 0064 r5 shared renderer; editor focused | editor focused → UI-55. Renderer sent → RD |
| 0064 r6 four exits, no blur commit, click elsewhere keeps the draft, Open after | → UI-56 |
| 0064 r7 one content edit owns the keyboard | → UI-31 (UI-32 removed: ED-37 states one authoring surface at a time) |
| 0064 r8 no `nowheel`, no 16:9, no camera follow | sent → RD |
| 0064 r9 one Resource component | sent → RD |
| 0065 r1 Title is a control; one activation; field focused and selected; heading kept; accessible name | → UI-44 |
| 0065 r2 belongs to the shared Title, not a kind | folded → UI-44 ("wherever Title authoring is available") |
| 0065 r3 `F2` | → UI-46 |
| 0065 r4 activation neither selects nor Opens | → UI-45 |
| 0065 r5 Enter or valid blur completes; Escape restores; refusal beside the field | → UI-48, UI-50 |
| 0065 r6 keyboard exit returns focus; pointer blur leaves it | → UI-51 |
| 0065 r7 no double click, no pencil | → UI-47 |
| 0067 r1–r3 `ui` owns the lazy boundary; app never imports the editor; scan enforces it | → UI-65 |
| 0070 never put Target, source, Map- or Graph-selection controls on an Open Reference | → UI-19 |
| 0070 other rules | sent → SR (Target, authoring), RD (renderer reuse) |
| 0073 one `role="toolbar"`, roving tabindex, one tab stop | → UI-12 |
| 0073 action owns treatment, canvas suppression, `holdFocus` | → UI-14, UI-58. "No `variant`/`size`": §6 |
| 0073 a cluster earns a toolbar by repeating or by count | applied → UI-79 (the Edge's controls stay a group) |
| 0073 kind and shared named groups; empty group draws nothing | → UI-13 |
| 0073 order: menu, kind, Open/Close last | → UI-13 |
| 0073 arrows cross group boundaries | → UI-13 |
| 0073 unavailable stays focusable, `aria-disabled`, styled by the attribute | → UI-29 (the styling clause now stated) |
| 0073 tests read the attribute, not `toBeDisabled` | sent → PROC |
| 0073 keydown stop on the toolbar root | → UI-14 |
| 0073 Title not in the toolbar | → UI-17 |
| 0073 Escape and commit stay surface-decided | folded → UI-48, UI-56 |
| 0073 Tab traverses Resources, arrows one Resource's commands | dropped as written by 0102; the reach it promised → UI-18 (not built, DEC 6) |
| 0073 Alias metadata modal; Space Card kind commands | dropped: the Alias pane is gone (0070); Space Resource commands → UI-20, UI-25, UI-61 |
| 0074 r7 a destructive action names its scope and asks first where authored work would be lost; its Space may go with it | → UI-83 (including the Space Resource cascade sentence). Remove from Map → UI-85 (C2) |
| 0074 other rules | sent → SR |
| 0082 one exclusive Map choice, no second control, no empty value | → UI-34 |
| 0082 activating a Graph is not that choice | → UI-35 |
| 0082 selecting is navigation | sent → NV |
| 0082 status is not a command | → UI-97 |
| 0082 no layout space from the canvas | → UI-33 |
| 0082 one surface per Space | → UI-33 |
| 0082 everything keyboard-operable, placing included; accessible names contain visible labels | → UI-36, UI-37 |
| 0082 reports persistence unasked, with the indicator's states and `openSpaceStatusLabel`'s words; `failed` ≠ `rejected`; a standing failure announces itself | → UI-93. The Dock says nothing for `settled` and `pending`, which 0082 does not forbid ("a save that worked is not news"); no sixth state or second vocabulary is added |
| 0082 names the current Space; reaches the open Spaces; an unwell one is distinguishable | → UI-38 |
| 0082 treatment list (placement, grouping, glyphs, colour, snapping, orientation, animation, name) | dropped: it names what is not a requirement. Evidence for treatment sent → PROC (0052) |
| 0082 do not give it layout space; do not restore the header row | folded → UI-33 |
| 0082 do not persist its position | → UI-39 |
| 0082 the shape freedom does not lift story evidence | sent → PROC |
| 0083 Enter completes, Escape cancels, Shift+Enter inserts a line; field grows, uniform size | → UI-49, UI-48 |
| 0083 lists, references and accessible names show the name | controls and rows → Effects "Names". Questions and notices → UI-99, conflict C3 (0083 says name only; the code and `CONTEXT.md` add an ellipsis; rule 1 does not settle it because the agreeing source is the glossary) |
| 0083 the Title control wraps the heading | → UI-44 |
| 0083 data, normalization, ladder, clamp | sent → SR (data), RD (ladder) |
| 0089 one activation places, selects, caret in the Title | caret → UI-86. Creation sent → SR |
| 0089 Space Resource refusal goes to the Dock's refusal channel | → UI-90 |
| 0089 Create Reference drawn but disabled on a Reference | → UI-21 |
| 0089 referencing an existing Space is the Resources list's add-Space row | folded → UI-41. Sent → SR |
| 0089 no creation pane, no picker, optimistic Space Resource placement | sent → SR, ED |
| 0102 commands in `NodeToolbar`, top right, outside the zoom, Dock size | → UI-15 |
| 0102 shown for the one selected Resource and a running edit; hidden while dragged or resized; hover reveals nothing | → UI-16 |
| 0102 right-click menu offers the same actions without selecting | → UI-20 |
| 0102 a click on an unselected Resource selects first, Open Markdown body included; next click edits; toolbar Edit in one press | → UI-11, UI-60 |
| 0102 kind glyph inside at top right; none when Open | sent → RD |
| 0102 band fallback without an adapter | §6 code note (stories and unit tests only) |
| 0102 `@project/ui` names no React Flow type; `renderToolbar` seam | → UI-5 |
| 0102 keyboard reach is open work | → UI-18 (not built, DEC 6) |
| 0104 toolbar: eye disabled without a Title | → UI-81 |
| 0104 Title data, identity, refusals | sent → MG (MG-64, MG-65) |
| 0105 Shape… under Colour…, same grid, disabled when Colour… is; offered on an Open Space Resource | → UI-22, UI-23, UI-25 |
| 0105 swatch keyboard (arrows, Enter/Space, ArrowLeft, type-ahead) | → UI-24 |
| 0105 legend mark in the Dock's and an Open Space Resource's Graph choices | sent → RD (the mark); the lists that carry it are UI-22, UI-25 |
| 0105 markers, connection preview, vocabulary | sent → RD, GL |
| 0112 a cross-drawing connection is refused with wording | → UI-77 (C1). No wording exists in code (checked; see C1) |
| 0112 Connect to Resource offers only the same drawn Map | → UI-72 ("this drawing's Map") |
| 0112 continuation spent only in its occurrence; dropped if that occurrence stops being drawn | → UI-87 |
| 0112 one notice area for every drawn Space; a drawn Space's notice names it | → UI-94 |
| 0112 per-Space commands, outcomes, delete confirmation; Dock acts on the canvas's Space; keyboard and rail act on the selected occurrence; drop on an inert Map refused with wording | sent → SR (SR-60 for which Space a command acts on; UI's header points there) |
| 0113 Ur created as a peer in the Dock's creation cluster | folded → UI-40 |
| 0113 Ur has no Edit | folded → UI-28 |
| 0114 a Reference's kind withholds only content actions | folded → UI-28, UI-19 |
| 0121 Shape choice on the rail, `ChoiceMenu`, one Edit per choice, offered Open and Closed | → UI-26 |
| 0122 resize control on the selected Resource, any kind, Open or Closed, where authorable | → UI-66 |
| 0122 one bottom-right control, fixed origin, draft to one Edit | → UI-67 |
| 0122 no keyboard resize | → UI-69 |
| 0122 thin rect border on a non-rectangle Shape | the frame sent → RD (RD-18); the control on its corner → UI-70 |
| 0122 Edit on a Closed Resource Opens it first | folded → UI-54 |
| 0131 Dock mark: Edits lost on reload | → UI-42 |
| 0132 r4 Dock mark: Edited in this browser | → UI-43 (not built, DEC 4) |
| 0132 r5 Discard local edits | the control → UI-95 (not built, DEC 4); what it does → ST-96 |
| 0006s Open is one verb across kinds | dropped: superseded; 0064 carries Open (UI-53) |
| 0039 r4 a Reference's Title is authored inline like any Resource's | folded → UI-44 |
| 0046 r3 one field never authors two Resources' Titles | folded → UI-44 and SR-32 |
| 0092 Copy link to Target | → UI-20 |
| 0106 Replace's control | → UI-53, UI-62 |
| E&P "no surface offers a Target" | → UI-19 (widened to every surface) |
| 0066 resize control rules | dropped: superseded; carried by 0122 (UI-66–UI-69) |
| 0037, 0053 | dropped: superseded (0064; 0082 carries 0053's negatives) |
| 0068 r12–r15, r17 Open Spaces, Escape never closes a Space, conflict dialog only for the active Space | sent → NV. r14's status words → UI-98 (NV-46 points there) |
| DEC 6 keyboard access to a Resource's toolbar kept, not built | → UI-18 |
| DEC 4 mounted edits in browser storage, not built | → UI-43 |
| DEC 5 Undo | sent → ED |

## 3. Items received from other traces

### From trace/maps-and-graphs.md
| Sent item | Placed |
|---|---|
| R12, R27: Delete Map and Delete Graph not offered for the last one | UI-30 |
| MG-82: the resize control stops at the Closed Size | UI-68 (built: `canvas-resource-decoration.test.ts` covers it, so MG-82's "untested" can become built) |
| 0033 Connect list, new Resource beside the source | UI-73 |
| R38 Edit on a Closed Resource Opens it first | UI-54 |
| R44 resize control, its border on non-rectangle Shapes, no keyboard resize | UI-66, UI-67, UI-69, UI-70 |
| R49 Shape choice on the toolbar at every size | UI-26 |
| The connection modifier key (MG-63) | UI-71 (Option/Alt) |
| 0105 and 0121 menus | UI-22–UI-26 |
| 0104 Edge toolbar | UI-78–UI-82 |
| 0112 wording for a refused cross-drawing connection | UI-77, conflict C1. Checked: no wording exists. Another drawing's Resources are never offered as ends and the release completes nothing silently |
| 0033 target selected after a connection | UI-76 |

### From trace/editing.md

| Sent item | Placed |
|---|---|
| 0048 r1–r4; 0064 r3, r4, r6, r7; 0065 r5; 0083 Title keys | §2 rows (UI-31, UI-48–UI-56) |
| 0057 r3 wording, field attribution, recovery controls | UI-89, UI-90, UI-91, UI-93 |
| Persistence indicator words; `PersistenceNotice` with Retry and Open; the conflict dialog | UI-93 (table, including `Open <Space>`) |
| Mounted Dock mark (0131 r4, 0132) | UI-42, UI-43 |
| Focus after a replacement (0042 r8) | UI-88 (bug; the ticket is cited) |
| Delete confirmation and its "no undo" wording (DEC 5) | UI-83 (the Why says Undo is not built; the dialog's comment is code) |
| 0112 one notice area; the Edge alert region | UI-94; UI-90 |
| 0042 r5, r6 focus (replaces ED-50) | UI-90, UI-93 |

### From trace/navigation.md

| Sent item | Placed |
|---|---|
| 0065 r6 focus after Title editing | UI-51 |
| 0082 Map choice, Graph control apart, Dock reaching Open Spaces | UI-34, UI-35, UI-38 |
| Graph navigation keys (NV-13), `P` and Present from Here | UI-10 keeps the key names only; what they do stays NV |
| Copy link and Open in New Tab wording | UI-20 |
| 0042 r8 canvas focus after replacement | UI-88 |
| Presenting chrome accessibility (one polite status region, `sr-only` selection, `aria-keyshortcuts`, chrome from `@project/ui`) | received and returned: NV owns it (NV-89–NV-91), since it runs only while presenting |

### From trace/rendering.md

| Sent item | Placed |
|---|---|
| 0006s Open as one verb | dropped (§2) |
| 0033 target selected; modifier key | UI-76; UI-71 |
| 0036 r1, r2, r4 | UI-11 |
| 0047, 0050, 0067; 0048; 0057 r3; 0063 r2–r5; 0064 r3–r7; 0065; 0073; 0082 | §2 rows |
| 0070 no editor control on a Reference | UI-19 |
| 0083 names, search, keys | Effects "Names", UI-99, UI-41, UI-49 |
| 0102 toolbar, keyboard reach, `renderToolbar` | UI-15, UI-16, UI-18, UI-5 |
| 0105 Graph menu | UI-22–UI-25 |
| 0112 refusal wording | UI-77 (C1) |
| 0114 content actions | UI-28 |
| 0121, 0122 resize control and Shape choice | UI-66–UI-70, UI-26 |
| G§b1 Connect to Resource and key commands | UI-72–UI-75, UI-10 |
| G§b3 Edge toolbar, reveal, keyboard | UI-78–UI-82 |
| G§b6 controls reach `CanvasResource` only with their operation | §6 code note |
| G§b11 resize floor | UI-68 |
| G§Camera b3 presenting keys | returned → NV (presenting) |
| G§RF b5 arrow keys | UI-10 (key names; travel is NV-13) |
| RD-64 zoom control | UI-96 |

### From trace/space-and-resources.md

| Sent item | Placed |
|---|---|
| 0039 r4; 0046 r3 | folded → UI-44 |
| 0063 r2–r5 | UI-63–UI-65 |
| 0070 r4 no source editor, r9 | UI-19 |
| 0074 r7 confirmation, "its Space may go with it" | UI-83 |
| 0083 r2 surfaces, r7, r8, r15 | Effects "Names", UI-99, UI-44, UI-49 |
| 0089 r1 select and caret, r3 list row and drag, r5 refusal channel, r7 disabled Create Reference | UI-86, UI-41, UI-90, UI-21 |
| 0112 continuation, notice area, cross-drawing wording | UI-87, UI-94, UI-77 |
| E&P line 37 `target` read | UI-83 (the cascade sentence reads the target) |
| 0113 Dock creation cluster | UI-40 |
| E&P "no surface offers a Target" | UI-19 |
| The short Title question | UI-99, conflict C3 |
| (SR sent 0112's "which Space a command acts on" here; it is drawn-Map policy and SR-60 now holds it) | pointer in UI's header |

### From trace/storage.md

| Sent item | Placed |
|---|---|
| 0057 r3 | UI-89 |
| "Edits lost on reload" (0131 r4) | UI-42 |
| "Edited in this browser" and Discard local edits (0132 r4–r5, not built) | UI-43, UI-95 |

## 4. Sent to other docs

**space-and-resources.md (SR):**
- G8, 0070: Reference Target immutability, read-only descendants, authored like any Resource.
- G14, G25, 0089: creation completes on activation, no creation pane, a Space Resource chooses nothing, referencing an existing Space.
- 0063 r1: Markdown source stored literally.
- 0112: drawn-Map policy, which Space the Dock, keyboard and toolbar act on (SR-60), a drop on an inert Map refused with wording.
- 0074 ownership and cascade.

**editing.md (ED):**
- 0042 r4 a rename after a creation (ED-18); 0064 r7 one content edit, folded into ED-37 (UI-32 removed).
- 0042 r1–r3, r5 (semantics), r6 (locking, coalescing), r7, r9, r10; replacement epoch.
- 0057 r1, r2, r4, r5, r7, r8; "an accepted Edit closes its surface without waiting for persistence".
- Availability as a definition (UI-31 points to it).
- "No undo" lines in 0048, 0074 and `DeleteConfirmation.tsx` (DEC 5).
- G15 refusal-cascade pointer.

**storage.md (ST):** 0057 r6 and G15: Problem Details and the adapter's one translation.

**rendering.md (RD):**
- 0036 r3 double-click zoom (RD-66); 0033 empty and off-canvas release (RD-55); 0122 Shape frame (RD-18).
- 0064 r1, r5 (renderer), r8, r9; G7 no `nowheel`, 16:9 or camera follow.
- G29 sanitised Markdown; G30 Open-Resource motion; G26 Resource contrast.
- 0102 kind glyph placement; G18 Shape glyph geometry and no glyph on Ur.
- 0105 legend mark, markers, connection preview.
- 0036 handle reveal on selection; 0033 gesture.
- `docs/agents/rendering.md`'s Edge-chrome bullet is RD's source; RD should point here for the Edge controls (UI-78–UI-82).

**navigation.md (NV):**
- Presenting chrome accessibility, received from NV and returned (NV-89–NV-91).
- 0082 "selecting is navigation, not an Edit".
- G18: presenting withdraws the Dock, `PresentingChrome` carries the way out, a persistence failure and Retry stay reachable while presenting (`app/e2e/http-persistence.spec.ts` › "Retry remains reachable while presenting and persists the failed Edit"; `app/ladle-e2e/command-dock.spec.ts` › "presenting removes the whole command surface").
- Presenting keys (`PRESENTING_KEYS` in `app/src/key-bindings.ts`).
- G22 and 0068 r12–r15, r17: the Open Spaces menu, Escape never closes a Space, a conflict dialog only for the active Space.
- 0042 r8 selection and Traversal history clear on replacement.
- G26 presented-title CSS order and the Stage's CSS.
- The arrow keys' travel along the Active Graph and `P` (UI-10 names the keys only).

**CONTEXT.md (GL):** G16 "continuation" stays out of `CONTEXT.md` (a surface's state machine, not the authored world).

**PROC:**
- G5 application stories use the production host.
- 0052 and G28 story parity and the design-system inventory; G18, G21 and 0082 treatment held by stories.
- G26 styling split, G27 structural tokens.
- 0047 r4 pin and revalidate primitives (build-tooling.md).
- 0073 tests read `aria-disabled`, not `toBeDisabled`.
- G15 a story handed a structured refusal; G19 jsdom and Base UI test tips.

## 5. Code only

Rules no source states, kept under drafting rule 5 (code plus a test, contradicted by nothing):
- UI-16, second sentence: Open and Close keep the Resource selected and its toolbar drawn.
- UI-27: a menu command confirms or announces its failure.
- UI-31's list of what makes what unavailable (the principle is `CONTEXT.md`'s Availability).
- UI-40: Image's press opens a file picker (the four peers are G21's).
- UI-41: search over every Title Line, kind and Spaces filters.
- UI-62: the image-replacement running shape.
- UI-78, UI-80: Edge focus and the Enter/Escape reach (stated only in `docs/agents/rendering.md`, RD's source).
- UI-86: a keyboard Add from the Resources list keeps the caret there.
- UI-94: the notice area's placement above the Dock and its dismissal (0112 states one notice area only).
- UI-96: the zoom control (RD sent it; no ADR states it).
- UI-84: the Delete question opens on Cancel, returns the caret, and withholds its answers while deleting (0074 asks only that it asks).
- UI-4: the bar on Base UI, cmdk and Lucide outside `@project/ui` (only the editor half is 0067's).
- UI-10's `C`, arrows, Shift+arrows, `P` and Escape bindings come from the binding table (G12 states the table, not each key).

## 6. Code notes (not requirements)

- **Undo wording.** The delete question's visible words say nothing about undo, so UI-83 holds after Undo ships. Two code comments still say "V1 has no undo" (`app/src/components/DeleteConfirmation.tsx:23`, `app/src/resource-rail-actions.tsx:172`); they must change when Undo is built (DEC 5).

- **Controls carry their operation** (RD G§b6): a Resource's control reaches `CanvasResource` only with the operation that performs it, so presence of the operation is the whole capability.

- **Primitives.** `@base-ui/react` 1.7.0. Base UI has no Anchor part: a non-trigger anchor is a ref handed to `PopoverContent`'s `anchor`. Positioning props belong to `Positioner`, popup props to `Popup`. A controlled choice ignores the `null` from `onValueChange`. A modal with its own starting field sets `initialFocus={false}` and `finalFocus={false}`.
- **cmdk** behind `Command` is not migrated; any `@radix-ui` in the lockfile is cmdk's transitive dependency, not a UI-2 breach.
- **`nokey`** sits on every portalled popup and on chrome outside the canvas, because React Flow subscribes its delete key on `document`. The key guard (`keyBelongsElsewhere`) does not read `.nokey`; `SpaceCanvas`'s `NOT_A_CANVAS_COMMAND` does.
- **Save and Cancel** live in `@project/ui`, which cannot import `app`'s binding table; `Kbd` carries a local `keyName="modifier"` extension to keep when refreshing the registry file.
- **Continuation.** `continuation.ts`; targets `resource | edge | canvas | control`; the one chrome address is `'map-name'`, spent by `ChromeContinuation` through `data-continuation-control`; `CanvasContinuation` re-resolves on every render; the New Map row raises `restoresFocusOnClose` so the menu does not take the caret back.
- **Resources list.** `modal={false}` declines the dismissals a drag onto the canvas produces; in its Connect purpose it takes them, and unmounts with its close so `CanvasContinuation` can focus the Edge.
- **Toolbar parts.** `CanvasCommandToolbar` and `CanvasCommand` (shared surface, root keydown stop, `nodrag nopan`, `holdFocus`); `ResourceRailActions`/`ResourceRailAction`; no `variant`/`size` per action. Without a React Flow adapter the toolbar draws in the Resource's band, always shown (stories and unit tests).
- **Status panels.** `StatusFailure` (`boundedDetail`, `panelClassName`) and `StatusBusy`; distinct from `FieldError` and `AlertDialog`.
- **Editor.** `@uiw/react-codemirror` behind `MarkdownSourceEditor`; `PANE_OWNED_KEYS` is `Escape` and `Mod-Enter`; `indentWithTab: false`.
- **MG-82** can move to built: `app/test/canvas-resource-decoration.test.ts` › "offers resize on every kind, Open or Closed, where the Map may be authored" asserts the `minWidth`/`minHeight` floor.
