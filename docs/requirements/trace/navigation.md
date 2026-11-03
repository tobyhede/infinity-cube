# Trace: Navigation

For audit only. Every source rule appears exactly once in §1 to §3, with one of four dispositions:
- **→ NV-n**: kept.
- **folded → NV-n**: the source restates or implies a kept rule.
- **dropped**: with the reason.
- **sent → DOC**: it belongs to another doc.

§3 lists the items other traces sent here. §4 groups the sends by receiving doc. §5 lists the code-only rules. §6 holds code notes. Conflict ids (C1–C3) are those of `../conflicts/navigation.md`, not the DECISIONS rulings.

Abbreviations: "rN" is the Nth rule of an ADR as numbered in the mapping tables; "s" after an ADR number marks a superseded ADR; "DEC n" is ruling n in `../DECISIONS.md`. Docs: SR space-and-resources.md, MG maps-and-graphs.md, ED editing.md, ST storage.md, RD rendering.md, UI ui.md, GL `CONTEXT.md`, PROC process docs.

The rule ids in `../navigation.md` are append-only from this version on.

## 1. Old guides

### `docs/agents/navigation.md`

| Source | Disposition |
|---|---|
| Every Space, Resource, Graph, Map has a product URL from its id; 22-char base64url; domain keeps canonical spelling | → NV-20 |
| Map URL shape `/spaces/:s/maps/:m` | folded → NV-21 |
| "Read ADR status blocks before bodies" | dropped: process advice about ADRs, which are archived (DEC 8) |
| No router library; destination table declared once in `@project/http`; host resolves the same table | → NV-80 |
| Mounted `source` carried on every product path, Copy link and Notes window included; pairs carried as written and in place; path alone when no pair left | → NV-36 |
| `source` dropped by a page that is not Mounting | → NV-37 |
| Hash never carried | folded → NV-36 |
| Resolution reads the pathname only; traversal keeps the query because the browser restores the entry | → NV-26 |
| `pinSource` replaces the entry only when the address names another location; mounted root's move to Meta sets `source` in place | → NV-38 |
| `/spaces/:s/notes` is a Notes window, not a place | → NV-21, NV-72 |
| Notes startup composes no Navigation or browser location | → NV-72 |
| Notes window follows the presenting window over the presentation link (`BroadcastChannel`) | → NV-75. The channel is a code note (§6) |
| `destinationOpening` opens the Space at its default Map for a `notes` destination | dropped: reached only by a caller outside startup; implementation detail (§6) |
| `browser-location.ts` the one module that knows a browser exists; five-member `HistoryApi`; `createBrowserHistory` the one adapter; takes a `NativeBrowser` | → NV-80 (behaviour). Module names are §6 |
| `browserHistory()` in `space.ts` names `window`; `createSpaceStartup` default argument; grep evidence | §6 code note |
| A mounted page answers every address itself; unresolved reaches not-found, not 404 | → NV-39 |
| Mount records `source` once with `replaceState` before the location is composed | folded → NV-38 |
| One history stack; location composed once per session; `follow(app)` | §6 code note. Behaviour → NV-33 |
| `useAddressedResource` reads `addressedResourceId`, `destinationNotFound` | folded → NV-12, NV-24 |
| `useSpaceAddresses` keeps only Copy link's clipboard half | §6 code note |
| Navigation answers a `NavigationAddress` derived and never stored | → Terms ("Address"), NV-78 |
| `destinationSync` pure function answers push/replace/none | → NV-79 |
| `none` lets `popstate` move Navigation without pushing; redundant notification decides nothing | → NV-31 |
| Do not compare `getState()` around a call site | folded → NV-79 |
| `popstate` reopens what the pathname resolves to; unresolved reported not corrected; first move away writes and clears | → NV-33, NV-34 |
| Held traversal: `false` holds; returns to the entry left by key (Navigation API) or relative `history.go` | → NV-35. Mechanism §6 |
| A promise answers later; late `false` holds while no later traversal kept | folded → NV-35 |
| Entry numbering (`hyperHistoryIndex`), fragment entries, uncounted foreign `pushState` | §6 code note |

### `docs/agents/rendering.md` (Stage and presenting parts only; the rest is RD's)

