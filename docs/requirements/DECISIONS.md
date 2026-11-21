# Rewrite decisions (3 November 2026)

Rulings made by the maintainer while the requirements docs were written. Each was put to the maintainer on a checkpoint page with its evidence; those pages were not preserved in the repository. Where a ruling closed a conflict, the conflict file under `conflicts/` keeps the disagreement, the options and the evidence. The run record, `.scratch/requirements-rewrite/RUN.md`, says what else of the run survives.

These rulings do not bind on their own. ADRs bind (ADR 0145): a ruling that changes what an accepted ADR decides is recorded as an ADR, listed under "Rulings recorded as ADRs" below (ADR 0146–0154), and the requirements restate it from there.

## Structure

- **A. Docs:** Space and Resources; Maps and Graphs; Editing; Storage and hosts; Rendering; UI; Navigation (with a Presenting section). `CONTEXT.md` keeps names only.
- **B. Drafting rules:**
  1. Where a later ADR and the code agree, they win; the older rule is dropped.
  2. An accepted but unbuilt decision stays, marked *not built*, unless struck.
  3. Proposed ADRs are left out.
  4. Where the code contradicts every ADR, the rule goes to the maintainer; docs are never silently written to match the code.

## Rulings

1. **Switching Graphs is an Edit.** It writes the Map's `activeGraph`. (Code differs today.) Recorded as ADR 0146.
2. **Deleting a Graph:** the Map's saved Active Graph stays if it survives; otherwise the first survivor in list order becomes active and saved. This applies in every context, embedded included. (Code differs in the embedded case and while decision 1 is unbuilt.)
3. **Opening a Space never writes the directory.** First-load initialization does not trigger an Export under `run`. (Code differs today.)
4. **Mounted talks keep their edits across reload in browser storage (0132):** kept, not built. Today edits are lost on reload (0131).
5. **Undo:** kept, not built. It reverses one whole Edit, and acts on the selected occurrence's Space (0112). Until it is built, an Edit is reversed only by another Edit.
6. **Kept as not built:** kinds declare media types (0120); Default Content and CLI hard reset (0077); manual Graph reordering; keyboard access to a Resource's toolbar (0102); Auto-arrange. **Moved to open questions:** Edges between Spaces (0068, deferred by 0111).
7. **SVG images (0107, proposed):** left out.
8. ~~**ADR 0115 is replaced.** The requirements docs are the binding record; the ADRs are archived as history. A behaviour change updates its doc in the same commit.~~ **Reversed by the maintainer on 15 November 2026.** ADRs stay binding and append-only, in `docs/adr/` and `docs/adr/superseded/`, and the requirements docs are a snapshot that restates them at a recorded commit (ADR 0145, which supersedes ADR 0115). A requirement that disagrees with an accepted ADR is a defect in the requirement, and an ADR accepted after a doc's snapshot marker binds where they differ until the doc is updated.

## Checkpoint 2 rulings (3 November 2026)

- **Drafting rule 5.** Behaviour the code implements and a test asserts, which no source contradicts, is a requirement. The trace marks it "code only".
- **C1.** Switching Graphs on the canvas also records the canvas Map as `defaultMap`. Recorded as ADR 0146.
- **C2.** Switching Graphs inside an Open Space Resource writes only that Space Resource's selection. The target Map's `activeGraph` is left alone. Recorded as ADR 0146.
- **C3.** Drawing an Edge that already exists is refused (`edge-already-exists`) with its message. `CONTEXT.md` changes to match. Recorded as ADR 0147.
- **C4.1.** Delete Map and Delete Graph on the canvas record the canvas Map as `defaultMap`, like every canvas Edit.
- **C4.2.** Delete Map: `defaultMap` stays if it survives; otherwise the first surviving Map in list order becomes `defaultMap`.
- **C4.3.** Add Map from an Open Space Resource leaves the target Space's `defaultMap` alone.
- **C6.** Confirmed: `Map N`/`Graph N` numbering details, menu step-off, Graph colour choice and fallback. Recolour's "unchanged" compares with the drawn colour, as head shape, Shape and Resize do.
- **C7.** An Edit whose own change is nothing is unchanged and writes nothing, Move included.
- **S1.** Every working read goes through the one initializing loader, wherever it runs.

The principle behind C1, C4 and C7: an Edit on the canvas records where the author is working; nothing else does.

## Checkpoint 3 rulings (6 November 2026)

- **Drafting rule 6. Presentation is not a requirement.** A rule that only fixes how something looks or moves, and can be changed in CSS or styling alone without changing what the author can see, reach or do, does not belong in these docs. Examples: durations, easing, colour values, opacity levels, sizes, spacing, fonts, shadows and animation choreography. The code and its tests are the record for these. A rule stays when it is structural: what is drawn and what it means, what is visible or hidden, what can be reached or clicked, what is announced or focused, and what is stored. Removed rules become "XX-n: removed (drafting rule 6)". Removing a rule from these docs does not unbind it: where an accepted ADR decides the presentation, such as ADR 0139's ring colour or ADR 0143's lane gaps, that ADR still binds, and changing it takes a new ADR.
- **Rendering C2 is closed by drafting rule 6.** How fast a Resource fades when the Active Graph changes is presentation. RD-28 is removed.

Ruled 12 November 2026, after an independent audit of each recommendation. Code changes these rulings call for are out of scope for the docs: each rule records the ruled behaviour with its status.

