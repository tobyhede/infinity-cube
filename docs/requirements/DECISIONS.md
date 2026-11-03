# Rewrite decisions (3 November 2026)

Rulings made by the maintainer before the requirements docs were written. Evidence for each is in the checkpoint page.

## Structure

- **A. Docs:** Space and Resources; Maps and Graphs; Editing; Storage and hosts; Rendering; UI; Navigation (with a Presenting section). `CONTEXT.md` keeps names only.
- **B. Drafting rules:**
  1. Where a later ADR and the code agree, they win; the older rule is dropped.
  2. An accepted but unbuilt decision stays, marked *not built*, unless struck.
  3. Proposed ADRs are left out.
  4. Where the code contradicts every ADR, the rule goes to the maintainer; docs are never silently written to match the code.

## Rulings

1. **Switching Graphs is an Edit.** It writes the Map's `activeGraph`. (Code differs today.)
2. **Deleting a Graph:** the Map's saved Active Graph stays if it survives; otherwise the first survivor in list order becomes active and saved. This applies in every context, embedded included. (Code differs in the embedded case and while decision 1 is unbuilt.)
3. **Opening a Space never writes the directory.** First-load initialization does not trigger an Export under `run`. (Code differs today.)
4. **Mounted talks keep their edits across reload in browser storage (0132):** kept, not built. Today edits are lost on reload (0131).
5. **Undo:** kept, not built. It reverses one whole Edit, and acts on the selected occurrence's Space (0112). Until it is built, an Edit is reversed only by another Edit.
6. **Kept as not built:** kinds declare media types (0120); Default Content and CLI hard reset (0077); manual Graph reordering; keyboard access to a Resource's toolbar (0102); Auto-arrange. **Moved to open questions:** Edges between Spaces (0068, deferred by 0111).
7. **SVG images (0107, proposed):** left out.
8. **ADR 0115 is replaced.** The requirements docs are the binding record; the ADRs are archived as history. A behaviour change updates its doc in the same commit.

## Checkpoint 2 rulings (3 November 2026)

- **Drafting rule 5.** Behaviour the code implements and a test asserts, which no source contradicts, is a requirement. The trace marks it "code only".
- **C1.** Switching Graphs on the canvas also records the canvas Map as `defaultMap`.
- **C2.** Switching Graphs inside an Open Space Resource writes only that Space Resource's selection. The target Map's `activeGraph` is left alone.
- **C3.** Drawing an Edge that already exists is refused (`edge-already-exists`) with its message. `CONTEXT.md` changes to match.
- **C4.1.** Delete Map and Delete Graph on the canvas record the canvas Map as `defaultMap`, like every canvas Edit.
- **C4.2.** Delete Map: `defaultMap` stays if it survives; otherwise the first surviving Map in list order becomes `defaultMap`.
- **C4.3.** Add Map from an Open Space Resource leaves the target Space's `defaultMap` alone.
- **C6.** Confirmed: `Map N`/`Graph N` numbering details, menu step-off, Graph colour choice and fallback. Recolour's "unchanged" compares with the drawn colour, as head shape, Shape and Resize do.
- **C7.** An Edit whose own change is nothing is unchanged and writes nothing, Move included.
- **S1.** Every working read goes through the one initializing loader, wherever it runs.

The principle behind C1, C4 and C7: an Edit on the canvas records where the author is working; nothing else does.