| Source | Disposition |
|---|---|
| Line 3: "presenting's Stage" in the guide's scope | dropped: scope line |
| Line 46: "Presenting no longer zooms the canvas" | folded → NV-59 |
| Line 47: Stage composes `Stage`, `PresentedResource`, `PresentingChrome`; one 16:9 frame, largest above the strip, letterboxed | → NV-63. Component names §6 |
| Line 47: canvas stays mounted behind, `inert`; nothing on it knows about presenting; no camera moves | → NV-59, NV-55 |
| Line 47: "Don't put a presented display, active-Resource flag or presenting camera on the canvas" | folded → NV-59 |
| Line 47: Present takes the whole document fullscreen; refusal tolerated; link-opened never asks; fullscreen and presenting end together; request made synchronously on `documentElement` | → NV-58. The `documentElement` and synchronous detail are §6 |
| Line 47: chrome enumerates the outgoing Edges; no `isLinear` branch | → NV-64, NV-15 |
| Line 47: no derived array in a store selector; `moves()` at render, not memoised; effects keyed on the changed value | §6 code note |
| Line 47: chrome composed from `@project/ui` | dropped as a rule here: a code fact about which primitives the chrome uses (§6); the hand-roll bar covering all production UI is ui.md's |
| Line 47: chrome owns its indexed list and calls `selectBranch(delta)` | folded → NV-15 |
| Line 47: a move names its action (`Choose`/`Go to <Title>`), never a radio or toggle | → NV-64 |
| Line 47: moves and End-of-Graph share one polite `role="status"`; selection as `sr-only` text; `aria-keyshortcuts` | → NV-89, NV-90, NV-91 (runs only while presenting, so NV §Presenting owns it; not sent to UI) |
| Line 47: focus debt: chrome claims focus at start; restores to selected move, else Back, else Overview; global keys leave focus | → NV-66 |
| Line 47: global Traversal keys in `presenting-keys.ts`; defer to native activation; Arrow/Escape global except where a surface owns its keys | → NV-65 |
| Line 48: rehearsal notes under the chrome, N or button, `PresentedNotesList` shared with the Notes window | → NV-71 |
| Line 48: off at every presentation start, never stored; when a presentation starts | → NV-57, NV-71 |
| Line 48: the presenting window is the one module a presentation lives in; mints identity from `newId`, start time from the shared clock | §6 code note; behaviour folded → NV-57 |
| Line 48: notes take room from the frame, inside the Stage | folded → NV-71 |
| Line 54: "Root presentation and one camera remain the recorded differences" | presentation → NV-54. Camera sent → RD |
| Line 54: Dock and Stage read the same reading; Stage's Copy link reads the Map id from Navigation | §6 code note |
| Line 62: activation is emphasis at all times, not only while presenting | sent → RD |

## 2. ADR rules (NV-targeted rows of the mapping tables)

