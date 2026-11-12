# Trace: Storage and hosts

For audit only. Every source rule appears exactly once in §1 or §2, with one of four dispositions:
- **→ ST-n**: kept.
- **folded → ST-n**: the source restates or implies a kept rule.
- **dropped**: with the reason.
- **sent → DOC**: it belongs to another doc.

§2a checks off the items other traces sent here. §3 groups the sends by receiving doc. §4 lists the code-only rules. §5 holds code notes.

Abbreviations:
- "rN" is the Nth rule of an ADR as numbered in the mapping tables (`map-*.md`).
- "DR n" is drafting rule n and "DEC n" ruling n in `../DECISIONS.md`.
- "R" ids are the old contract `docs/agents/maps-and-graphs.md`, received through `trace/maps-and-graphs.md` §3.
- Docs: SR space-and-resources.md, MG maps-and-graphs.md, ED editing.md, RD rendering.md, UI ui.md, NV navigation.md, GL `CONTEXT.md`, PROC process docs (AGENTS.md, workflow.md, anti-slop.md, build-tooling.md).

The rule ids in `../storage.md` are append-only from this version on. ST-99 was added after ST-11 to keep one behaviour per id. The revision after the CODE and SCOPE audits added ST-100–ST-108 and removed ST-26 (see SR-10), ST-38 (see ST-24) and ST-93 (see NV-39). The reconciliation pass removed ST-100 (see ED-1).

## 1. ADRs