- **Editing C1.** Accept stored after a failed two-Space save replaces every Space the save covered, and each one discards its drafts and pending work, the other Space included. Example: an image replacement still loading in the other Space is dropped, not written into the restored copy. Bug: code differs.
- **Editing C2.** An Edit that waited behind another and is then refused reports the refusal where the author made it, or announces it if that surface has closed. No draft is kept. Every caller treats a waiting Edit the same way. Bug: code differs.
- **Editing C3.** A broken invariant reached from any canvas gesture is reported, never thrown, and the gesture does nothing. This covers connecting, Resize, Move and Edge commands. Why: a throw in a gesture handler leaves the gesture half-finished. It does not unmount the canvas. Bug: code differs.
- **Navigation C1.** Meta is the only permanent Space. Exiting the last open Space opens Meta with no Opener and puts Meta's address in the address bar. Not built.
- **Navigation C2.** Graph navigation on the canvas moves to the Active Graph neighbour in the arrow's direction, along an Edge either way, and keeps no history. This overrules 0041:144-147, which gave the canvas a Traversal history, and the matching `CONTEXT.md` entries. Built. Recorded as ADR 0148.
- **Navigation C3.** A `refused` save counts as rejected: Open Spaces marks it and Exit warns. Built.
- **Rendering C1.** Open content that does not fit is clipped on the canvas. Markdown does not scroll there, and an embedded Map is placed at authored scale from its Resources' top-left, not shrunk to fit. To see more, the author resizes the Resource, or pans and zooms an embedded Map while its Space Resource is in Edit. Presenting still scrolls long Markdown. Recorded as ADR 0149.
- **Space and Resources C1.** Stop measuring an image's natural size. The `naturalSize` field stays optional in the file format and nothing reads it. It is removed at the next deliberate format change, because the strict schema would otherwise refuse every saved image. Bug: code differs (the code still measures). Recorded as ADR 0150.
- **Storage S2.** The format rolls forward because InfinityCube is unreleased and makes no compatibility promise for any copy outside the repository. An Aggregate directory is recovered from git or read with the build that wrote it. A browser's stored copy of a mounted talk (not built) may be unreadable after a deploy. Recorded as ADR 0152.
- **UI C1 is closed with no ruling.** The code already refuses a connection released on another drawing with wording ("An Edge can connect Resources only within the same drawn Map."), and two end-to-end tests assert it. The ADR and the code agree.
- **UI C2.** Remove from Map asks first only when it would delete Edges, and the question names the Graphs that lose them. Otherwise it removes at once. This applies from the menu and from the Delete key, embedded drawings included, and overrules the ticket that said Remove from Map is not a deletion. Bug: code differs.
- **UI C3.** Wherever a sentence quotes a Title, it uses the short Title: the first line, plus "…" when more lines follow. This covers questions, notices and Edge labels and their accessible names. Controls, list rows and chrome use the first line alone. Notices that quote the bare name are bugs. Recorded as ADR 0151.
- **UI C4** (15 November 2026, raised on review). A permanent rejection, and a refused save, is a dialog that takes focus until acknowledged. A retryable failure still takes none.

## Rulings recorded as ADRs (15 November 2026)

When ruling 8 was reversed, every ruling above that changes what an accepted ADR decides became an ADR of its own, so the requirement that states it rests on an ADR rather than on this page. The other rulings choose between sources, fill a gap no ADR decides, or settle a conflict between an ADR and the code without changing the ADR; they stay recorded here and in the conflict files.

| Ruling | Changes | Recorded as | Requirements |
|---|---|---|---|
| 1. Switching Graphs is an Edit; C1, it records the canvas Map as `defaultMap`; C2, inside an Open Space Resource it writes only that Space Resource's selection | 0028 (activation is not an Edit, and is not durable until a later Edit), the activation part of 0041, 0068's "changing the Graph inside writes nothing" and 0116's "choosing or viewing records nothing" | ADR 0146 | MG-45, MG-46, MG-47, MG-84 |
| C3. Drawing an existing Edge is refused | 0032's live draw as a no-op, and 0104's "changes nothing" | ADR 0147 | MG-61, UI-101 |
| Navigation C2. Graph navigation on the canvas keeps no history | 0041's canvas Traversal history | ADR 0148 | NV-13 |
| Rendering C1. Open content that does not fit is clipped | the fitting and scrolling part of 0122 | ADR 0149 | RD-5, RD-61, RD-67 |
| Space and Resources C1. Stop measuring an image's natural size | 0106's measurement on set, and 0126's bound on it | ADR 0150 | SR-26 |
| UI C3. A sentence quotes a Title by its short Title | 0083's "the first line and nothing else" for sentences | ADR 0151 | UI-99 |
| UI C2. Remove from Map asks first only when Edges would go | 0074's "asks first wherever authored work would be lost" for Remove from Map | ADR 0153 | UI-85 |
| Storage S3 (20 November 2026). Prisma Next applies its own packages and `sqlx` the plain-SQL files, held equal by tests | 0155's "plain SQL files that Prisma … all apply" | ADR 0165 | ST-125 |
| UI C4. A permanent rejection is a dialog that takes focus | 0042's "None steals focus" for a permanent rejection | ADR 0154 | UI-93 |
| Storage S2. No compatibility promise for a copy outside the repository | the reason 0054 and 0056 give for rolling forward | ADR 0152 | ST-36 |
| 8. (reversed) | 0115 | ADR 0145, which supersedes 0115 | `README.md`; every doc's snapshot marker |

## Refresh rulings (21 November 2026)

- **Editing C4.** A title an author writes that holds a lone UTF-16 surrogate is refused where it is written, before anything is committed (option (b)). It adds a rule no ADR states (ADR 0160 decides what the hosts refuse, not where the browser checks first) and fails the ADR test in `docs/agents/workflow.md`, being easy to reverse. SR-68 states it, not built; `conflicts/editing.md` C4 keeps the evidence.