| Source | Disposition |
|---|---|
| 0001 r3 Maps, Graphs and navigation per Space, never one global graph | navigation half → NV-3. Maps and Graphs sent → SR, MG |
| 0024 r1 presenting traverses the Active Graph along outgoing Edges | → NV-15, NV-51 |
| 0024 r2 no deck, no sequence framework | folded → NV-15 (no linear special case). The framework fence is dropped: no code or proposal would add one; it fenced a library choice |
| 0024 r3 a line is not a special case; no `isLinear` | → NV-15 |
| 0024 r4 reaching a Resource twice is part of the walk | → NV-16 |
| 0024 "opening shows source, presenting rendered" | dropped: contradicted by Open Markdown rendering (`CONTEXT.md` "Opening"); drafting rule 1 |
| 0024 "speaker view leaves the tracker" | dropped: 0129 (later, built) adds the Notes window |
| 0025s pan, zoom and fit move the camera, not the Space | → NV-1 |
| 0026s r1 one Active Graph; selected = active | sent → MG (MG-43) |
| 0026s r2 activation never a side effect | sent → MG (MG-43) |
| 0026s r3 fallback first Graph; must name own Graph | sent → MG (MG-44) |
| 0028 r1 activation is not an Edit | struck by DEC 1 (MG-45). NV-8 states only what switching shows |
| 0028 r2 fallback is a read, never written | sent → MG (MG-44) |
| 0028 r3 an Edit records the resolved `activeGraph` | sent → MG (MG-79) |
| 0028 r4 Add Graph activates in the same Edit | sent → MG (MG-41) |
| 0028 r5 activation not durable until a later Edit | struck by DEC 1 |
| 0031s r1 choosing a Map is navigation | → NV-6 |
| 0031s r2 `Map N` | sent → MG (MG-10) |
| 0035 r4 navigation side: Navigation holds no second copy of the Space | → NV-2. Rest of r4 sent → ED |
| 0035 r9 navigation side: Accept stored reopens Navigation at `defaultMap`, no traversal or selection | → NV-4. Replacement itself sent → ED |
| 0041 r3 Graph navigation transient; Traversal history = Resources visited; "walk" retired | Graph navigation → NV-13 (C2). Traversal history → NV-16. Vocabulary sent → GL |
| 0041 r4 Traversal history transient, never persisted or inferred from incoming Edges | → NV-19 |
| 0041 r10 activation is navigation; a connection authors in the Active Graph | activation struck by DEC 1. Connection sent → MG (MG-62) |
| 0042 r8 navigation side: selection and Traversal history clear on replacement | folded → NV-4. Drafts, surfaces and focus sent → ED, UI |
| 0065 r6 keyboard completion returns focus to the Resource | sent → UI |
| 0068 r5 the selection belongs to the Space Resource | sent → SR |
| 0068 r7 a Space with no Graph shows with no presenting | dropped: lapsed; every Map has a Graph (MG-34) |
| 0068 r9 an opened Space Resource embeds its Map; may be Entered or opened in a new tab with no containing state | embed sent → SR. Enter → NV-40. New tab → NV-41 |
| 0068 r10 editing inside authors that Space; moving the Space Resource authors the containing Map | sent → SR |
| 0068 r11 Entering seeds a live selection; changing Map inside writes nothing; switching away keeps it; Exit closes the entry | → NV-40, NV-42, NV-48, NV-87. "Changing the Graph inside writes nothing" struck by DEC 1 (an entered Space is its own canvas; MG-45). "Reload resets to the stored selection" dropped: reload restores the address (0069, later, and the code: NV-27, `space-routing.spec.ts` › "choosing a Map pushes history and Back, Forward and reload restore it without authoring") |
| 0068 r12 Open Spaces: entries stay until Exit; one per Space; selecting switches and closes nothing; Exit explicit in that Space's surface; root never closable | → NV-42, NV-48. Root → NV-49 (Meta) and NV-82 (C1). "Drawn only when more than one is open; width from the sidebar" dropped: placement is treatment (0082, later; `CONTEXT.md` "Open Spaces") |
| 0068 r12 "an entry names a Space and remembers nothing else, not the chain" | dropped under drafting rule 1: 0112 (later) speaks of a Space "without an Opener", and the code records the Opener (NV-43, NV-44). Its reason, that closing one Space never closes another, is kept by NV-44 |
| 0068 r13 entering an open Space focuses its entry | → NV-40 |
| 0068 r14 status mark only for conflicted, failed, rejected | → NV-46. The code also marks `refused`: C3, NV-84 |
| 0068 r15 Escape never closes a Space; Back is browser history | → NV-48 |
| 0068 r16 switching awaits the in-flight commit on the Space left | → NV-47 |
| 0068 r17 conflict dialog opens only when its Space is active | → NV-88 |
| 0068 r18 Exit waits; refuses on failed/conflicted with a stable code naming the recovery; warns and allows on rejected | → NV-85, NV-86 (warning on `refused`: C3, NV-84). Statuses sent → ED |
| 0068 r19 entered Space has its own React Flow instance and camera | sent → RD |
| 0068 cross-Space Edges and crossings | dropped here: deferred (0111, DEC 6); Open questions |
| 0069 r1 durable URL from the id; titles not identity | → NV-20 |
| 0069 r2 22-char base64url; canonical UUID elsewhere; no version segment | → NV-20, NV-21 |
| 0069 r3 the URL shapes | → NV-21 (today's segments `maps`, `resources`; plus `/notes` from 0129) |
| 0069 r4 explicit context wins for that navigation and never edits authored selections | → NV-22 |
| 0069 r5 canonical Resource uses the default Map when it holds it, else the Resources collection; contextual asserts membership | → NV-21, NV-23 |
| 0069 r6 canonical Graph uses its owning Map; contextual not found when the Map cannot show it | → NV-21 |
| 0069 r7 presentation URL names the current Resource, not the history | → NV-27 |
| 0069 r8 every change of destination pushes; Back follows visited entries | → NV-29 (refined by 0081: NV-30, NV-31) |
| 0069 r9 resolving is navigation; changes no Open/Closed, membership, default Map, Active Graph; Closed Resource may be selected and centred | → NV-22, NV-12 |
| 0069 r10 camera, sidebar, selection, drafts, Open/Closed not in the URL | → NV-27 ("Sidebar" is retired; read as Dock state) |
| 0069 r11 host resolves the same table; malformed 400; unresolved 404 plus not-found surface; never pick another entity | same table → NV-80. Never substitute → NV-24. Statuses sent → ST |
| 0069 r12 `/` redirects to the Meta Space | → NV-25 (redirect status sent → ST) |
| 0069 cross-Space query value | dropped: deferred by 0111 |
| 0069 Entry Space, Computed View collisions | dropped: retired (0077, 0078, 0079) |
| 0079 a Map is the only selectable canvas context | sent → MG (MG-6) |
| 0079 obsolete identities invalid; obsolete URLs not found | obsolete URLs folded → NV-21 (any other shape is malformed). Note: the host answers 400 for a malformed shape (ST), so "not found" reads as "resolves to nothing". Identities sent → ST |
| 0079 opening via a Space Resource, Entering or drawing needs an initialized target | sent → MG (MG-75), SR |
| 0079 choosing a Map is navigation, not an Edit | → NV-6 |
| 0081 r1 Navigation answers a derived `NavigationAddress` | → Terms, NV-78 |
| 0081 r2 Navigation imports no URL type, never reads `window.location` | → NV-78 |
| 0081 r3 pure function decides push/replace/none | → NV-29, NV-30, NV-31, NV-79 |
| 0081 r4 the addressed Resource is read from the URL, never written back | → NV-12 |
| 0081 r5 decided in an effect; one entry per committed address; `popstate` does not push | one entry per operation → NV-29; `popstate` → NV-31. "Decided in an effect, so two operations in one tick net to one entry" dropped: it is the ADR's accepted cost, not a rule, and the code decides synchronously (`browser-location.ts` `settle`), so two operations in a tick write two entries |
| 0081 r6 self-Edge advance or same-Resource retreat writes nothing | → NV-31 |
| 0081 r7 do not compare `getState()` around a call site | folded → NV-79 |
| 0082 the canvas takes one exclusive Map choice, no empty value | → NV-5. The control sent → UI |
| 0082 activating a Graph is not that choice and never merges with it | sent → UI (control) |
| 0082 selecting is navigation, not an Edit | folded → NV-1, NV-9 |
| 0082 the surface names the current Space and reaches the open Spaces, an unwell one distinguishable | reach and mark folded → NV-45, NV-46. Surface sent → UI |
| 0082 presenting removes the whole command surface | folded → NV-60 |
| 0111 r1 presentation URL shape, no query value | → NV-21, NV-26. "Carries no query value" is narrowed by 0130 (later, built) to "no presentation state in the query", with `source` riding along: drafting rule 1 (NV-26, NV-36) |
| 0111 r2 presentation never crosses a Space boundary; query deferred | → NV-54; Open questions |
| 0111 r3 names the current Resource; linear history decided in `app`; navigation, never authoring | folded → NV-27, NV-79, NV-22 |
| 0112 only the canvas's own Space presents | → NV-54 |
| 0112 one canvas selection names its occurrence | → NV-11. Occurrences sent → SR |
| 0112 a Space is composed while anything holds it; Exit releases only the listing | → NV-81 (navigation owns holds, per the coordinator; SR and RD sent it here) |
| 0112 navigation held while any composed Space replaces an image | → NV-50 |
| 0112 one camera; per-occurrence continuation; policy; notices | sent → RD, SR, UI |
| 0116 choosing or viewing a Map records nothing | → NV-6 |
| 0116 canvas and drawn Edit writes | sent → MG (MG-79, MG-80) |
| 0123 r1 Stage fills the window; canvas mounted, inert, unreachable, unfocusable, not shown | → NV-59 |
| 0123 r2 Stage offers no authoring | → NV-60 |
| 0123 r3 traversal unchanged; chrome reads outgoing Edges at render | → NV-60 (new Edge available), NV-64 |
| 0123 r4 Stage draws by kind through resolved content | → NV-61 |
| 0123 r5 position, size, Shape, Open/Closed never reach the Stage | → NV-62 |
| 0123 negatives: no presenting on the canvas, no authoring on the Stage, not a deck | folded → NV-59, NV-60, NV-15 |
| 0123 "frame, typography, fit, fullscreen, transitions are treatment" | Frame and fullscreen kept under drafting rule 5 (tested, contradicted by nothing) → NV-63, NV-58. Typography and transitions dropped: no behaviour to state |
| 0126 every Space withdraws navigation while any composed Space replaces an image; pan and zoom stay | navigation → NV-50. Authoring withdrawal, exclusivity, timeouts sent → ED |
| 0129 r1 notes are ordinary Resources linked by a Graph found by title | → NV-67 |
| 0129 r2 match rules (markers, NFKC, case folding, separators) | → NV-67 |
| 0129 r3 precedence; never its own notes | → NV-67, NV-68 |
| 0129 r4 a note is reached by an Edge; ordered top then left | → NV-69 |
| 0129 r5 Notes window with its own URL follows the presenting window; presenting window owns Navigation; sends traversal commands | → NV-72, NV-74, NV-75 |
| 0129 r6 when a presentation starts; notes hidden, timer and identity reset | → NV-57 |
| 0129 r7 no authoring in the Notes window; never store the chosen Graph | → NV-72, NV-70 |
| 0129 r8 Notes window names the chosen Graph and those passed over | → NV-73 |
| 0130 resolved source recorded in the address; `replaceState` only on change; bare domain uses the default | → NV-38. Build default sent → ST |
| 0130 presentation messaging scoped by repository, directory, commit, Space | → NV-77 |
| 0130 `source` overrides and is kept on every product URL | → NV-36 |
| 0130 `/` resolves in the client to Meta | folded → NV-25 |
| 0130 unknown URL answered by the app's not-found, not 404 | → NV-39 |
| 0130 everything else (GitHub reading, seam, reader, images, CSP) | sent → ST |

| 0092 Copy link to Target | → NV-28 (Jump to Target is SR-35) |
| 0113 Ur presents as its Title | → NV-61 |
| 0135 the Stage is unchanged by Graph emphasis | → NV-62 |
| 0070 Jump to Target (not built) | sent → SR (SR-35) |
| 0130 r5 one build, optional default; with neither, the page asks | default written into the location → NV-38. The build default itself and asking for a source sent → ST |

## 3. Items received from other traces

### From `trace/maps-and-graphs.md`

| Item | Disposition |
|---|---|
| R30, 0015 r2: an empty Graph cannot be presented; Present disabled | → NV-52, **built**, not undecided. MG's trace said no test covers it and no source but code and `CONTEXT.md`; both are wrong now: 0015 r2 states it ("A Graph with no Edges cannot be presented, and Present is offered disabled", per the mapping table), and `app/e2e/new-space.spec.ts` › "shows the empty initial Graph and its graph HUD" asserts the disabled control. Drafting rule 5 would settle it anyway |
| MG-43: the Active Graph also changes by choosing a Map, following a URL, presenting | → NV-6, NV-22, NV-53 |
| R8 URL | → NV-21 |
| R10, 0031s, 0079, 0116 "choosing or viewing a Map writes nothing" | → NV-6 |
| R30, 0015 r2 Present control | → NV-52 |
| R49, 0121 a presented Resource is the rectangle | → NV-62 |
| 0032 r3 presenting owns cycle traversal; nothing advances automatically | → NV-16 |
| 0041 r3–4 Traversal history | → NV-16, NV-19 |
| 0129 Presentation Notes | → NV-67–NV-77 |

### From `trace/editing.md`

| Item | Disposition |
|---|---|
| 0035 r4, r9 navigation side | → NV-2, NV-4 |
| 0042 r8 selection and Traversal history clear on replacement | → NV-4 |
| EP 46 presenting continues only while the adopted Graph holds the presented Resource | → NV-56 |
| 0068 r16 switching waits for an in-flight commit | → NV-47 |
| 0068 r18, EP 39 Exit refuses on `failed`/`conflicted`, a size rejection or blocked recovery; warns on `rejected` and `refused` | → NV-85, NV-86, NV-84 (C3) |
| EP 39 opening a Space with a live session uses that session | → NV-81 |

### From `trace/rendering.md`

| Item | Disposition |
|---|---|
| 0024 presenting traverses; no deck; no `isLinear`; revisits | → NV-15, NV-16 |
| 0028 activation as navigation | struck by DEC 1; NV-8 states what switching shows |
| 0068 r9 Enter and new tab | → NV-40, NV-41 |
| 0070 Jump to Target (not built) | sent → SR (SR-35): navigating to the Target is SR's rule |
| 0082 selecting is navigation | → NV-1, NV-9 |
| 0121, R49 presented rectangle | → NV-62 |
| 0123 Stage | → NV-59–NV-62 |
| 0129 Presentation Notes | → NV-67–NV-77 |
| 0135 Stage unchanged | → NV-62 |
| G§Camera b3 Stage, fullscreen, chrome, presenting keys | → NV-58, NV-59, NV-63–NV-66 |
| G§Camera b4 rehearsal notes | → NV-71 |
| 0112 holds | → NV-81 |

### From `trace/space-and-resources.md`

| Item | Disposition |
|---|---|
| 0001 r3 moving between levels | → NV-3, NV-40 |
| 0068 r9 Enter and new tab; r11–r18 | → NV-40–NV-48, NV-85–NV-88 |
| 0092 Copy link to Target | → NV-28 |
| 0112 selection per occurrence | → NV-11 |
| 0112 holds and Exit | → NV-81 |
| 0112 only the canvas's own Space presents | → NV-54 |
| 0113 Ur presents as its Title | → NV-61 |
| E&P line 38 Enter seeds from the selection | → NV-40 |

### From `trace/storage.md`

| Item | Disposition |
|---|---|
| 0069 URL shapes, spelling, context, history | → NV-20–NV-32 |
| 0130 r3 resolved source recorded in the address | → NV-38 |
| 0130 r4 presentation messaging scoped by source and Space | → NV-77 |
| 0130 r5 `source` overrides and rides every URL; build default; else ask | → NV-36, NV-38. Asking for a source with neither: bounced, owned by ST (reading the mount), pointer in NV-38 |
| 0130 r11 `/` resolves in the client | → NV-25 |
| Lifecycle: Map resolution (one module answers the Map) | folded → NV-5, NV-6. The five names `map-resolution.ts` exports are §6 |

### From `trace/ui.md`

| Item | Disposition |
|---|---|
| 0082 selecting is navigation | → NV-1, NV-9 |
| G18 presenting withdraws the Dock; the chrome carries the way out | → NV-60, NV-64 |
| G18 a persistence failure and Retry stay reachable while presenting | → NV-83 |
| Presenting keys (`PRESENTING_KEYS`) | → NV-65 |
| G22, 0068 r12–r15, r17 Open Spaces menu, Escape, conflict dialog | → NV-45, NV-48, NV-88 |
| 0042 r8 selection and Traversal history clear | → NV-4 |
| G26 presented-title CSS order and Stage CSS | dropped: styling, not behaviour. The `.rf-resource-node--active` rule the guide names is no longer in the code (`git grep` finds none), and NV-59 forbids an active-Resource flag on the canvas |
| Arrow keys along the Active Graph and `P` | → NV-13, NV-51 (UI-10 names the keys) |

## 4. Sent to other docs

**maps-and-graphs.md (MG):** 0026s r1–3, 0028 r2–4, 0031s r2, 0041 r10 (connection), 0079 (Map the only canvas context; initialized target), 0116 Edit writes.

**space-and-resources.md (SR):** 0001 r3 (Maps per Space), 0068 r5, r9 (embedding), r10; 0079 initialized target; 0112 occurrences, policy, continuation; 0070 Jump to Target.

**editing.md (ED):**
- 0035 r4 (session and authoring side), r9 (replacement).
- 0042 r8 (drafts cancel, surfaces close).
- 0068 r18 persistence statuses; the `refused` status Exit warns on.
- 0126 authoring withdrawal, exclusivity, upload and measurement timeouts.

**storage.md (ST):** 0069 r11 statuses (400, 404) and r12 redirect status; 503 with no Meta; 0079 obsolete identities; 0130 mount reading, default source at build, asking for a source when there is none, seam, reader, images, CSP.

**rendering.md (RD):** 0068 r19 entered camera; 0112 one camera; rendering.md line 62 emphasis; where an entered Space's camera starts (`cameras.test.tsx`).

**ui.md (UI):**
- 0065 r6 focus after title editing.
- 0082 the Map choice control, Graph control kept apart, Dock reaching Open Spaces.
- Graph navigation keys (NV-13), P and Present from Here keys.
- Copy link and Open in New Tab wording.
- 0042 r8 canvas focus after replacement.

**CONTEXT.md (GL):**
- 0041 r3 vocabulary (Graph navigation, Traversal history, "walk" retired).
- Correction if C2 goes to (a): "Graph navigation" and "Traversal history" stop claiming traversal rules and history for the canvas.
- "Active Graph": "Activating is not itself an edit" contradicts DEC 1.

## 5. Code only (drafting rule 5)

NV-7, NV-9, NV-10, NV-11 (no source names the shared selection beyond 0112's sentence), NV-14, NV-17, NV-18, NV-28, NV-32, NV-33, NV-34, NV-35, NV-37, NV-43–NV-45 (Opener and Meta listing: `CONTEXT.md` and 0112's mention only), NV-56, NV-58, NV-63, NV-64 (chrome contents), NV-65, NV-66, NV-71, NV-73 (moves preview and timer, beyond 0129's "names the chosen Graph"), NV-75, NV-76, NV-89–NV-91, NV-81 (its "opening uses the live session" part), NV-83, NV-85 (the size rejection and blocked recovery), NV-87 (the URL reopening).

## 6. Code notes (not requirements)

- **Modules.** `navigation.ts` (state, address, traversal), `destination-coordination.ts` (`destinationSync`), `browser-location.ts` and `browser-history.ts` (the one browser adapter; `window` is named in `space.ts` `browserHistory()` and read once in `main.tsx`), `destination-opening.ts`, `open-spaces.ts`, `presenting-window.ts`, `presentation-link.ts` over `browser-presentation-channel.ts` (`BroadcastChannel`), `presenting-fullscreen.ts` over `browser-fullscreen.ts`, `graph/src/presentation-notes.ts`, `graph/src/traversal.ts`, `http/src/product-destination.ts`.
- **History mechanics.** The adapter numbers entries in `history.state` (`hyperHistoryIndex`), numbers a fragment entry on arrival, and returns a held traversal by key through `navigation.traverseTo` where available, else `history.go`. A foreign same-document `pushState` goes uncounted.
- **`moves()`** is called at render, not memoised and not in a store selector; effects key on the changed value, never on the array.
- **Fullscreen** is requested synchronously in the Present gesture on `document.documentElement`, so portalled dialogs stay visible.
- **`refused` at Exit and in the mark** is C3 (NV-84).
- **Presenting chrome primitives.** `PresentingChrome` draws its moves, Back, `Kbd` key hints and Overview from `@project/ui` and keeps its styling in its own module.
- **Map resolution.** `map-resolution.ts` exports `requireDefaultMap`, `resolveMap`, `mapResources`, `resourcesOutsideMap` and `MapNotFoundError`.
- **History decisions are synchronous.** `browser-location.ts` `settle` runs `sync()` on each authoring notification; repeat decisions are no-ops.
- **Stale comment.** `navigation.ts` (`advance`) says presenting admits "a pointer connection". The Stage offers no authoring (NV-60), so the comment predates the Stage.
- **`continueInMap`'s refusal** throws for a Graph the adopted Map does not draw; no product path reaches it.
- **`destinationOpening`** opens the Space at its default Map for a `notes` destination; only a caller outside startup reaches it.
