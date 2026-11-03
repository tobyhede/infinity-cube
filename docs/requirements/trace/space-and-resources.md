# Trace: Space and Resources

For audit only. Every source rule appears exactly once in §1–§3, with one of four dispositions:
- **→ SR-n**: kept.
- **folded → SR-n** (or MG-n): the source restates or implies a kept rule.
- **dropped**: with the reason.
- **sent → DOC**: it belongs to another doc.

§4 checks off the items every other trace sent here. §5 groups this doc's sends by receiving doc. §6 lists code-only rules. §7 holds code notes.

Abbreviations: "rN" is the Nth rule of an ADR as numbered in the mapping tables (`map-*.md`). "DEC n" is ruling n in `../DECISIONS.md`. Docs: MG maps-and-graphs.md, ED editing.md, ST storage.md, RD rendering.md, UI ui.md, NV navigation.md, GL `CONTEXT.md`, PROC process docs. "E&P" is `docs/agents/editing-and-persistence.md`; "ARC" is `docs/agents/authoring-refusal-cascade.md`.

The rule ids in `../space-and-resources.md` are append-only from this version on.

## 1. ADRs

| Source | Disposition |
|---|---|
| 0001 r1 a Space Resource holds another Space; nesting to any depth | → SR-2 |
| 0001 r2 one primitive, no "subgraph" | folded → SR-2 |
| 0001 r3 Maps, Graphs, navigation per Space | Maps/Graphs → SR-2. Moving between levels sent → NV |
| 0001 "viewer opens and explores in place" | folded → SR-49 (Open draws the selected Map) |
| 0004 r1 Edges reference Resources by id; no placement layer | sent → MG (folded there into MG-5) |
| 0004 r2 one position per Map; reuse via Reference | Reference half → SR-29. Position half is MG-5 |
| 0004 r3 revisit not unrolled; r4 no placement array | sent → MG (MG-36, MG-5) |
| 0009 r1 pointer not content; lazy, non-destructive, never flattened | → SR-29 |
| 0009 r2 single hop; Reference may not be a Target; no cycle check | → SR-30 |
| 0009 r3 every reader goes through the resolver | folded → SR-29 ("resolves on read"). The resolver's package is a code note (§7) |
| 0009 r4 own Title; only content from the Target | folded → SR-32 |
| 0009 "in `graph`, not `core`"; `alias-targets-alias` | dropped: code differs and later ADRs (0113, 0128) put resolution in the kind modules; the code is `reference-target-not-targetable` (SR-30) |
| 0009 "same content again" signal | sent → RD (glyph) |
| 0016 r1 an entity has exactly one id | → SR-5 |
| 0016 r2 tests never mock `crypto.randomUUID` | sent → PROC (anti-slop.md, 0109) |
| 0016 rest (second uuid, v5/v7, file-path identity) | dropped: rejected ADR |
| 0020 r1 one Resource one file; directory is inventory | sent → ST |
| 0020 r2 identity from the file's `id`, never its path | sent → ST |
| 0020 r3 duplicate Resource id is an intake error | folded → SR-6 |
| 0020 r4 default order by Title | → SR-10. The code also breaks ties on id; no test asserts it, so it is not stated (§7) |
| 0020 r5 `loadSpace` pure, takes files | sent → ST |
| 0020 r6 no directory per kind | sent → ST |
| 0039 r1 opening shows the Target's content, one hop | folded → SR-33 |
| 0039 r2 the Reference stays the opened subject, keeps its Title | folded → SR-32 |
| 0039 r3 a Reference has no content of its own | folded → SR-29 |
| 0039 r4 its Title authored inline like any Resource's | sent → UI (the control). The data half is SR-32 |
| 0039 completing writes the Target | dropped: 0070 (later) and the code make the Target's content read-only through a Reference (drafting rule 1) |
| 0040 r1 a Space owns Resources and Maps | Resources → SR-1. Maps is MG-1 |
| 0046 r1 a Reference's own Title is authored on it, never on its Target | → SR-32 |
| 0046 r2 renaming any Resource to blank is refused | folded → SR-13 |
| 0046 r3 never one field authoring two Resources' Titles | sent → UI |
| 0046 Target field; empty-Title creation fallback | dropped: 0070 makes the Target immutable; 0089 replaces the fallback with copying the Target's Title (SR-38). Drafting rule 1 |
| 0051 r1 one shared field beyond identity and kind: the Title | → SR-8 |
| 0051 r2 everything else is the kind's | folded → SR-8 |
| 0051 r3 no shared Description, subtitle, summary, excerpt or second slot | folded → SR-8 |
| 0051 r4 a kind does not vary geometry | folded → MG-22 (one floor for every kind). Drawing sent → RD |
| 0063 r1 Markdown content is literal source, never normalised | → SR-21. Export's line-ending canonicalisation sent → ST |
| 0063 r2–r5 CodeMirror wrapper, key policy, no toolbar, lazy boundary | sent → UI |
| 0068 r1 Space Resource references a Space and selects Map and Graph; many may reference one | → SR-44, SR-45 |
| 0068 r2 reference immutable | → SR-45 |
| 0068 r3 converge, never cycle (`space-reference-cycle`) | folded → SR-45 |
| 0068 r4 create a new Space with it, or point at an existing one; same shape | → SR-41, SR-43 |
| 0068 r5 selection belongs to the Space Resource; target's defaults untouched; one stored selection per Resource | → SR-46. Confirmed by DECISIONS C2 |
| 0068 r6 omitted selection resolves from the target | dropped: 0079 (later) and the code make the selection required (SR-44) |
| 0068 r7 a Space with no Graph | dropped: lapsed; every Map owns a Graph (MG-34) |
| 0068 r8 UI-created Space: first Markdown Resource, Map, empty Active Graph, one Edit, default Map | → SR-40 |
| 0068 r9 Open embeds the selected Map; Enter; new tab | embedding → SR-49. Enter and new tab sent → NV |
| 0068 r10 editing inside authors that Space; moving the Space Resource authors the containing Map | → SR-49 |
| 0068 r11–r18 entered selection, Open Spaces, switching, Exit | sent → NV (statuses → ED) |
| 0068 r19 entered Space has its own camera | sent → RD |
| 0068 r20 removing a Space Resource removes its Edges | sent → MG (MG-19) |
| 0068 "reference is not ownership; Delete Space refused while referenced" | dropped: 0074 (later) and the code (drafting rule 1) |
| 0068 refuse deleting a selected Map or Graph | dropped: 0091 and the code relocate (MG-15, MG-55) |
| 0068 Space View / Computed View namespace | dropped: retired by 0079 |
| 0068 cross-Space Edges, and refusing deletions they target | moved to open questions by DEC 6; the question lives in maps-and-graphs.md, and SR points to it |
| 0068 compound vs nested canvas | sent → RD ("one camera", 0112) |
| 0070 r1 Target chosen once, never retargeted | → SR-31 |
| 0070 r2 otherwise an ordinary Resource | → SR-32 |
| 0070 r3 Open keeps its Title, draws Target content read-only | → SR-33 |
| 0070 r4 Markdown Target: rendered, no source editor; open the Target to author | folded → SR-33. "No source editor" sent → UI |
| 0070 r5 Space Resource Target: cannot change its selection | folded → SR-34, SR-51 (read-only through a Reference) |
| 0070 r6 reuse the Target kind's renderer, read-only | sent → RD |
| 0070 r7 Close and Resize persist the containing Map | folded → SR-32 |
| 0070 r8 Jump to Target | → SR-35 (not built) |
| 0070 r9 no Target, source or selection controls on an Open Reference | sent → UI |
| 0070 r10 wrong Target: delete and create; retargeting refused | folded → SR-31 |
| 0074 r1 Space Resources share ownership; last delete deletes | → SR-57 |
| 0074 r2 deleting a Space deletes the Space Resources it held; cascade | folded → SR-57 |
| 0074 r3 one permanent Meta Space | → SR-55 |
| 0074 r4 every ordinary Space created by its first Space Resource | folded → SR-55 |
| 0074 r5 no Delete Space command | folded → SR-57 |
| 0074 r6 reference counting is the whole rule; no sweep | folded → SR-57 |
| 0074 r7 a destructive action says its reach and asks first | sent → UI |
| 0074 "V1 has no undo" | sent → ED (DEC 5) |
| 0074 Meta/Entry Space section | Meta identity sent → ST. Entry Space dropped: retired, marked out of date in the file |
| 0079 a Space Resource selects a Map and a Graph | folded → SR-44 |
| 0079 Space Resource Edits need an initialized target | → SR-61 (link initializes first). Which reads initialize is MG-75 |
| 0079 other parts | sent → MG (see MG trace) |
| 0083 r1 Title Lines in one string; breaks significant | → SR-11 |
| 0083 r2 first line is the name; lists, references, accessible names show it | name → SR-11. Which surfaces show it sent → UI |
| 0083 r3 roles title/subtitle/caption, no limit | folded → SR-11 |
| 0083 r4 not a description or second slot | folded → SR-11 |
| 0083 r5 `titleLines`/`titleName` in core; no ad-hoc split | §7 code note; sent → PROC |
| 0083 r6 the Resource draws the ladder, Open or Closed | sent → RD |
| 0083 r7 heading named by Title Lines; Title control wraps the heading | sent → UI |
| 0083 r8 search filters the whole Title, shows the name | sent → UI |
| 0083 r9 authored vs wrapped break; clamp per role | sent → RD |
| 0083 r10 a Title never resizes a Resource | sent → RD (MG-22 holds the size side) |
| 0083 r11 normalisation; empty is a refusal with a stable code | → SR-12, SR-13 |
| 0083 r12 same Title plus a newline is unchanged | folded → SR-13 |
| 0083 r13 `nextResourceTitle` scans first lines | → SR-37 |
| 0083 r14 multiline only for Resources; Space, Map, Graph single-line | → SR-14; Space → SR-3 (bug); Map/Graph is MG-8 |
| 0083 r15 Enter, Escape, Shift+Enter; field grows | sent → UI |
| 0083 an unnamed Reference mints `Resource N` | dropped: 0089 (later) and the code copy the Target's Title (SR-38) |
| 0083 YAML block scalar | dropped: Resource files are JSON (0128) |
| 0089 r1 one activation: place, select, caret; no pane, picker or Cancel | → SR-36. Select and caret sent → UI (SR-42 no longer names the caret) |
| 0089 r2 values from context: Reference from its Target; Space Resource makes its Space | → SR-36, SR-38, SR-41 |
| 0089 r3 referencing an existing Space is a separate gesture | → SR-43. The list row and drag sent → UI |
| 0089 r4 a new Reference copies its Target's Title once | folded → SR-38 |
| 0089 r5 Space Resource placed optimistically; refusal names what died | → SR-42. Refusal channel sent → UI |
| 0089 r6 one `Space N` for Space and Resource, over the containing Space's titles | → SR-41 |
| 0089 r7 Create Reference drawn but disabled on a Reference | sent → UI. Domain half is SR-30 |
| 0089 r8 negatives: no creation pane; no picker; never await the commit | folded → SR-36, SR-42 |
| 0092 Reference Resource name; Space Resource is not one | sent → GL |
| 0092 Jump to Target, Copy link to Target | Jump → SR-35. Copy link sent → NV, UI |
| 0106 kind `image`; content is a URL; no bytes, no flag | → SR-23 |
| 0106 accepted URLs; `data:` and others refused | → SR-24 |
| 0106 stored images at `/images/<id>`, SHA-256 id, formats, 10 MiB, codes | sent → ST |
| 0106 no stored image deleted singly | sent → ST |
| 0106 Replace is one Edit keeping identity, Title, placement, Edges; same URL unchanged | → SR-22 |
| 0106 Title is the text alternative | → SR-25 |
| 0106 natural size measured when the URL is set | → SR-26 (C1); SR-22, SR-23 and SR-39 point to SR-26 rather than state it. First-Open sizing dropped: retired by 0122 |
| 0106 an image that will not load is not a refusal | → SR-27 |
| 0106 a Reference may target an Image Resource | folded → SR-30 |
| 0106 creation on activation; several pictures one Edit; `Resource N` | → SR-39 |
| 0106 external bytes are not the repository's; Export carries URL only | sent → ST (Export narrowed by 0118) |
| 0106 fixtures store tracked files | sent → ST |
| 0112 a drawn Map offers every command, gesture, refusal and notice; else a defect | → SR-50 |
| 0112 per Space: authoring, outcomes, confirmation, replacement, Edge completion | folded → SR-50 |
| 0112 occurrence per drawing | → SR-54 |
| 0112 selection, continuation and gesture state keyed by occurrence | sent → NV (selection), UI (continuation) |
| 0112 policy: lower of ceiling and local state; read-only sources; inert below level one; Edit only in the canvas's own Map | → SR-51, SR-52 |
| 0112 an authoring drawn Map still opens, closes, moves its Space Resources | folded → SR-52 |
| 0112 composition holds; Exit releases only the listing | sent → NV: NV-81 owns it (coordinator ruling); SR points to it under Drawn Maps |
| 0112 keyboard, rail and Undo act on the selected occurrence; Dock on the canvas's Space; pointer gestures land under the point | → SR-60 (ui.md sends "which Space a command acts on" here). Undo sent → ED |
| 0112 one notice area | sent → UI |
| 0112 navigation held while replacing an image | sent → ED (with 0126) |
| 0112 a drawn Map never contains its own Map | folded → SR-54 |
| 0112 recorded differences | listed in SR-50: presenting → NV, one camera → RD, no nested framing → SR-52, Edge in one Space → MG-59 (wording → UI), drops refused → SR-53 |
| 0113 every capability is a Resource's; a kind only adds | → SR-18 |
| 0113 availability may depend on interaction state | sent → ED |
| 0113 Reference is the terminal exception | folded → SR-30 |
| 0113 Ur: no content, no Edit, may be a Target, kind fixed | → SR-28; kind fixed → SR-16 |
| 0113 Ur created as a Dock peer on activation | folded → SR-36. The Dock sent → UI |
| 0113 Ur presents as its Title, a stop | sent → NV |
| 0113 "Open is the ordinary Open" for Ur; "a kind that cannot Open" rejected | dropped: reversed by 0122 (MG-28) |
| 0113 rejected options (self-target, empty Markdown, pass-through) | dropped: rejected alternatives |
| 0114 canvas facts from resolved content; Reference takes its Target's | → SR-34 |
| 0114 a Reference's kind decides only content actions: none | folded → SR-33 |
| 0114 kind glyph decided by stored kind | sent → RD |
| 0114 first-Open size and resize floor | dropped: retired by 0122 |
| 0120 kind is a behaviour; media type is a format; `kind` never a media type | folded → SR-17 |
| 0120 kinds declare media types; creation picks kind by media type | → SR-19 (not built, DEC 6) |
| 0120 kinds are modules; domain names no kind | → SR-15 |
| 0120 compiled in; runtime kinds kept possible | folded → SR-9 (content crosses unparsed), SR-17 (namespaced ids) |
| 0120 bare built-in ids; `vnd.<owner>.<name>` | → SR-17 |
| 0120 Ur, Reference, Space not content kinds | sent → GL (Terms block points to it) |
| 0120 any content kind and Ur can be a Target | folded → SR-30 (every kind but Reference; 0070 adds Space Resource) |
| 0120 unregistered kind refused | → SR-16 |
| 0120 domain half wherever intake runs; view half only in the app | → SR-20 |
| 0120 missing kind = Ur; `kind` optional | dropped: reversed by 0128 |
| 0122 Open only for kinds with content; Ur refused | sent → MG (MG-28) |
| 0125 Closed or Open at the entry's size; "front" names nothing | sent → GL; Open/Closed is MG-27 |
| 0128 every kind a module; domain names no kind | folded → SR-15 |
| 0128 envelope `{ id, title, kind, content }` everywhere; content unparsed | → SR-8, SR-9 |
| 0128 Resource file `resources/<id>.json`; identity inside | sent → ST |
| 0128 content locator; Markdown sidecar; Image URL form only | sent → ST |
| 0128 `kind` required; strict at both levels | required → SR-16; strictness sent → ST |
| 0128 kind id characters | folded → SR-17 |
| 0128 aggregate rules from declarations: Target, single hop, no cycles, lifetime, rooting; one narrow module check | → SR-30, SR-45, SR-56, SR-57; module check → SR-44 |
| 0128 Map rules by kind are flags | folded → SR-15; the rules are MG-28, MG-30 |
| 0128 JSON Schema in `docs/schema/resource/` | sent → ST |
| 0128 domain and view halves stand | folded → SR-20 |
| DEC 6 media types kept, not built; cross-Space Edges to open questions | → SR-19; Open questions |
| DEC C2 switching Graphs in an Open Space Resource writes only its selection | → SR-46 |

