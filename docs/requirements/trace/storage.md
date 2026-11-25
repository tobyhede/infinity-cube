# Trace: Storage and hosts

For audit only. Every source rule appears exactly once in §1 or §2, with one of four dispositions:
- **→ ST-n**: kept.
- **folded → ST-n**: the source restates or implies a kept rule.
- **dropped**: with the reason.
- **sent → DOC**: it belongs to another doc.

§2a checks off the items other traces sent here. §3 groups the sends by receiving doc. §4 lists the code-only rules. §5 holds code notes.

Abbreviations:
- "rN" is the Nth rule of an ADR as numbered in the rewrite's mapping tables (`map-*.md`). Those tables were never committed, so a number cannot be looked up, and the numbers do not follow the order of the ADR's text (0028's r1, "activation is not an Edit", is the second rule its text states). Resolve a row by its description, which names the claim, and find that claim in the ADR in `docs/adr/` or `docs/adr/superseded/`.
- "DR n" is drafting rule n and "DEC n" ruling n in `../DECISIONS.md`. A ruling that changes what an accepted ADR decides is recorded as an ADR (DEC 1, C1 and C2 as ADR 0146; C3 as 0147; Navigation C2 as 0148; Rendering C1 as 0149; Space and Resources C1 as 0150; UI C2 as 0153; UI C3 as 0151; UI C4 as 0154; Storage S2 as 0152), and that ADR is what binds; `../DECISIONS.md`, "Rulings recorded as ADRs", lists them. A row below that says a rule was "struck" or "overruled" by a ruling means the ADR that records the ruling refines the source ADR.
- "R" ids are the old contract `docs/adr/archive/agent-guides/maps-and-graphs.md`, received through `trace/maps-and-graphs.md` §3.
- Docs: SR space-and-resources.md, MG maps-and-graphs.md, ED editing.md, RD rendering.md, UI ui.md, NV navigation.md, GL `CONTEXT.md`, PROC process docs (AGENTS.md, workflow.md, anti-slop.md, build-tooling.md).

The rule ids in `../storage.md` are append-only from this version on. ST-99 was added after ST-11 to keep one behaviour per id. The revision after the CODE and SCOPE audits added ST-100–ST-108 and removed ST-26 (see SR-10), ST-38 (see ST-24) and ST-93 (see NV-39). The reconciliation pass removed ST-100 (see ED-1). The pass that brought this doc up to the InfinityCube code (after ADRs 0136–0144) added ST-109–ST-112 and rewrote ST-24, ST-25, ST-27, ST-30, ST-31, ST-34, ST-35, ST-39, ST-40, ST-42, ST-49, ST-60, ST-61, ST-68, ST-69, ST-74–ST-76 and ST-91 for `aggregate.json`, assets, the Resource plugins and the `cube` CLI.

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
| 0106 r3 stored at `/images/<id>`, id the SHA-256 as base64url | → ST-76, as `/assets/<hash>` (0142 makes the image store the asset store, DR 1). "A later kind's collection is named for its content (`/files/<id>`)" dropped: reversed by 0142, one asset store for every kind |
| 0106 r4 PNG, JPEG, WebP, GIF from bytes, ≤10 MiB, named refusals | The store half dropped: 0142 makes the host admit any media type (→ ST-75, DR 1). The picture rule sent → SR (SR-63), where 0142 puts it |
| 0106 r5 no stored image deleted singly; only a reset clears the store | → ST-76, ST-99 (every asset, 0142) |
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
| 0118 r1 `images/<content-id>.<ext>`; one picture once | → ST-34, as `assets/<hash>.<ext>` (0142, DR 1) |
| 0118 r2 Export writes only referenced images and owns visible files in `images/` | → ST-60, as the hash-named files in `assets/` (0142, DR 1) |
| 0118 r3 external and missing-byte URLs export as URLs | → ST-61 |
| 0118 r4 Import admits every image by the upload rule before storing; a bad file refuses | → ST-49. Refusing a file that is not an image dropped: reversed by 0142 (the host admits any media type) |
| 0118 r5 Import does not refuse missing bytes; the fixture importer does | → ST-49, ST-50 |
| 0118 r6 images are outside the revision; a refused Import's images stay | → ST-49 (the second clause is untested) |
| 0118 r7 one directory format whichever store wrote it | → ST-35 |
| 0118 staged write | dropped: replaced by 0119 (DR 1) |
| 0119 r1 every Export writes in place; no atomicity or backup | → ST-55, ST-58 |
| 0119 r2 directories never moved; a missing one created | → ST-55 |
| 0119 r3 the product owns exactly what Import reads | → ST-56 |
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
| 0124 r6 a bare command prints usage; usage error exits 2; database hosts initialize at start-up | → ST-68, ST-10. The command is now `cube` (AGENTS.md, Commands) |
| 0127 r1 Graph and size objects strict at every reader | → ST-24 |
| 0127 r2 Resource file key strictness at file intake only; stored schemas non-strict | envelope half → ST-25. Content half dropped: 0128 makes content strict at every door and the code agrees (DR 1) |
| 0127 r3 nested `framing`, `naturalSize` strict at file intake | folded → ST-25 (content is strict everywhere) |
| 0127 missing kind is Ur | dropped: reversed by 0128 (DR 1) |
| 0128 Resource is the envelope everywhere | → ST-29. The kind model sent → SR |
| 0128 file `resources/<id>.json`; identity inside; directory is inventory | → ST-29 |
| 0128 locator `{ path, mediaType }` or `{ url }`; Markdown sidecar; Image URL form | The `{ url }` locator → ST-31. The path locator and the Markdown sidecar dropped: replaced by 0142, a Markdown Resource's text is an asset (DR 1). The Image URL rules sent → SR |
| 0128 `kind` required; core refuses unknown top-level keys; kind refuses unknown content keys | → ST-30, ST-25. Refusing a kind no module registers dropped: reversed by 0142 (→ ST-30, SR-62) |
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
| 0131 r4 Edits lost on reload; the Dock says so; persistence reported as any session | "Lost on reload" is today's state, recorded in ST-95's not-built note (DEC 4, DR 1: 0132 replaces it). The mark sent → UI (on main it is a notice over the canvas in the shell, not a Dock mark: UI-42); persistence reporting sent → ED |
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
| 0133 r2 the reader decides; the root file first; one bounded pool; all reported; no `node:` | → ST-39, ST-40, ST-41. The root file is `aggregate.json` (0136) |
| 0133 r3 three sources | folded → ST-39 |
| 0133 r4 a source keeps its reach policy; a refused fetch is an unreadable file | → ST-43 |
| 0133 r5 Export owns what the listing finds | folded → ST-56 |
| 0134 r1 sources list links as links | → ST-42 |
| 0134 r2 the owned paths; a link there is a discovery failure | → ST-42, with `aggregate.json` and `assets/` for the earlier names (0136, 0142) and no `*.md` (0142: Export owns no `*.md`) |
| 0134 r3 an unowned link is the author's | → ST-42 |
| 0134 r4 Export meets the rule through the scan and its own check | → ST-57 |
| 0134 r5 every source answers the same | folded → ST-42 |
| 0134 cost | dropped: a cost, not a rule |
| 0136 the root file is `aggregate.json`, contents unchanged, schema `aggregate.schema.json` | → ST-27, ST-109 |
| 0136 no fallback: every source reads `aggregate.json` only; the earlier file is refused as a missing root | → ST-109 (ST-40, ST-67, ST-88 name the file) |
| 0136 Export leaves the earlier root file untouched | → ST-109 (folded from ST-56) |
| 0136 an Aggregate is renamed before a page that mounts it is rebuilt; links to older commits refused | dropped: a deployment step, not behaviour; the refusal is ST-109. `docs/deploy-cloudflare.md` says it to operators |
| 0136 ownership and links follow the name | folded → ST-42, ST-56 |
| 0136 rejected options | dropped: rejected alternatives |
| 0141 (proposed) an agent authors a running aggregate through Space Authoring | dropped: proposed (DR 3). The file-tool route it names, `cube mcp`, is built and code only (§4) |
| 0142 the plugins are listed once; the core reads the domain half; the host holds `content` as JSON | sent → SR (SR-15, SR-9) |
| 0142 the stored `kind` stays; one structure everywhere; no file codec | → ST-29 (the file is that structure). The structure sent → SR (SR-8) |
| 0142 every file a Resource uses is an asset, named by SHA-256, in one store, written to `assets/`; reached by URL; the `<id>.md` sidecar, its locator and stored source retired | → ST-31, ST-34, ST-60. The Markdown content sent → SR (SR-21) |
| 0142 a reference to a stored asset is a whole string value in content or Map content, found by walking, read or unread | → ST-60 |
| 0142 Export carries the assets found; an unreferenced one left out; the store never deletes; no plugin declares its assets | → ST-60, ST-76 |
| 0142 Export owns `assets/` and no `*.md` | → ST-31, ST-42, ST-56, ST-60 |
| 0142 the host admits any media type; picture admission is the Image plugin's | → ST-75. The picture rule sent → SR (SR-63) |
| 0142 the asset of zero bytes always exists | → ST-31, ST-60, ST-76 |
| 0142 Import, a store and Export carry a missing kind's Resource whole, its assets by the same walk | → ST-30, ST-60. The rule sent → SR (SR-62) |
| 0142 a missing kind's content and Map content written in one key order | → ST-35 (every Map content, as the code writes it; the guide named only a missing kind's) |
| 0142 the held-Space exception and the refused last deletion | sent → SR (SR-64) |
| 0142 a missing plugin is drawn by the default plugin; no new Reference to it | sent → SR (SR-62) |
| 0142 Map content, size hints, outline, surfaces, Claims, Embed, failure boundary, creation | sent → SR, MG, RD, ED, UI (each owns its part) |
| 0142 old content: no versioning of content | folded → ST-36 |
| 0142 cost: an asset URL inside another asset's bytes is not found, so it is not carried | → ST-60 |
| 0142 cost and rejected options otherwise | dropped: costs and rejected alternatives |
| 0155 both hosts share one schema through plain-SQL migrations that every tool applies, held to one schema by a test | → ST-125, as 0165 refines it |
| 0159 the cross-Space cycle walk follows Resources by Title, then id, by code unit; a commit's candidate aggregate is judged ascending by Space id, created Spaces among the stored | → ST-117. The repeated Resource id rule sent → SR (SR-6, SR-30) and MG (MG-86) |
| 0160 r1 JSON text escaping a lone UTF-16 surrogate, in a key or a value at any depth, is not JSON in either runtime; an escaped pair is one character | → ST-22 (TypeScript, `parseJsonText`), ST-118 (Rust intake) |
| 0160 r2 such a file is refused `invalid-json` located at the file; such a commit body 400 `invalid-request`, "Malformed JSON in request body" | → ST-22, ST-77 (TypeScript), ST-119 (Rust host) |
| 0160 r3 the intake corpus and the HTTP wire cases hold both runtimes to it; no corpus commit case can carry one | → ST-22, ST-77 evidence (`conformance/intake/directory/invalid-json-lone-surrogate*`, `conformance/http/wire-cases.ts`) |
| 0160 r4 the 512-level nesting limit stays a known difference, pinned by a test in each runtime | → ST-77, ST-118, ST-119 |
| 0161 r1 both runtimes' HTTP applications refuse a change (neither `GET` nor `HEAD`) to the Space API or asset store before reading its body, by `Sec-Fetch-Site`, then by `Origin` against `Host` | → ST-123 |
| 0161 r2 a request naming neither header is served; one naming no `Host` is not judged by its `Origin` | → ST-123 (the scheme handler's own admission is ST-121) |
| 0161 r3 the refusal is 403 `forbidden` Problem Details, "Send a change from the application's own page." | → ST-123; the transport reads it as permanent (ST-101) |
| 0161 r4 the conformance suite holds both runtimes to it | → ST-123 evidence |
| 0161 r5 the memory store's asset count stays uncapped | → ST-123 |
| 0162 r1 every host that runs a directory locks it with SQLite's exclusive lock on `.infinity-cube.lock` | → ST-124 |
| 0162 r2 the lock is taken after the missing-or-empty refusal and before Import, and released when the last write lands or fails, or Import refuses; in Rust an abandoned write keeps it | → ST-124; the abandoned write → ST-122 |
| 0162 r3 a second opener is refused with the kind `locked`, in each host's own way; another failure to lock stops the run as any failure to start | → ST-124 |
| 0162 r4 the file is never deleted, is a dot-entry, and Import, `check` and Export never open it; a content repository ignores it | → ST-124; a run leaving the directory otherwise unchanged → ST-64 |
| 0162 r5 `cube mcp`, `check`, `init`, `import` and `export` take no lock | → ST-124, ST-111 |
| 0162 refines 0117: still no fingerprint, change detection or merge; git still answers for other writers | → ST-66 |
| 0162 known limits (network filesystems, copies, second mounts) | → ST-124 (network filesystems); the rest is the ADR's argument |
| 0163 (proposed) a close waits ten seconds for its last write, then asks the presenter | dropped: proposed (drafting rule 3); ST-122 restates the rule as built |
| 0164 the word ADR 0164 retires names nothing; the directory, its run, origin and lock are an Aggregate, a desktop window is a Space window | → wording across ST-121, ST-122, ST-67 and the Mounting rules, reworded on main (PR 504). The terms → GL (`CONTEXT.md`) |
| 0165 the schema history in two encodings: Prisma Next's packages and one plain-SQL file per package, held to the same statements and schema by tests; a schema change adds both | → ST-125 |
| 0165 rejected options | dropped: rejected alternatives |
| 0166 a preview build is a published build that makes no compatibility promise; a directory is read with the preview build that wrote it; a preview build says it is one | → ST-36 (restated on main, PR 511). That a preview build says it is one in the version it reports → ST-120 (`infinity-cube --version`). That its download page says so: not restated, since it is release packaging rather than behaviour of a host |
| 0167 the desktop application has no home window: every window is a Space window, a window its page opened, or a close's question; a folder opens from the command line, File › Open… or the launch question; `open_aggregate`, its permission and the home window's capability are removed | → ST-121 (the windows it opens; `tauri.conf.json` declares no window). The launch question → ST-131, since 0171 replaces it with the Start window |
| 0167 the shell creates a Space only when asked: File › New Space…, or the offer for a missing or empty folder opened by any route; declining writes nothing; the CLI's `run` still refuses a missing or empty directory, naming `init` | → ST-121 (the offer and the one-at-a-time write), ST-131 (New Space… shows the form), ST-67 and ST-70 (the CLI unchanged) |
| 0167 a native menu follows the platform's conventions, with its accelerators, outside the page's no-modifier rule and ADR 0138's keymap | → ST-121 (the menus); the keys → UI-8 |
| 0167 rejected options; a Resource opened in its own window left as two browser tabs are | dropped: rejected alternatives; the open question is the ADR's and states no rule |
| 0168 each platform's standard menus (macOS application, File, Edit, View, Window and Help; Linux and Windows File, View and Help, with no Edit menu), `CmdOrCtrl+W` and `F11` | → ST-121; the accelerators → UI-8 |
| 0168 Help opens fixed addresses in the system browser from the shell; no window navigates to a remote origin and no page holds the opener | → ST-121 |
| 0168 Close Window and Quit go through the close wait | → ST-121 (Close Window), ST-122 (a quit) |
| 0168 one update check at a time; a check asked for while one runs, or once a newer build is installed, starts nothing and says why | → ST-121 (Check for Updates…), ST-130 (the launch check) |
| 0168 reaching into the page from a menu is not decided; rejected options | dropped: undecided, and rejected alternatives |
| 0169 a preview build is a normal GitHub release, created as a draft marked latest, not a pre-release; an installed build reads `releases/latest/download/latest.json` and offers the build it names when newer | → ST-130; the install script reading the list, so a release published as a pre-release still installs → ST-129 |
| 0169 rejected options | dropped: rejected alternatives |
| 0171 the Start window (New Space, Open Folder…, recent Spaces), New Space as a name-and-location form whose name is the Meta Space's Title and must be one folder name, reopening the Spaces open when the last quit began, Recent as a separate history of Spaces opened, both kept in the application's data directory, the last window (Space or Start) closing per platform, the Start window built from `@project/ui` holding its own commands | → ST-131 (the Start window, New Space and the last window closing **built**, ticket 02; reopening and Recent **not built**, ticket 03); ST-121 points to it. The Start window's layout → UI-111 |
| 0171 rejected options | dropped: rejected alternatives |
| 0171 `init_directory` takes the Title of the Space it writes; the CLI's `init` still writes `New space` | → ST-11 |
| 0171 opening a recent Space from the Start window is held to the same refusals as File › Open… | → ST-131 (**not built** with Recent, ticket 03; the shell already routes it through File › Open…'s path) |
| 0172 the shell's `frontendDist` is `packages/app/dist-desktop-shell`, a second Vite build of `packages/app` whose entry is `start.html`, apart from `dist`, which the host serves to Space windows; the close question's files are copied into it; a window of the shell's own opens by label with a capability naming that label alone | → ST-131 (the Start window's page, build and capability, and every page holding an IPC permission served from that build, never from `dist`), ST-122 (the close question's one permission), ST-121 (Space windows hold no IPC permission) |
| 0172 every build of the shell builds both first (the `rust` CI job, the desktop package's scripts, `release/build.sh --desktop`); a bare `cargo build` builds neither | process only → `AGENTS.md` (Rust), `docs/agents/build-tooling.md`; no storage rule |
| 0172 rejected options | dropped: rejected alternatives |
| 0174 (sqlx is the only migrator) from rust-host 16, `sqlx` is the only migrator, for PostgreSQL and SQLite together; the plain-SQL files are the history and a schema change is a new file; the Prisma Next migration packages and the two equality tests are deleted | → ST-125, as **not built** (rust-host 16) |
| 0174 (sqlx is the only migrator) `infinity-cube migrate --store <postgres\|sqlite>`, reaching `DATABASE_URL` or `SQLITE_PATH`, is run by every caller, the TypeScript databases' included; no host migrates on start | → ST-125 (the rule), ST-120 (the verb), the operations index; **not built** |
| 0174 (sqlx is the only migrator) a database holding tables but no `_sqlx_migrations` is refused, saying to reset it; no database is adopted and no record seeded | → ST-125, **not built** |
| 0174 (sqlx is the only migrator) the TypeScript runtime keeps its Prisma Next contract for queries until rust-host 20; CI holds it to each `sqlx`-migrated database with `prisma-next db verify --schema-only`, not `--strict`; the TypeScript integration suites are the second net | → ST-125, **not built** (CI today runs `prisma-next db verify` after Prisma Next migrates) |
| 0174 (sqlx is the only migrator) `migrate --store sqlite` keeps ST-126's relative-path and parent rules, creates a missing file and refuses a blank `SQLITE_PATH` | → ST-126, **not built** |
| 0174 (sqlx is the only migrator) consequences: contributors and the `postgres` and `sqlite` CI jobs need the Rust toolchain to migrate; `db:migrate`, `db:migrate:sqlite` and the `prisma-next.config*.ts` migration settings go unless a script stays as a thin name for the verb | → ST-125 (the scripts); the toolchain is process only → `AGENTS.md` when rust-host 16 lands. Which command ST-126's missing-file refusal names after 16 is open → conflicts/storage.md |
| 0174 (sqlx is the only migrator) rejected options: two migrators seeding each other, PostgreSQL moving alone, `serve` migrating on start, adopting Prisma Next's databases, a test comparing the contract with `sqlx`'s schema | dropped: rejected alternatives |
| 0173 (Shift at Resize start keeps the Resource's proportions) | reviewed, no rule here: a Resize gesture's ratio and floors; its one Resize Edit commits as any other (ST-16). Restated in RD-2, UI-67 and UI-68 |

## 2. Guides

**AGENTS.md** (source for one CLI detail)

| Source | Disposition |
|---|---|
| Commands › Run: port 4173 or the next free one; opens the browser unless `--no-open` | → ST-108 |
| Commands › Run: `pnpm cube check <dir>` reads through the same Import, exits zero or refuses, neither serves nor writes | → ST-110 |
| Commands › Run: `pnpm cube mcp <dir>` serves a stdio MCP server over the directory's files; start it with `--silent` | → ST-111. The `--silent` advice dropped: operator guidance in `docs/aggregate-directory.md` |
| Commands › every verb is `pnpm cube <verb>` | → ST-68 |

**`docs/adr/archive/agent-guides/editing-and-persistence.md`** (by section and bullet)

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
| Map/Graph 1: the JSON Resource file; a missing kind carried and written canonically; Markdown text as an asset at `assets/<hash>.md`; no file codec; a `.md` not read | → ST-25, ST-28–ST-32, ST-35. The missing kind and its Target rule sent → SR (SR-62). "Body is not a word" sent → GL |
| Map/Graph 2: Graphs are the only connection structure | sent → MG (MG-37 holds it) |
| Map/Graph 3: `loadSpace`, the space directory, no `Draft` | → ST-22, ST-23, ST-28. "No `Draft`; editors install valid state" sent → ED |
| Map/Graph 4: cycles and self-Edges; duplicate refused | sent → MG (MG-36, MG-60, MG-61) |
| SpaceBackend 1: the browser never imports files; the Mount exception; 0132 | → ST-1, ST-85–ST-92, ST-95–ST-98 |
| SpaceBackend 2: the CLI's unit is the Aggregate; in-place Export; Import; replacement; id minting; assets (extension table, references walked, kept names) | → ST-12–ST-14, ST-27, ST-34, ST-44, ST-46, ST-49–ST-61, ST-69, ST-71 |
| SpaceBackend 3: one reader fed by sources | → ST-39–ST-43, ST-89. Its list of owned links and scanned files still names a Space directory's `*.md` and `resources/*.md`: dropped as stale, since 0142 and the reader (`aggregate/src/aggregate-file.ts`) own no `*.md` |
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
| 9: stored assets at `/assets`: any media type, `asset-too-large`, the served-type rule, `X-Asset-Media-Type`, the zero-byte asset, the asset client | → ST-74, ST-75, ST-76. The Vite host's forwarding of `/assets/<hash>` only dropped: dev-host implementation. Image's picture rule sent → SR (SR-63) |

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
| 0063 Export line endings | dropped from ST-35: 0142 makes the text an asset written as stored; the Markdown plugin saves `\n` line endings (SR-21) |
| 0074 Meta identity | → ST-8, ST-9 (the Meta identity in the repository); Meta's lifetime is SR-55 |
| 0106 image store, deletion, Export, fixtures | → ST-75, ST-76, ST-99, ST-60, ST-61, ST-50 (now the asset store, 0142) |
| 0128 file, locator, sidecar, strictness, JSON Schema | → ST-25, ST-29–ST-31 (the sidecar retired by 0142) |
| E&P line 25 file format | → ST-25, ST-28–ST-32 |
| E&P line 38 forgiven `ordinary-space-unreferenced` | → ST-104 (it bounced: this trace had sent it to SR; the commit decision is Storage's) |
| E&P line 38 round trip, fixtures | → ST-105; the fixture note is dropped (see §2, SpaceBackend 7) |
| `newSpace`'s default title `New space` | → ST-11 |
| 0142 assets, the missing kind's carriage through Import and Export, the asset store admitting any type | → ST-30, ST-31, ST-34, ST-60, ST-75 |

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
- 0142: the plugin list and the Resource structure (SR-8, SR-9, SR-15); the Markdown content as text (SR-21); the Image picture rule (SR-63); the missing kind and the default plugin (SR-62); the held-Space exception (SR-64).

**maps-and-graphs.md (MG):** nothing new. MG-37, MG-36, MG-60, MG-61 already hold the guide's Graph bullets.

**editing.md (ED):**
- 0010 r4 (ED-1).
- 0030 r2 (automatic persistence, no Save); 0057 r1–r2, r4, r8, and the wording of each code (0057 r5's copy half).
- 0131 r1 (no mounted availability answer) and r4 (persistence reported as any session).
- The guide's session, coordination, recovery and lifecycle bullets; the session side of the 1 MiB save.

**navigation.md (NV):** 0069's URL rules; 0130 r3, r4, r11 and r5's `source` on every product URL (the address records the resolved source, scoped presentation messaging, `/` in the client); 0130's unknown-URL exception (NV-39).

**ui.md (UI):** 0057 r3; the "Edits lost on reload" notice (0131 r4; a shell notice on main, UI-42); "Edited in this browser" and Discard local edits as a control (0132 r4–r5, not built).

**rendering.md (RD):** how a stored image is fitted (0106).

**CONTEXT.md (GL):** "manifest" (0010 r5); "Default Content" is not a domain term (0077 r6); "Aggregate" has one meaning; "Body" is not a word.

**Process docs (PROC):** 0030 Prisma pin and CI job; 0034 r3; 0054 r2; 0056 r1–r2, r4 (migrations), r5; 0095 r2 ("needs a reason"), r8; 0109; 0117 r5; Prisma packaging workaround; `verifyMarker: false`; Hono docs and typing guidance; the renamed-key how-to.

## 4. Code only (DR 5)

- ST-6 (second sentence): a created Space lands at revision 0.
- ST-21: Resources answered in ascending id order.
- ST-33: Map `kind` defaults to `positioned` and no other kind is read.
- ST-35 (second sentence): width before height and envelope key order.
- ST-44 (minting order): ids minted in directory order.
- ST-77: UTF-8 charset and the content-encoding refusal.
- ST-82: 503 at `/` with no Meta Space.
- ST-87: a truncated tree is refused.
- ST-89: `Retry-After`, which statuses retry, and rate-limit classification. Eight blobs and 25 MiB come from the guide.
- ST-101: the problem-to-result mapping (0098 r6 states only that the transport classifies).
- ST-94: the static build's Content Security Policy.
- ST-103: export status derives from acknowledged revisions (received from ED).
- ST-110: what `cube check` prints and that it names a missing asset's file (AGENTS.md states the verb).
- ST-111, ST-112: the MCP server, its tools, path confinement and asset writer. AGENTS.md names the server; 0141, which describes it, is proposed.
- ST-35 (Map content sorting): every Map content is written in canonical key order (`src/aggregate-directory/write-space-directory.ts`); 0142 and the guide name only a missing kind's.
- ST-76: the served-type rule and `X-Asset-Media-Type` come from the guide; the sandboxing Content Security Policy on a served asset is code only.
- ST-113–ST-116: the desktop sidecar, its announcement, lock-down, routing, fallback and stop. ADR 0155 decides it; the rules restate `src/desktop/` and its tests. ST-63's sentence on the sidecar's stop and five-second kill comes from the same code.
- ST-117: located refusals, the order a commit's candidate aggregate is judged in, the code unit cycle walk and the intake conformance corpus. ADR 0156 decides the corpus; the rule restates `packages/aggregate/src/intake-refusal.ts`, `packages/graph/src/intake-location.ts`, `decideCommit` and `conformance/intake/README.md`, and their tests.
- ST-126–ST-128 (added 2026-11-19): the SQLite host's `SQLITE_PATH` refusals, one process per file and its contention outcomes, and its journal settings. ADR 0095 decides the shared repository and its serialising queue; the rules restate `src/sqlite/` and its tests. No ADR decides ST-126's paths or ST-128's journal settings; they are detail no ADR states, recorded here and dated in the rule (workflow, "A ruling is recorded where it belongs").
- ST-129 (added 2026-11-22): the install script, its platforms, newest-release lookup, `SHA256SUMS` check, install folder and replacement, curl requirement, messages, and the README each archive packs. ADR 0166 decides preview builds; the rule restates `release/install.sh`, `.github/workflows/release.yml` and `test/unit/install-script.test.ts`. No ADR decides the script's behaviour; it is detail no ADR states, recorded here and dated in the rule (workflow, "A ruling is recorded where it belongs").

## 5. Code notes

- **ST-65 (fixed).** Under Running, a commit made while answering a `GET` or `HEAD` request, such as the initialization the page's first working read makes (MG-74), is not an Edit and schedules no Export (`readsMarked`, `src/run/run.ts`). The initialization stays in the memory store, and the next Export an Edit triggers writes it. Held by three tests in `test/unit/run.test.ts`: "writes nothing when opening a Space initializes it and nothing is edited (ST-65)", "writes the initialization with the next Edit (ST-65)" and "initializes a Space with no Map when it is read, and writes those same ids with the next Edit (ST-65)".
- **Two doors, one intake.** 0010 says `loadSpace` is the only intake. `loadSpaceSnapshot` (`graph/src/space.ts`) builds a Space from a stored snapshot; both go through `buildSpace` and `documentRefusal`, so ST-22 states one intake and names no function. `docs/adr/archive/agent-guides/editing-and-persistence.md` repeats "the one intake" for `loadSpace` alone.
- **Strictness split.** `spaceFileObjectSchema` is a `strictObject`, and `.omit()`/`.extend()` carry it to the stored document, snapshot and import variants. Only the Resource envelope differs: `resourceFileSchema` is `.strict()`, `resourceDocumentSchema` is not. Each kind's content schema is strict at every door (`core/test/resource-document-equality.test.ts`). This answers audit-split §3 item 10.
- **Stale comment.** `core/src/schema.ts` says of `maps` that "a Space with no Maps … is what a new Space is"; a new Space has a Map (see SR).
- **Space directory names.** A Space directory's name is its identity (ST-27, ST-44), unlike a Resource file's (ST-29). No ADR states the Space half; `docs/aggregate-directory.md` does, and the reader enforces it.
- **SVG.** The asset store admits SVG like any bytes but serves it as `application/octet-stream` (`persistence/src/assets.ts` `servedMediaType`); the Image plugin refuses an SVG picture (`plugin-image/src/domain.ts`). 0107 is proposed and left out.
- **Mounting status.** `.scratch/mounting/issues/` 01–07, 09, 10, 13 are resolved; 11 (0132) and 12 (download an edited Aggregate) are needs-triage; 08 is a launch task.

## 6. ADRs with one disposition throughout

Added 15 November 2026. These ADRs had no row in any trace. Each has one outcome throughout, so each takes one document-level row. A superseded ADR is history: its successor carries whatever survives, and the successor's rows are the ones to read.

| Source | Disposition |
|---|---|
| 0061 TypeScript 7 is the compiler and TypeScript 6 a bridge | sent → PROC: an engineering rule, owned by `docs/agents/build-tooling.md` |
| 0062 the narrowing assertions we have are the most we will have | sent → PROC: an engineering rule, owned by `docs/agents/anti-slop.md` |
| 0088 "Aggregate" names the Meta-rooted collection; one Space with its Resources is a Space snapshot | vocabulary → GL (`CONTEXT.md`, "Aggregate" and "Space snapshot"); ST uses both terms as defined (storage.md, Terms) |

## 7. Refresh to 17aab57, then a0f5066 (19–20 November 2026)

Each behaviour change merged between `9e9b094` and `17aab57` (PRs #481–#500, first-parent), and where it now lives. "Correct" means the PR's own edit to storage.md already stated it and this refresh only checked it.

| Source | Disposition |
|---|---|
| #481 Mermaid plugin (ADR 0158): `text/vnd.mermaid`, `mmd` assets | correct → ST-34, ST-112 |
| #482 one Cargo workspace for `crates/` and the desktop shell | build only; no storage rule (AGENTS.md) |
| #483 located intake refusals and the intake conformance corpus (ADRs 0156, 0159) | correct → ST-117 |
| #484 black-box HTTP conformance suite against the Node host | correct → ST-113–ST-116, ST-65, ST-81 evidence |
| #485 the Rust intake crate | correct → ST-118 |
| #486 the Rust host library; every Edit flushed on stop | correct → ST-119 |
| #487 the Rust CLI, `infinity-cube run` and `check` | correct → ST-120; locked refusal cross-referenced to ST-124 in this refresh |
| #488 desktop shell serves the Rust host through the `infinitycube` scheme, replacing the sidecar | correct → ST-121; ST-114's "go when a scheme replaces it" and ST-119's "is to run" made current in this refresh |
| #490 e2e waits for persisted revisions | test only; no storage rule |
| #491 cross-site changes refused in both hosts (ADR 0161) | correct → ST-123 |
| #493 one adapter for a built application directory | correct → ST-119, ST-120 |
| #494 shared HTTP conformance cases written once for both Rust adapters | correct → ST-119, ST-121, ST-123 evidence |
| #500 lone surrogate refused in both runtimes (ADR 0160) | correct → ST-22, ST-77, ST-118, ST-119 |
| #500 every host locks the directory it runs (ADR 0162) | correct → ST-124, ST-64, ST-66; release on Import refusal, the `.gitignore` entry and the no-lock `cube mcp` added in this refresh (ST-124, ST-111); operations index rows now name ST-124 |
| #500 refuse a Space named in upper case, in both hosts | → ST-16; source and the conformance case's citation corrected in this refresh |
| #500 judge a change's `Origin` whatever its `Sec-Fetch-Site` says | correct → ST-123 (code now matches ADR 0161's second arm) |
| #500 serve `index.html` as the page, with its policy, in both hosts; the sidecar reads its page past that refusal | correct → ST-115 (evidence cited by path in this refresh), ST-119 |
| #500 show a dialog when saving fails and when it recovers | correct → ST-121 |
| #500 a close waits ten seconds, then asks (proposed ADR 0163) | correct → ST-122, as built; ADR 0162 added to its sources for the abandoned write's lock |
| #500 a link swapped in after Export's or a built file's check is out of scope | correct → ST-57, ST-119 |
| #500 a regular file named as `--built` refused before its page is looked for; an unreadable file under `/assets/` | correct → ST-119, ST-120 |
| #500 Windows Rust test job | correct → ST-124 (Windows evidence) |
| #498 CI review workflow | CI only; no storage rule |
| PR 504 (ADR 0164) and PR 511 (ADR 0166, `infinity-cube init`, the release workflow), merged between `17aab57` and `a0f5066` | correct → ST-11, ST-36, ST-70, ST-120 and the reworded rules, edited on main in the same changes; merged here with this refresh's ST-124 edits |

## 8. Refresh to f6e01b9 (21 November 2026)

Each change main merged between `a0f5066` and `f6e01b9` (PRs #506 and #502, first-parent), and where it now lives.

| Source | Disposition |
|---|---|
| #506 ADR 0165: the plain-SQL files under `migrations-sql/`, one per Prisma Next package, held to its statements by `test/unit/shared-migrations.test.ts` and to its schema by `crates/host/tests/shared_migrations.rs`, which CI's `rust` job runs against SQLite and PostgreSQL | correct → ST-125 (its rows are in §1); the marker now names ADR 0165 for ST-125, where it had named 0155 and 0156; the unit test's titles cited in this refresh |
| #506 `migrations-sql/` excluded from the vocabulary guard as history (`test/unit/current-domain-vocabulary.test.ts`) | process only; no storage rule (ADR 0085, ADR 0164) |
| #502 the SQLite host's rules moved from the README into ST-126–ST-128 | correct → ST-126, ST-127, ST-128 (§4 records them as code only) |
| #502 the README and the getting-started skill tell a person to add `.infinity-cube.lock` to the content repository's `.gitignore`; the README states the lock and that a run with no Edit leaves the directory unchanged beside the lock file | → ST-124, which now names them; ST-65 already stated the rest |

## 9. Refresh to 3f6aa29 (24 November 2026)

Each change main merged between `f6e01b9`'s refresh (PR #503, merged as `46b0999`) and `3f6aa29` (PRs #514, #513, #516, #522, #523, #517, #524, #526, #525, #515 and #527, first-parent), and where it now lives. The ADRs among them have their rows in §1.

| Source | Disposition |
|---|---|
| #513 the install script (`release/install.sh`), its tests and the release workflow's install checks | → ST-129, added on main with it |
| #516 `release/build.sh`, the one build of a preview build | → ST-129 (the workflow's build jobs), ST-130 |
| #522 the ad-hoc signed macOS preview build, the update bundle and the updater | → ST-130, added on main with it |
| #517 one window per Space, File › Open…, the offer to create a Space and File › New Space… (ADR 0167) | → ST-121, reconciled on main with it |
| #524 the platforms' menus, Help, View, About and Check for Updates… (ADR 0168) | → ST-121, reconciled on main with it |
| #526 preview builds as normal releases, the updater at `releases/latest` (ADR 0169) | → ST-130; ST-129 now also sources 0169, which changed what the script reads (this refresh) |
| #527 the Start window, New Space's folder rules and refusal codes, `init_directory` taking a Title, the shell's own build (ADRs 0171 and 0172) | → ST-131 and ST-121, added on main with it; ST-11 states the Title `init_directory` takes (this refresh) |
| #514, #523, #515 the README, the desktop contributor skill and a getting-started ticket | no storage rule; documentation only |
| #525 the CRAP gate in CI | process only → `AGENTS.md` (CRAP) |
| #517 also sent a picked file's bytes from memory rather than as the Blob (`packages/http/src/backend.ts`) | already in ST-121's evidence; no rule changes |
| ST-121's sources named ADR 0168 twice and not 0171, whose Start window it points to | corrected (this refresh) |
| The operations index's Desktop shell row named File › New Space… writing a Space and not the Start window's form or its refusals | corrected → ST-131 (this refresh) |

## 10. Refresh to 343a66c (25 November 2026)

The snapshot marker moved from `3f6aa29` to `343a66c` and to accepted ADRs through 0174; at that commit both 0173 and 0174 (sqlx is the only migrator) carried the number 0173, and the later was renumbered 0174 on 25 November 2026. Each change main merged between them (PRs #508, #509, #518 and #519, first-parent) was read for behaviour this doc states. The ADRs among them have their rows in §1; main had appended 0174 (sqlx is the only migrator) to ST-125 and ST-126 and duplicate rows for 0167–0171 here without moving the marker, and this refresh reconciled both.

| Source | Disposition |
|---|---|
| 0174 (sqlx is the only migrator) | → ST-125, ST-126, ST-120 and the operations index, as **not built** (§1). ST-125 now separates the two encodings, built, from the single migrator, not built, and states the rules main's restatement left out: every caller runs `migrate`, no host migrates on start, the contract is kept for queries until rust-host 20, and the scripts go with the packages (this refresh) |
| 0173 (Shift at Resize start keeps the Resource's proportions) | reviewed, no rule here (§1) |
| "Refined by" added to the status lines of ADRs 0122 (0173) and 0155 and 0165 (0174) | no rule changes: each refinement is restated where its ADR is (ST-125, ST-126; 0122's in Rendering, UI and Maps and Graphs (MG-23)) |
| #508, #509 proportional Resize (ADR 0173, Shift at Resize start): `packages/react-flow-adapter/src/proportional-resize.ts`, `ResourceNode.tsx`, an E2E spec and a story inventory entry | no storage rule; the release writes one ordinary Resize commit |
| #518 ADR 0174 (sqlx is the only migrator), triage of rust-host 15 and 16, the mise ticket (`.scratch/toolchain/issues/01-adopt-mise.md`) | ADR → ST-125, ST-126 (§1); the tickets and the toolchain proposal are process only, and rust-host 15 restates ST-126's path rules for a Rust host without changing them |
| #519 the SQLite restart proof's host started by command (`INFINITY_CUBE_RESTART_PROOF_HOST`, `test/support/restart-proof-host.ts`, `test/support/run-with-cleanup.ts`), and `env` in the HTTP conformance host's JSON (`conformance/http/README.md`, `host-process.ts`, `node-host.ts`) | process only → `AGENTS.md` (E2E) and `conformance/http/README.md`; no storage rule names the test harness's host description, and ST-126–ST-128 hold for whichever host the proof starts |
| `AGENTS.md` between the two commits | changed only in the E2E paragraph (#519, above) |
| Duplicate §1 rows for 0167, 0168, 0169 and 0171 that main appended "restated after the marker's check" | removed: superseded by the detailed rows above them (this refresh) |