| Source | Disposition |
|---|---|
| 0010 r1 Space is the root; `loadSpace` the only intake | → ST-22. The name is in §5 (two doors share one intake) |
| 0010 r2 downstream takes a Space | folded → ST-22 |
| 0010 r3 a schema-only value is not a Space | folded → ST-22 |
| 0010 r4 a Space is never the edit buffer | sent → ED (ED-1). ST-100 removed in the reconciliation pass |
| 0010 r5 "manifest" retired | sent → GL, PROC (vocabulary guard) |
| 0010 lapsed "future `Draft`" | dropped: no `Draft` exists and editing uses Interaction drafts (ED) |
| 0018 r3 an empty repository starts from a new Space named Meta | → ST-10, ST-11 (via MG trace §3) |
| 0019, 0029 (superseded by 0030) | dropped: superseded. 0019's optional ids survive through 0030 r3 and 0041 r6 → ST-44 |
| 0020 r1 one Resource, one file; the directory is the inventory | → ST-28, ST-29 |
| 0020 r2 identity from the file's id, never its path | → ST-29 |
| 0020 r3 duplicate Resource id is an intake error | → ST-29 |
| 0020 r4 default order by Title, then id | sent → SR (SR-10 states it; ST-26 removed as a duplicate) |
| 0020 r5 `loadSpace` takes files as an argument, no I/O | → ST-23 |
| 0020 r6 no directory per kind | folded → ST-29 (every Resource is in `resources/`) |
| 0020 frontmatter, `.md` card files | dropped: replaced by 0128 (DR 1) |
| 0030 r1 a database is the live write model; files are imported and exported | → ST-51, ST-62 (Running is the later exception, 0117) |
| 0030 r2 every completed Edit persists automatically; no Save | sent → ED |
| 0030 r3 ids optional only in import input; explicit ids are UUIDs; missing minted | → ST-44. A Resource id is now required and never minted (0128, DR 1) |
| 0030 r4 Space and Resource ids store-wide; Map and Graph ids per Space; no cross-Space check | → ST-20 (store fact). Uniqueness is SR-6, MG-2, MG-35 |
| 0030 r5 Import, seeds and fixtures share one mechanism; imported content self-contained | → ST-50. Self-containment folded → ST-46, ST-12 (Import only initializes an empty store or replaces everything, so stored state can supply nothing) |
| 0030 r6 Export CLI-only, canonical, records its revision | → ST-51, ST-52, ST-59. Running also Exports (0117, DR 1) |
| 0030 r7 the browser reaches persistence only over HTTP | → ST-1 |
| 0030 r8 Prisma Next behind a repository seam; memory adapter | seam folded → ST-2, ST-3. Prisma pin and CI Postgres job sent → PROC |
| 0030 staged atomic export | dropped: replaced by 0119 in-place write (DR 1) |
| 0030 insert-only Import that rejects existing identities; `--dangerous-truncate` | dropped: replaced by 0078, 0094 and 0124 (DR 1) |
| 0034 r1 Hono on Web Fetch; typed client; runtime validation | → ST-73 |
| 0034 r2 portable route module, no `node:` or Vite; adapters hold hosting | → ST-73 |
| 0034 r3 a runtime is supported only with a tested adapter | sent → PROC (build-tooling.md): deployment policy |
| 0041 r5 version 1; Graphs nest under Maps; `graphs` required non-empty; `edges` required, may be empty; `activeGraph`, `color` optional | → ST-28. Non-empty `graphs`, `activeGraph` and `color` semantics are MG-34, MG-44, MG-48. "A completed Map Edit writes `activeGraph`" is MG-79 |
| 0041 r6 Import may omit ids and mints them; Export writes complete ids | → ST-44, ST-52 |
| 0041 r7 no compatibility parser, migration or `route` alias | folded → ST-36 |
| 0054 r1 format changes roll forward with no versioned readers or migrations | → ST-36. Its reason is restated by DEC Storage S2 (unreleased, no compatibility promise outside the repository) |
| 0054 r2 relational schema changes only through `migrations/app/` and the Prisma contract | sent → PROC (build-tooling.md) |
| 0056 r1 every database and directory is derived | sent → PROC (workflow.md). No longer ST-36's reason: DEC Storage S2 replaces it, since a directory or a browser's stored copy may be the author's only copy |
| 0056 r2 generated state that disagrees is a bug at the source | sent → PROC |
| 0056 r3 no compatibility path for state a previous build wrote | → ST-36, ST-37 |
| 0056 r4 `SPACE_FILE_VERSION` and `documentRefusal` stay | → ST-37. Migrations and Prisma contract sent → PROC |
| 0056 r5 bootstrapping and hard reset stay cheap | sent → PROC |
| 0057 r1–r2, r4, r8 codes cross seams; refusals; persistence states; codes are interface | sent → ED |
| 0057 r5 `CommitResult` failure arms carry codes; `protocol` carries a typed `ProtocolFault`; `problem.detail` never reaches a screen | → ST-102 (received back from ED). The wording is ED's |
| 0057 r3 the application words codes per surface | sent → UI |
| 0057 r6 HTTP errors are Problem Details; `type` is the identity; `errors` with pointers; decoded once | → ST-79 |
| 0057 r7 a 409 conflict may carry the current loaded Space | → ST-78 |
| 0069 host: malformed 400, unresolved 404 plus not-found surface, never another entity | → ST-81 |
| 0069 `/` redirects to the Meta Space's canonical URL | → ST-82. The 503 with no Meta is code only (DR 5): 0069's "not found" belonged to the retired Entry Space (audit-facts §1) |
| 0069 every other rule (URL shapes, spelling, context, history) | sent → NV |
| 0077 r1 first initialization creates Meta from one deterministic Aggregate | → ST-11 |
| 0077 r2 the same generator feeds a CLI hard reset | → ST-99 (not built) |
| 0077 r3 generated content is ordinary authored state | → ST-11 |
| 0077 r4 an empty Meta Space is valid; no silent reseed | → ST-10, ST-11 |
| 0077 r5 no merge seed command, no browser reset control | → ST-99 |
| 0077 r6 "Default Content" is not a domain term | sent → GL |
| 0078 r1 the server repository owns establishment, complete reads, integrity commits and replacement | → ST-2 |
| 0078 r2 the browser seam exposes neither establishment nor replacement | → ST-2 |
| 0078 r3 a topology-preserving single-Space Edit keeps a fast path | → ST-5 |
| 0078 r4 adapters share intake, outcome types and one behavioural contract | → ST-4 |
| 0078 r5 two named lifecycle operations with explicit `metaSpaceId`; no inference | → ST-8, ST-9 |
| 0078 r6 uninitialized = no Spaces and no Meta | → ST-8 |
| 0078 r7 invalid proposals get structured refusals | → ST-15 |
| 0078 r8 `initialized` / `existing` / `already-initialized`, by authored meaning | → ST-9 |
| 0078 r9 `loadAggregate` answers `uninitialized` or validated `loaded`; contradiction is an invariant failure | → ST-7 |
| 0078 r10 replacement answers `uninitialized` when empty, needs the expected Meta, conflicts when stale | → ST-13, ST-14 |
| 0078 r11 replacement and an incompatible commit cannot both succeed; fresh revisions | folded → ST-12, ST-13 |
| 0078 r12 two authorized replacements may both succeed; later wins | folded → ST-13 |
| 0078 r13 insert/truncate modes retired; test helpers use the doors | → ST-50 |
| 0078 r14 human authority stays out of the repository | → ST-71 |
| 0079 obsolete view identities are invalid input | folded → ST-24 (via MG trace §3; ST-38 removed as a duplicate) |
| 0079 obsolete URLs are not found | → ST-81 |
| 0079 Import never rewrites its sources | → ST-48 (with R21) |
| 0079 listing, import completion, export and reference checks never initialize | folded → ST-47. The rule is MG-75 |
| 0080 one server-side first-working-load boundary | → ST-83 (DEC S1) |
| 0094 r1 replacement deletes everything, valid or not | → ST-12 |
| 0094 r2 reads and init still fail on contradiction; without the flag Import leaves storage alone | → ST-7, ST-46 |
| 0094 r3 an invalid proposal is refused before deleting | → ST-15 |
| 0094 r4 authorized by `loadMetaSpaceId`; a moved identity conflicts; none read permits Meta-less | → ST-13 |
| 0094 r5 an empty repository is `uninitialized` to replacement; the command initializes | → ST-14 |
| 0094 r6 replacement is never unconditional | folded → ST-13 |
| 0095 r1 PostgreSQL and SQLite share one repository | → ST-3 |
| 0095 r2 each database supplies a small `SqlStore`; a new member needs a reason | → ST-3. "Needs a reason" sent → PROC |
| 0095 r3 memory keeps its own replacement | dropped: implementation, not observable |
| 0095 r4 `decideCommit` is the one commit validation; fast path after the identity refusal | → ST-4, ST-5 |
| 0095 r5 both databases run one sequence; SQLite's queue | dropped: implementation detail for code comments (audit-split §2) |
| 0095 r6 statements in a transaction stay sequential | dropped: as r5 |
| 0095 r7 revision as canonical decimal text, one codec, ceiling 2^63−1 | → ST-6 |
| 0095 r8 shared tables typed structurally without a cast | sent → PROC |
| 0096 r1 lifecycle decisions stay inside each repository | dropped: implementation (audit-split §2) |
| 0096 r2 `classifyInitializedAggregate` is the only shared lifecycle function | dropped: as r1 |
| 0096 r3 the contract runs the whole lifecycle against every repository | → ST-4 |
| 0096 r4 keep `loadMetaSpaceId`; replacement never initializes | → ST-13, ST-14 |
| 0096 r5 when to revisit | dropped: process guidance |
| 0098 r1 `CommitOutcome` declared once for both seams | → ST-17 |
| 0098 r2 repository and browser results add `rejected` and transport failures | folded → ST-17 (`rejected`) and ST-101 (the browser result adds transport failures) |
| 0098 r3 one outcome→status table read by both sides | → ST-78 |
| 0098 r4 the route pairs body and status itself | dropped: Hono typing detail (code comment) |
| 0098 r5 the identity rule lives in `decideCommit`; the codec decodes shape only | folded → ST-4 |
| 0098 r6 transport failure classification stays in the transport | → ST-101 (Storage owns it; ED points here) |
| 0104 Edge schema strict | → ST-24 (via MG trace §3) |
| 0106 r3 stored at `/images/<id>`, id the SHA-256 as base64url | → ST-76. "A later kind's collection is named for its content (`/files/<id>`)" dropped: guidance for a kind that does not exist |
| 0106 r4 PNG, JPEG, WebP, GIF from bytes, ≤10 MiB, named refusals | → ST-75 |
| 0106 r5 no stored image deleted singly; only a reset clears the store | → ST-76, ST-99 |
| 0106 r12 external URL bytes are not the repository's | → ST-61 |
| 0106 r1–r2, r6–r11 kind, URL forms, Replace, Title as alt, natural size, load failure, Reference, creation | sent → SR (RD for drawing, UI for Replace's control) |
| 0107 (proposed) | dropped: proposed (DR 3, DEC 7) |
| 0109 "every authored id has one source" | folded → ST-44 (minting at the read boundary takes the injected `newId`). The rule is PROC |
| 0117 r1 Import into a fresh memory store, serve, Export after ~1 s quiet and on stop; second signal exits | → ST-62, ST-63 |
| 0117 r2 the directory is the durable copy; store ephemeral; database hosts unchanged | → ST-62 |
| 0117 r3 writes serialized; one further write | → ST-64 |
| 0117 r4 no edit leaves the directory byte-for-byte unchanged | → ST-64 |
| 0117 r5 the quiet-period clock is injected | sent → PROC (0109's pattern) |
| 0117 r6 git answers; no lock, fingerprint, detection or merge; last write wins | → ST-66 |
| 0117 r7 invalid directory refused, single Space directory included | → ST-67 |
| 0117 r8 Running always uses the memory store | → ST-62 |
| 0117 r9 cost: a crash in the quiet period loses edits | folded → ST-63 (*Why:*) |
| 0117 missing or empty directory served as a new Space | dropped: reversed by 0124 (DR 1) |
| 0118 r1 `images/<content-id>.<ext>`; one picture once | → ST-34 |
| 0118 r2 Export writes only referenced images and owns visible files in `images/` | → ST-60 |
| 0118 r3 external and missing-byte URLs export as URLs | → ST-61 |
| 0118 r4 Import admits every image by the upload rule before storing; a bad file refuses | → ST-49 |
| 0118 r5 Import does not refuse missing bytes; the fixture importer does | → ST-49, ST-50 |
| 0118 r6 images are outside the revision; a refused Import's images stay | → ST-49 (the second clause is untested) |
| 0118 r7 one directory format whichever store wrote it | → ST-35 |
| 0118 staged write | dropped: replaced by 0119 (DR 1) |
| 0119 r1 every Export writes in place; no atomicity or backup | → ST-55, ST-58 |
| 0119 r2 directories never moved; a missing one created | → ST-55 |
| 0119 r3 Hyper owns exactly what Import reads | → ST-56 |
| 0119 r4 compute, verify read-back, skip identical, temp and rename, remove owned then emptied dirs | → ST-53, ST-55, ST-56 |
| 0119 r5 no write or remove through a link; fresh temp files | → ST-57 |
| 0119 r6 a crash leaves a mix; git restores; revision recorded last | → ST-58, ST-59 |
| 0119 r7 a removed Space's directory loses only owned files | → ST-56 |
| 0119 owned-file list naming `resources/*.md` as Resource files | dropped: stale; 0134's list is current (→ ST-42) |
| 0122 strict entry; `openSize` refused | → ST-24 (via MG trace §3) |
| 0124 r1 one CLI and its verbs | → ST-68 |
| 0124 r2 `init` into a missing or empty directory; dot-only counts as empty | → ST-70 |
| 0124 r3 `run` serves only an existing directory, pointing at `init` | → ST-67 |
| 0124 r4 `--store`, default postgres, never inferred; `init`/`run` refuse it | → ST-69 |
| 0124 r5 `import` establishes or refuses; `--dangerous-replace` replaces | → ST-46, ST-71 |
| 0124 r6 bare `hyper` prints usage; usage error exits 2; database hosts initialize at start-up | → ST-68, ST-10 |
| 0127 r1 Graph and size objects strict at every reader | → ST-24 |
| 0127 r2 Resource file key strictness at file intake only; stored schemas non-strict | envelope half → ST-25. Content half dropped: 0128 makes content strict at every door and the code agrees (DR 1) |
| 0127 r3 nested `framing`, `naturalSize` strict at file intake | folded → ST-25 (content is strict everywhere) |
| 0127 missing kind is Ur | dropped: reversed by 0128 (DR 1) |
| 0128 Resource is the envelope everywhere | → ST-29. The kind model sent → SR |
| 0128 file `resources/<id>.json`; identity inside; directory is inventory | → ST-29 |
| 0128 locator `{ path, mediaType }` or `{ url }`; Markdown sidecar; Image URL form | → ST-31. The Image URL rules sent → SR |
| 0128 `kind` required; core refuses unknown top-level keys; kind refuses unknown content keys | → ST-30, ST-25 |
| 0128 kind id grammar | sent → SR (SR-17 states it; ST-30 points there) |
| 0128 modules declare references and flags; core enforces Target, hop, cycles, lifetime, reachability | sent → SR |
| 0128 Map rules by kind are flags | sent → SR, MG |
| 0128 format specified as JSON Schema | → ST-29 |
| 0128 domain half and view half | sent → SR |
| 0130 r1 GitHub only; defaults; ref grammar; one commit resolution; one tree; bounded, retried blobs; public, no token | → ST-87, ST-89 |
| 0130 r2 the selected directory bounds the Aggregate | → ST-88 |
| 0130 r3 the resolved source recorded in the address | sent → NV |
| 0130 r4 presentation messaging scoped by source and Space | sent → NV |
| 0130 r5 one build, optional default, `source` overrides and rides every URL, else ask | → ST-106 (build default, override, ask). `source` on every product URL sent → NV |
| 0130 r6 the seam is `HttpSpaceBackend` over the in-page app and memory repository | → ST-85 |
| 0130 r7 reader core browser-safe; CLI and mount refuse in the same words | → ST-39, ST-90. "Map of paths to bytes" dropped: replaced by 0133 (DR 1) |
| 0130 r8 a read-only session | dropped: replaced by 0131 (DR 1). Its first-working-load clause → ST-83 |
| 0130 r9 Open and Closed as authored | dropped: no rule of its own; a mounted Map is read like any other (MG-27) |
| 0130 r10 read-only mark | dropped: replaced by 0131 |
| 0130 r11 `/` resolves in the client | sent → NV |
| 0130 r12 stored images drawn from object URLs | → ST-91 |
| 0130 exception: the browser reads an Aggregate | → ST-86 |
| 0130 exception: a lifecycle door in the page | → ST-86 |
| 0130 exception: unknown URL answered by the app, not 404 | sent → NV (NV-39 owns it; ST-93 removed) |
| 0130 exception: 0117's Exporting has no edit to apply to | dropped: Mounting writes nothing back (ST-92) |
| 0131 r1 a mounted session authors as any session | sent → ED |
| 0131 r2 the in-page app accepts writes with the same intake | → ST-91 |
| 0131 r3 an uploaded image is drawn from its bytes | → ST-91 |
| 0131 r4 Edits lost on reload; the Dock says so; persistence reported as any session | "Lost on reload" is today's state, recorded in ST-95's not-built note (DEC 4, DR 1: 0132 replaces it). The mark sent → UI; persistence reporting sent → ED |
| 0131 r5 nothing writes to GitHub | → ST-92 |
| 0132 r1 IndexedDB repository, shared contract, one-transaction commits | → ST-95 (DEC 4, not built), transaction clause included |
| 0132 r2 scoped by repository, directory, commit | → ST-95 |
| 0132 r3 established via `initializeAggregate`; existing copy opened | → ST-95 |
| 0132 r4 opens as committed; "Edited in this browser" mark | sent → UI |
| 0132 r5 Discard local edits; revision floor; tabs reconnect | → ST-96, reconnection included. The control sent → UI |
| 0132 r6 `navigator.storage.persist()` on first edit only | → ST-97 |
| 0132 r7 two tabs, ordinary conflict, no broadcast | → ST-98 |
| 0132 r8 no export out of the page | → ST-107 (holds today) |
| 0132 r9 exception: browser storage holds an Aggregate | folded → ST-95 |
| 0133 r1 source: name, list, read, concurrency; neither throws | → ST-39 |
| 0133 r2 the reader decides; `hyper.json` first; one bounded pool; all reported; no `node:` | → ST-39, ST-40, ST-41 |
| 0133 r3 three sources | folded → ST-39 |
| 0133 r4 a source keeps its reach policy; a refused fetch is an unreadable file | → ST-43 |
| 0133 r5 Export owns what the listing finds | folded → ST-56 |
| 0134 r1 sources list links as links | → ST-42 |
| 0134 r2 the owned paths; a link there is a discovery failure | → ST-42 |
| 0134 r3 an unowned link is the author's | → ST-42 |
| 0134 r4 Export meets the rule through the scan and its own check | → ST-57 |
| 0134 r5 every source answers the same | folded → ST-42 |
| 0134 cost | dropped: a cost, not a rule |

## 2. Guides

**AGENTS.md** (source for one CLI detail)

| Source | Disposition |
|---|---|
| Commands › Run: port 4173 or the next free one; opens the browser unless `--no-open` | → ST-108 |

**`docs/agents/editing-and-persistence.md`** (by section and bullet)

| Source | Disposition |
|---|---|
| Intro paragraph | dropped: navigation text |
| 0070 Target immutability | sent → SR |
| PostgreSQL 1: a renamed key is a codebase edit; `documentRefusal` keeps its two refusals | → ST-36, ST-37. The how-to sent → PROC (workflow.md) |
| PostgreSQL 2: Prisma Next packaging workaround | sent → PROC (build-tooling.md) |
| PostgreSQL 3: revision as canonical decimal text | → ST-6 |
| SQL 1: both databases share one repository | → ST-3 |
| SQL 2: `decideCommit` is the one validation; the fast path; Meta-less refused on both paths | → ST-4, ST-5, ST-7 |
| SQL 3: stored documents parsed once | dropped: implementation |
| SQL 4: failure classification; `unclassified` is 500 | → ST-80. Driver codes dropped: implementation |
| SQL 5: `verifyMarker: false` | sent → PROC (code comment) |
| Map/Graph 1: the JSON Resource file | → ST-25, ST-28–ST-32. "Body is not a word" sent → GL |
| Map/Graph 2: Graphs are the only connection structure | sent → MG (MG-37 holds it) |
| Map/Graph 3: `loadSpace`, the space directory, no `Draft` | → ST-22, ST-23, ST-28. "No `Draft`; editors install valid state" sent → ED |
| Map/Graph 4: cycles and self-Edges; duplicate refused | sent → MG (MG-36, MG-60, MG-61) |
| SpaceBackend 1: the browser never imports files; the Mount exception; 0132 | → ST-1, ST-85–ST-92, ST-95–ST-98 |
| SpaceBackend 2: the CLI's unit is the Aggregate; in-place Export; Import; replacement; id minting; images | → ST-12–ST-14, ST-34, ST-44, ST-46, ST-49–ST-61, ST-69, ST-71 |
| SpaceBackend 3: one reader fed by sources | → ST-39–ST-43, ST-89 |
| SpaceBackend 4: "Aggregate" has one meaning | sent → GL |
| SpaceBackend 5: one Aggregate-aware contract; commits; locks; candidate acceptance | → ST-2, ST-5, ST-16–ST-19. Lock mechanics dropped: implementation. Aggregate validity sent → SR |
| SpaceBackend 6: Space Resource lifecycle | sent → ED, SR |
| SpaceBackend 7: a Space Resource's selection is durable | selection sent → SR. `ordinary-space-unreferenced` forgiveness → ST-104; round trip → ST-105; "only a mapless Meta Space can be in a valid Aggregate" dropped: follows from SR-56 and the selection rule |
| SpaceBackend 8: a coordinated Edit has one outcome and one recovery; the 1 MiB save | sent → ED. The 1 MiB request cap is ST-77 |
| SpaceBackend 9: a session submits complete snapshots | sent → ED |
| SpaceBackend 10: session notification | sent → ED |
| Lifecycle 1–6 (outcomes, install, gate, Map resolution, automatic persistence, Resize) | sent → ED (Map resolution → NV, Resize → MG) |

**`docs/agents/http.md`**

| Source | Disposition |
|---|---|
| 1: 0034 is built; routes; one commit; Vite host via Hono's Node adapter | → ST-73, ST-74. "The raw handler is deleted" dropped: history |
| 2: Hono's docs for agents | sent → PROC |
| 3: `notFound` and `onError` must terminate every path | dropped: implementation guidance. Its outcome (an unhandled throw answers 500) folded → ST-80 |
| 4: one media policy | → ST-77. The header rewrite dropped: implementation |
| 5: the Node host keeps the global `Request`; HEAD from GET | HEAD → ST-74, ST-81. The host requirement dropped: implementation (code comment) |
| 6: Hono's validator typing | sent → PROC |
| 7: `Content-Length` never trusted; drain | → ST-77 |
| 8: Problem Details; strict codec; no compatibility decoder | → ST-79 |
| 9: stored images at `/images` | → ST-75, ST-76 |

## 2a. Items received from other traces

**From trace/editing.md**

| Item | Disposition |
|---|---|
| EP 9–19, 25, 27, 32–36, 38: file format, intake (`loadSpaceSnapshot` also mints a Space), repository, locks, export, reader, mount | → §2 guide rows; intake → ST-22 (two doors, one intake); locks dropped there as implementation |
| 0057 r5 shape | → ST-102 |
| 0057 r6, r7 | → ST-79, ST-78 |
| `ProtocolFault` | → ST-102 |
| The 1 MiB request limit (`MAX_COMMIT_BODY_BYTES`) | → ST-77 |
| 0030 except r2 | → §1 rows for 0030 |
| Every EP-only ADR in its §3 | → §1 rows (0078, 0094–0096, 0098, 0117–0119, 0124, 0127, 0128, 0130–0134) |
| 0131 r2, r3, r5 | → ST-91, ST-92 |
| 0132 and DEC 4 | → ST-95–ST-98, ST-107 |
| Export status from acknowledged revisions | → ST-103 |
| 0098 r6 transport-failure classification (coordinator's placement) | → ST-101 |
| 0010 r4 | sent → ED (ED-1 owns it; ST-100 removed) |

**From trace/maps-and-graphs.md**

| Item | Disposition |
|---|---|
| R16 a mounted page's in-page host initializes | → ST-83, ST-85 |
| R18 and 0080 one boundary (S1) | → ST-83 (DEC S1) |
| R21 and 0079 Import does not rewrite its sources | → ST-48 |
| 0018 r3 an empty repository starts from Meta | → ST-10, ST-11 |
| 0041 r5–7 document spelling, minting, no compatibility parser | → ST-28, ST-44, ST-36 |
| 0079 obsolete identities are invalid input | → ST-24 |
| Strictness of Map, Map entry (`openSize`) and Edge | → ST-24 |
| §4 "Map `kind`" | → ST-33 |

**From trace/navigation.md**

| Item | Disposition |
|---|---|
| 0069 r11 statuses (400, 404) and r12 redirect status | → ST-81, ST-82 |
| 503 with no Meta | → ST-82 |
| 0079 obsolete identities | → ST-24 (data), ST-81 (URLs) |
| 0130 mount reading | → ST-85, ST-87–ST-90 |
| 0130 default source at build | → ST-106 |
| 0130 seam, reader, images | → ST-85, ST-39, ST-91 |
| CSP | → ST-94 |

**From trace/rendering.md**

| Item | Disposition |
|---|---|
| 0018 r3 | → ST-10, ST-11 |
| Space-level `graphs` rejection | → ST-37 |

**From trace/space-and-resources.md**

| Item | Disposition |
|---|---|
| 0020 r1, r2, r5, r6 | → ST-28, ST-29, ST-23 (r6 folded → ST-29) |
| 0063 Export line endings | → ST-35 |
| 0074 Meta identity | → ST-8, ST-9 (the Meta identity in the repository); Meta's lifetime is SR-55 |
| 0106 image store, deletion, Export, fixtures | → ST-75, ST-76, ST-99, ST-60, ST-61, ST-50 |
| 0128 file, locator, sidecar, strictness, JSON Schema | → ST-25, ST-29–ST-31 |
| E&P line 25 file format | → ST-25, ST-28–ST-32 |
| E&P line 38 forgiven `ordinary-space-unreferenced` | → ST-104 (it bounced: this trace had sent it to SR; the commit decision is Storage's) |
| E&P line 38 round trip, fixtures | → ST-105; the fixture note is dropped (see §2, SpaceBackend 7) |
| `newSpace`'s default title `New space` | → ST-11 |

**From trace/ui.md**

| Item | Disposition |
|---|---|
| 0057 r6 and G15: Problem Details and the adapter's one translation | → ST-79 |

## 3. Sent to other docs

**space-and-resources.md (SR):**
- 0020 r3's uniqueness as a rule of Resources (ST-29 keeps the file refusal).
- 0106 r1–r2, r6–r11: the Image kind, accepted URLs (`image-url-unsupported`), Replace, Title as text alternative, natural size, load failure, Reference to an Image, creation.
- 0128: the kind model, declared references and flags, Target, single hop, cycles, Space lifetime, reachability from Meta, domain and view halves.
- Which Aggregates are valid (Meta the sole root, unreachable Spaces, duplicate Resource ids across Spaces); deleting Meta is refused (`test/support/repository-contract.ts` › "refuses an authored commit that deletes the Meta Space").
- 0070 Target immutability; a Space Resource's durable selection.
- 0020 r4 (order by Title, then id: SR-10) and 0128's kind-id grammar (SR-17), which this doc now points to.

**maps-and-graphs.md (MG):** nothing new. MG-37, MG-36, MG-60, MG-61 already hold the guide's Graph bullets.

**editing.md (ED):**
- 0010 r4 (ED-1).
- 0030 r2 (automatic persistence, no Save); 0057 r1–r2, r4, r8, and the wording of each code (0057 r5's copy half).
- 0131 r1 (no mounted availability answer) and r4 (persistence reported as any session).
- The guide's session, coordination, recovery and lifecycle bullets; the session side of the 1 MiB save.

**navigation.md (NV):** 0069's URL rules; 0130 r3, r4, r11 and r5's `source` on every product URL (the address records the resolved source, scoped presentation messaging, `/` in the client); 0130's unknown-URL exception (NV-39).

**ui.md (UI):** 0057 r3; the Dock's "Edits lost on reload" mark (0131 r4); "Edited in this browser" and Discard local edits as a control (0132 r4–r5, not built).

**rendering.md (RD):** how a stored image is fitted (0106).

**CONTEXT.md (GL):** "manifest" (0010 r5); "Default Content" is not a domain term (0077 r6); "Aggregate" has one meaning; "Body" is not a word.

**Process docs (PROC):** 0030 Prisma pin and CI job; 0034 r3; 0054 r2; 0056 r1–r2, r4 (migrations), r5; 0095 r2 ("needs a reason"), r8; 0109; 0117 r5; Prisma packaging workaround; `verifyMarker: false`; Hono docs and typing guidance; the renamed-key how-to.

## 4. Code only (DR 5)

- ST-6 (second sentence): a created Space lands at revision 0.
- ST-21: Resources answered in ascending id order.
- ST-33: Map `kind` defaults to `positioned` and no other kind is read.
- ST-35 (third sentence): width before height and envelope key order. LF line endings come from 0063 (via SR).
- ST-44 (minting order): ids minted in directory order.
- ST-77: UTF-8 charset and the content-encoding refusal.
- ST-82: 503 at `/` with no Meta Space.
- ST-87: a truncated tree is refused.
- ST-89: `Retry-After`, which statuses retry, and rate-limit classification. Eight blobs and 25 MiB come from the guide.
- ST-101: the problem-to-result mapping (0098 r6 states only that the transport classifies).
- ST-94: the static build's Content Security Policy.
- ST-103: export status derives from acknowledged revisions (received from ED).

## 5. Code notes

- **ST-65 (bug).** `startRun` wraps the memory store in `ObservedRepository`, which marks the directory changed and schedules a write on every `committed` commit while serving. The single-Space route's loader commits a first working read's initialization to that store, so opening a mapless Space under Running Exports. `test/unit/aggregate-round-trip.test.ts` › "exports the Map and Graph a later initialization gave it" shows that an initialization, once Exported, is written. No test opens a mapless Space under Running. The fix must not drop the initialization: it stays in the store, and the next Export an Edit triggers writes it.
- **Two doors, one intake.** 0010 says `loadSpace` is the only intake. `loadSpaceSnapshot` (`graph/src/space.ts`) builds a Space from a stored snapshot; both go through `buildSpace` and `documentRefusal`, so ST-22 states one intake and names no function. `docs/agents/editing-and-persistence.md` repeats "the one intake" for `loadSpace` alone.
- **Strictness split.** `spaceFileObjectSchema` is a `strictObject`, and `.omit()`/`.extend()` carry it to the stored document, snapshot and import variants. Only the Resource envelope differs: `resourceFileSchema` is `.strict()`, `resourceDocumentSchema` is not. Each kind's content schema is strict at every door (`core/test/resource-document-equality.test.ts`). This answers audit-split §3 item 10.
- **Stale comment.** `core/src/schema.ts` says of `maps` that "a Space with no Maps … is what a new Space is"; a new Space has a Map (see SR).
- **Space directory names.** A Space directory's name is its identity (ST-27, ST-44), unlike a Resource file's (ST-29). No ADR states the Space half; `docs/aggregate-directory.md` does, and the reader enforces it.
- **SVG.** `persistence/src/images.ts` refuses SVG with `image-svg-unsupported`, and only `nosniff` is sent for stored images; 0107 is proposed and left out.
- **Mounting status.** `.scratch/mounting/issues/` 01–07, 09, 10, 13 are resolved; 11 (0132) and 12 (download an edited talk) are needs-triage; 08 is a launch task.