## 2. Guides

| Source | Disposition |
|---|---|
| E&P line 5: Target immutable; `reference-target-immutable` | folded → SR-31. "No surface offers a Target" sent → UI |
| E&P line 25: envelope; kind id rule; unregistered refused | folded → SR-8, SR-16, SR-17 |
| E&P line 25: file, sidecar, locator, strictness, codec, discovery, identity not file name, duplicate across files | sent → ST (duplicate id folded → SR-6) |
| E&P line 25: Image URL form; `image-url-unsupported` | folded → SR-24 |
| E&P line 25: "body" is not a word | sent → GL |
| E&P line 37: five lifecycle operations; coordination, barrier, recovery refusals | operations → SR-41, SR-43, SR-59 (Map/Graph deletion is MG). Coordination sent → ED |
| E&P line 37: Map deletion resets framing, Graph deletion keeps it | sent → MG (MG-15, MG-55) |
| E&P line 37: last reference deletes the closure; convergence keeps a target | folded → SR-57 |
| E&P line 37: `referenceableSpaces` withholds the containing Space | folded → SR-43 |
| E&P line 37: create keeps what `initializeSpace` minted; link initializes first, records `defaultMap` and its Active Graph; `space-resource-target-unavailable` | folded → SR-41, SR-43 |
| E&P line 37: initialization after the containing Space's own checks | → SR-61 (coordinator ruling; editing.md sent it back) |
| E&P line 37: Space Authoring refuses `space-resource-deletion-unsupported`; confirmation says the Space may go | refusal → SR-59; confirmation sent → UI |
| E&P line 38: selection required; no fallback; dangling codes | folded → SR-44 |
| E&P line 38: `ordinary-space-unreferenced` forgiven for the initializing Edit | sent → ST: ST-104 owns it (reconciliation ruling: the commit decision sits behind the backend); SR-56 points to it |
| E&P line 38: Enter seeds from the selection | sent → NV |
| E&P line 38: round trip; fixture advice | sent → ST |
| ARC `edited-resource` row | folded → SR-13, SR-16, SR-31, SR-45 |
| ARC `created-resource`, `created-reference` rows | folded → SR-36, SR-30 |
| ARC `deleted-resource` row | folded → SR-58, SR-59 |
| ARC `renamed-space` row | folded → SR-3 |
| ARC `image-url-unsupported` has no row | folded → SR-24 |
| ARC universal guard, other rows | sent → ED (guard), MG (Map, Graph, Edge rows) |
| `CONTEXT.md` "Replacing it — planned, not yet built" | sent → GL: wrong, Replace is built (SR-22) |
| `CONTEXT.md` short Title | sent → UI, flagged: 0083 says listing surfaces show the name only; the code and `CONTEXT.md` use `shortTitle` (name plus ellipsis). UI must raise it |

