# A Resource id is written in lower case, and intake refuses one that is not

Status: accepted
Date: 2026-11-26
Related: 0078, 0095, 0128, 0156, 0177

Intake in both runtimes read a Resource's id as any UUID, `z.string().uuid()` in TypeScript and `Uuid::parse` in the Rust `intake` crate, which accept upper and lower case alike and keep the id as written. The PostgreSQL store holds a Resource's id in a `uuid` column (ADR 0095, ADR 0177), which reads every id back in lower case. So on PostgreSQL a commit adding a Resource whose id has an upper-case letter succeeded and the next load of its Space failed intake as broken stored state, because the Map and Edges still named the id as written; and two Resources whose ids differ only in case both passed intake and were held as one row, the second overwriting the first. SQLite and memory keep the spelling, so the same commit had a different outcome on each store, which ADR 0078 calls defective. The maintainer decided on 26 November 2026 that a Resource id is lower case only.

## The decision

- **A Resource's own id is a UUID written in lower case.** Intake refuses one with an upper-case letter in both runtimes, wherever a Resource is named: a Resource file's `id` (refused as `invalid-resource-file` at the file's name, field `id`) and a committed snapshot's Resource entry (refused as `invalid-shape` at `<space>/resources/<id>.json`, field `id`). TypeScript's `resourceIdSchema` in `@project/core` and the `intake` crate's `resource_id` give the refusal; the conformance corpus holds both to it (`directory/invalid-resource-file-id-upper-case`, `directory/invalid-resource-file-id-case-twin`, `commit/resource-id-upper-case`).
- **A value that is not a UUID meets the one refusal it met before.** The case is asked only of a UUID.
- **Every store, both runtimes.** The rule is intake's, so memory, SQLite and PostgreSQL see only lower-case Resource ids and answer the same commit the same way.
- **A reference is not refused for its case.** An Edge's `from` and `to`, a Map's position keys and a Reference Resource's `target` stay any UUID. One spelled in upper case names no Resource, and the refusals for a missing Resource already answer it.
- **Only Resource ids.** A Space's id is already lower case where it matters: its directory's name is read only in lower case (ST-27) and a commit names a Space only in lower case (ST-16). Map and Graph ids are held inside a Space's JSON document, not in a `uuid` column, so no store changes their spelling.
- **The published id schema is unchanged.** `docs/schema/id.schema.json` is shared by every kind of id and the Resource file envelope refers to it, and a published schema refuses only what intake refuses, never all of it, so it still accepts an upper-case Resource id.

## Why

Refusing at intake is the one place both runtimes and every store share, so it removes the difference between stores rather than recording it. Lower case is what every id this build mints already is (`newUuid`, `Uuid::from_u128`), and what Export writes a Space's directory name in, so no file this build wrote is refused.

## Rejected

- **Folding an upper-case id to lower case at intake.** The Map, Edges and References name the id as written, so folding the Resource alone breaks them, and folding every reference is a rewrite of the author's file that Export would then write back.
- **Keeping the spelling on PostgreSQL** by moving the column off `uuid`. It changes the shared schema both runtimes migrate for an id no surface mints.
- **Refusing every id in upper case, references included.** A reference that names nothing is already refused, and Map and Graph ids reach no store that changes them.

## Consequences

A hand-written Resource file or a request with an upper-case Resource id that both runtimes accepted before is refused. The next requirements refresh folds this into Space and Resources and Storage.
