# Conflicts: Maps and Graphs

Every Maps and Graphs conflict is closed by the "Checkpoint 2 rulings" in [../DECISIONS.md](../DECISIONS.md). Conflict ids are never reused. The code changes the rulings require are listed under "Bugs" in [../maps-and-graphs.md](../maps-and-graphs.md).

- **C1. Closed by ruling C1.** Switching Graphs on the canvas also records `defaultMap`. See MG-46 (bug).
- **C2. Closed by ruling C2.** Switching inside an Open Space Resource writes only the Space Resource's selection. See MG-47 (built).
- **C3. Closed by ruling C3.** Drawing an existing Edge is refused with `edge-already-exists`. See MG-61 (built). `CONTEXT.md` must change; see the trace, §3.
- **C4. Closed by rulings C4.1–C4.3.**
  - Canvas deletions record `defaultMap`: MG-81 (bug).
  - Delete Map keeps `defaultMap` if it survives, else takes the first survivor: MG-14 (bug in the embedded case).
  - Add Map from an Open Space Resource leaves the target's `defaultMap` alone: MG-11 (bug).
- **C5. Closed** before checkpoint 2. 0091 ("resulting surviving Graph") with DECISIONS 2 settles it. See MG-56 (bug).
- **C6. Closed by ruling C6 and drafting rule 5.** The numbering details (MG-10, MG-42), the menu step-off (MG-18) and the colour choice and fallback (MG-48) are confirmed as built, code only. Recolour compares with the drawn colour: MG-49 (bug).
- **C7. Closed by ruling C7.** An Edit whose own change is nothing is unchanged and writes nothing. See MG-83 (bug).