## 3. Code only (no source)

See §6.

## 4. Items received from other traces

### From trace/maps-and-graphs.md

| Item | Where |
|---|---|
| R14, 0018 r1, 0068 r8, 0080: new Space complete, `Resource 1` Closed at the origin of `Map 1`, every creating path | SR-40 |
| MG-15, MG-55, MG-56 cross-refer for Space Resource selection | SR-44, SR-46, SR-47 (selection); relocation stays MG |
| 0040 r1 the Space owns Resources | SR-1 |
| 0079 a Space Resource selects a Map and Graph; its Edits need an initialized target | SR-44, SR-61 |
| 0112 a drawn Map offers every canvas command; occurrences; policy; never contains its own Map; drops on inert Maps refused | SR-50, SR-54, SR-51, SR-52, SR-53 |
| 0083 a Space title is single-line | SR-3 (bug) |
| Content shown twice is a Reference Resource (from MG-5) | SR-29 |

### From trace/editing.md

| Item | Where |
|---|---|
| EP 5, 0070: Target immutable (`reference-target-immutable`) | SR-31 |
| CAS checks and codes for `edited-resource`, `created-resource`, `created-reference`, `deleted-resource`, `renamed-space`, and `image-url-unsupported` | Operations index, Checks column (in order); SR-13, SR-16, SR-24, SR-30, SR-31, SR-45, SR-58, SR-59, SR-3 |
| EP 37: zero-reference cascade; convergence | SR-57, SR-45 |
| EP 37: `referenceableSpaces` read | SR-43 |
| EP 37: `target` read (a target's Maps and Graphs, live where open) | sent → UI: it feeds the choices the selection control offers; the stored result is SR-46 |
| EP 37: selection resolved by the lifecycle; `space-resource-target-unavailable` | SR-41, SR-43, SR-61 |
| EP 37: initialization inside `prepare`, after the containing Space's checks | SR-61 |
| EP 37: `space-resource-deletion-unsupported` | SR-59 |
| EP 38: selection durable; dangling-reference codes | SR-44 |
| 0089: placement does not await its commit; a refused creation removes it | SR-42 |
| 0063 r1, 0120, 0128 kind model | SR-21, SR-15 to SR-20 |

### From trace/navigation.md

| Item | Where |
|---|---|
| 0001 r3 Maps per Space | SR-2 |
| 0068 r5 selection belongs to the Space Resource | SR-46 |
| 0068 r9 embedding, r10 which Space an Edit authors | SR-49 |
| 0079 initialized target | SR-61 |
| 0112 occurrences, policy | SR-54, SR-51 |
| 0112 holds | not here: NV-81 owns it (coordinator ruling); SR points to it |
| 0112 continuation | not here: UI-87 states it (spent in the drawing that asked) |

### From trace/rendering.md

| Item | Where |
|---|---|
| 0018 r1 new Space | SR-40 |
| 0070 Target immutability; Space Resource as Target | SR-31, SR-30 |
| 0083 Title Lines as data; normalization | SR-11, SR-12, SR-13 |
| 0106 kind, URL, recorded natural size, load failure | SR-23, SR-24, SR-26 (C1), SR-27 |
| 0112 policy, occurrences, never contains its own Map | SR-51, SR-54 |
| 0114 content actions | SR-18, SR-33, SR-34 |
| G§b7 content resolution | SR-29 |

### From trace/storage.md

| Item | Where |
|---|---|
| 0020 r3 Resource id uniqueness | SR-6 |
| 0106 r1–r2, r6–r11 Image kind, URLs, Replace, alt, natural size, load failure, Reference to an Image, creation | SR-22 to SR-27, SR-30, SR-39 |
| 0128 kind model, declared references, flags, Target, single hop, cycles, lifetime, rooting, halves | SR-15 to SR-20, SR-30, SR-45, SR-56, SR-57 |
| Which aggregates are valid (Meta sole root, unreachable Spaces, duplicate Resource ids) | SR-55, SR-56, SR-6 |
| Deleting Meta is refused at commit | SR-55 |
| 0070 Target immutability | SR-31 |
| A Space Resource's durable selection; `ordinary-space-unreferenced` forgiveness | SR-44; forgiveness is ST-104, pointed to from SR-56 |

### From trace/ui.md

| Item | Where |
|---|---|
| G8, 0070 Target immutable; read-only descendants; authored like any Resource | SR-31, SR-51, SR-32 |
| G14, G25, 0089 creation on activation; no pane; Space Resource chooses nothing; linking | SR-36, SR-41, SR-43 |
| 0063 r1 Markdown stored literally | SR-21 |
| 0112 drawn-Map policy | SR-51 |
| 0112 which Space the Dock, keyboard and toolbar act on | SR-60 |
| 0112 one notice area | not here: it is where a notice shows, a UI rule (boundary: a surface with a role); returned to UI in the final reply |
| 0112 a drop on an inert Map refused | SR-53 (the code); UI-90 says where the refusal shows |
| 0074 ownership and cascade | SR-57 |

## 5. Sent to other docs

**maps-and-graphs.md (MG):** 0004 r1, r3, r4; 0051 r4 (MG-22); 0068 r20; 0079 Map parts; 0122 Open rule; E&P framing on relocation.

**editing.md (ED):** 0074 and DEC 5 Undo; 0112 Undo per occurrence; 0112 and 0126 navigation and authoring held during image replacement, with its 2-minute upload and 10-second measurement bounds; 0113 availability; E&P line 37 coordination, barrier and recovery refusals; ARC universal guard; 0068 r16–r18 statuses.

**storage.md (ST):** 0020 r1, r2, r5, r6; 0063 Export line endings; 0074 Meta identity; 0106 image store, deletion, Export, fixtures; 0128 file, locator, sidecar, strictness, JSON Schema; E&P line 25 file format; E&P line 38 forgiveness (ST-104), round trip and fixtures; where an unframed drawn Map is placed and fits (RD-5, undecided under conflicts/rendering.md C1); `newSpace`'s default title `New space` (§7).

**rendering.md (RD):** 0009 signal and 0114 glyph; 0051 r4 drawing; 0068 r19 and compound canvas (one camera); 0070 r6 renderer reuse; 0083 r6, r9, r10 ladder, clamp, no resize; a Space Resource with no framing fits its Map.

**ui.md (UI):** 0039 r4; 0046 r3; 0063 r2–r5; 0070 r4 "no source editor", r9; 0074 r7 confirmation (including "its Space may go with it"); 0083 r2 surfaces, r7, r8, r15; 0089 r1 select and caret, r3 list row and drag, r5 refusal channel, r7 disabled Create Reference; 0112 continuation (UI-87), notice area, cross-drawing wording; E&P line 37 `target` read; 0113 Dock creation cluster; E&P "no surface offers a Target"; the short Title question (§2).

**navigation.md (NV):** 0001 r3 moving between levels; 0068 r9 Enter and new tab, r11–r18; 0092 Copy link to Target; 0112 selection per occurrence, holds (NV-81) and Exit, only the canvas's own Space presents; 0113 Ur presents as its Title; E&P Enter.

**CONTEXT.md (GL):** 0092 names; 0120 content kinds; 0125 "front"; "body"; Replace is built.

**PROC:** 0016 r2; 0083 r5 (`titleLines`/`titleName`, no ad-hoc split).

## 6. Code only

Behaviour the code implements and a test asserts, with no source against it (drafting rule 5):
- SR-38 placement at a fixed offset from the Target.
- SR-39 the all-or-nothing refusal and landing on the Map the gesture was made on.
- SR-47 framing kept when only the Graph changes, dropped when the Map changes.
- SR-53 the four drawn-drop codes.
- SR-58 `resource-has-references` (0070 implies it through intake; no source states the refusal).
- SR-59 `space-resource-deletion-unsupported` on the one-Space path, and `space-resource-not-found`.

## 7. Code notes (not requirements)

- **Resolution** lives in the kind registry (`core/src/kinds/registry.ts` `resolveContent`), wrapped by `graph/src/lookup.ts`. 0009 placed it in `graph`.
- **Reading a Title** goes through `titleLines`, `titleName` and `shortTitle` in `core/src/title.ts`.
- **`naturalSize`** is written by `image-creation.ts`, `image-replacement.ts` and `space-authoring.ts` and read nowhere (C1).
- **`newSpace`** titles the Space `New space`; Create Space Resource passes `Space N` to `initializeSpace` (`graph/src/new-space.ts`).
- **Residue name.** `SpaceView`, `selectSpaceView` and `frameSpaceView` in `core` keep the retired Space View term for a Space Resource's selection.
- **Resource order tie-break.** `graph/src/space.ts` sorts by Title, then id; no test has two equal Titles, so SR-10 states only the Title order.
- **Starts empty.** Only Markdown and Ur declare starting content (`newContent`), which is what makes them creatable from a press.
