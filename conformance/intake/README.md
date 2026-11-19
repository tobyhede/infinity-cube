# Intake conformance corpus

Aggregate directories and commits, each with the answer intake must give it. ADR 0156 has each runtime keep one intake of its own, the TypeScript one (`loadSpace` and the Zod schemas) and the Rust one, and holds the two to each other with this corpus. For a refusal they must agree on **the kind of error and where it is**, never on the wording of its message. For an accepted directory they must also agree on the bytes Export writes, so the first Edit after the Rust host takes over does not rewrite every file of a talk.

This README is the whole format. A runner needs no TypeScript to read it.

## Where it lives, and why

`conformance/intake/` sits at the root of the repository, outside every package, because no runtime owns it. The TypeScript runner reaches it from `test/unit/intake-conformance.test.ts` as `../../conformance/intake`. A Rust crate under `crates/<name>/` reaches it the same way, as `concat!(env!("CARGO_MANIFEST_DIR"), "/../../conformance/intake")`. Neither runtime has to copy it, so the two cannot drift apart.

`.gitattributes` marks the whole tree `-text`, so git never rewrites a line ending. `.prettierignore` leaves it alone, because some files are deliberately not formatted the way Prettier would format them, and the recorded Export bytes are compared exactly.

## Layout

```
conformance/intake/
  directory/<case>/
    case.json        the case and its expected answer
    aggregate/       the Aggregate directory under test
    export/          optional: what Export writes for an accepted case
  commit/<case>/
    case.json        the case, its base and its expected answer
    commit.json      the commit body, as the browser sends it to POST /api/spaces
    next/            for an accepted case: the base directory after the commit and an Export
```

A case's name is its directory's name. Cases are independent and may run in any order.

### `case.json`

```json
{
  "description": "One Edge twice in one Graph (ADR 0032).",
  "expect": {
    "outcome": "refused",
    "refusals": [
      {
        "kind": "duplicate-graph-edge",
        "file": "10000000-0000-4000-8000-000000000001/space.json",
        "id": "00000000-0000-4000-8000-000000000b01",
        "edge": { "from": "…0101", "to": "…0102" }
      }
    ]
  }
}
```

- `description`: what the case is, in prose. Nothing reads it.
- `expect`: either `{ "outcome": "accepted" }` or `{ "outcome": "refused", "refusals": [ … ] }`, with at least one refusal.
- `base` (commit cases only): the name of an accepted directory case. The commit is applied to that case's `aggregate/`.

### A refusal

| Key | Present | Value |
| --- | --- | --- |
| `kind` | always | one of the kinds below |
| `file` | always | the file, by path relative to the Aggregate directory, `/` between segments: `aggregate.json`, `<space id>/space.json`, `<space id>/resources/<resource id>.json` or `assets/<name>`. A fault in a directory names the directory, and the Aggregate directory itself is `.` |
| `id` | when the rule says | the id of the entity holding the fault (a Map, a Graph, a Resource or the Space), or the id that is repeated |
| `field` | when the rule says | the field at fault. With `id`, a path relative to that entity; without, a path from the root of `file`. Segments are joined with `.`, and an array index is written in decimal, so `maps.0.title` or `positions.<resource id>.content` |
| `edge` | for an Edge | `{ "from": …, "to": … }`, the Edge's endpoints. An Edge has no id, so it is named by its endpoints within the Graph that `id` names |

A key that is not present is absent, not `null`. Two refusals are equal when all five keys are equal, an absent key equal only to an absent one.

A Resource is located in one of two ways. A fault in its file itself, found before the file's contents are read as a Resource (`invalid-json`, `invalid-resource-file`), is located at the file's own name in the directory, whatever id it holds (`invalid-resource-file-misnamed`, `invalid-json-resource-file-misnamed`). Every fault found after that, by a Space's intake or the aggregate's, is located at `<space id>/resources/<resource id>.json`, the file Export writes for it, whatever name its file has in the directory (`duplicate-resource-id`).

### Shape faults, one refusal each

`invalid-shape` and the schema half of `invalid-resource-file` report one refusal per fault, its `field` the path to the value at fault (absent for the root of the file). These rules decide what one fault is, so a runtime that does not use Zod reports the same refusals:

- **A value of the wrong type** (a JSON type other than the schema's, a value outside a closed list, a number where a string belongs) or **a required key that is missing** is one refusal at that value or key. Nothing inside a value of the wrong type is checked.
- **Undeclared keys**: an object carrying keys its schema does not declare is one refusal, located at the object itself, however many undeclared keys it carries: at the root of a file `field` is absent (`invalid-shape-undeclared-key-root`, `invalid-resource-file-undeclared-key`), and a Graph's is `maps.<i>.graphs.<j>` (`invalid-shape-undeclared-key-nested`, `invalid-shape-undeclared-keys-one-object`). The object's declared keys are still checked.
- **Siblings are independent**: every declared key of an object, every element of an array and every entry of a keyed object (`positions`) is checked, and each fault among them reported (`invalid-shape-several-faults`).
- **Checks on a value of the right type** (a Title not empty, an Edge Title trimmed and on one line, an id's pattern) are each their own refusal at that value, so a value failing two checks is refused twice at the one field (`invalid-shape-two-checks-one-value`).
- **A check across an object's fields** (an Edge hides only a Title it has, located at `titleHidden`) is made only when nothing anywhere inside the object is missing or of the wrong type (`invalid-shape-object-check-skipped`). A failed check on a value of the right type, or an undeclared key, inside the object does not prevent it (`invalid-shape-object-check-made`).
- **A Map's `kind`** chooses the schema the rest of the Map is checked by. A missing or unknown `kind` is one refusal at `maps.<i>.kind`, and nothing else in that Map is checked (`invalid-shape-map-kind-unknown`).

## Running a directory case

1. Copy `aggregate/` to a fresh directory of its own. Never run a case in place.
2. Import it as `cube check` does: read the files, run intake over each Space, then run intake over the whole aggregate. The cases carry every id, so the runner's id generator must refuse to mint one: reaching it means the runtime minted where the reference implementation did not.
3. The answer is `accepted`, or `refused` with the refusals intake gave. Compare it with `expect`. Refusals are compared as a multiset: order does not matter, and how many times each one appears does.
4. For an accepted case, Import a second fresh copy into a fresh memory store and Export the store in place onto that copy, as a run writes a talk back. Compare the whole tree with `export/` if the case has one, and with `aggregate/` if it does not. That second form means "Export writes this directory back unchanged". The trees must hold the same paths, relative to their roots with `/` between segments, and each file the same bytes. Directories are compared only through the files in them.

An asset a Resource names whose bytes `assets/` does not carry is not a refusal (`accepted-image`).

## Running a commit case

1. Copy the base case's `aggregate/` to a fresh directory and Import it into a fresh memory store, as step 2 above. Every Space Import stores is at revision `0`, so an `update` or `delete` change expects revision `"0"`.
2. Decode `commit.json` as the HTTP application decodes a `POST /api/spaces` body, and decide it as the store decides a commit: against the complete candidate aggregate, the stored Spaces with each change applied, judged ascending by Space id.
3. The answer is `accepted` if the commit lands, or `refused` with the refusals. A snapshot the decoder refuses gives `invalid-shape` refusals, located in the Space directory of the change's `spaceId` by the rules above (`resource-content-refused`). These are the runner's answer, not one a host sends: the HTTP application answers that body with an `invalid-request` problem that carries no kind or location, and the corpus holds the decoder to where each fault is. Compare the answer with `expect`, as for a directory case.
4. For an accepted case, Export the store in place onto the directory from step 1, and compare the whole tree with `next/`.

A conflict, or a commit refused before it is judged (no changes, one Space named twice), is not an intake answer, and no case expects one. The HTTP conformance suite holds those.

## Which refusals appear

Intake runs in stages, and **a stage that refuses stops intake**: the refusals of the stages after it are not reported, even when they would also apply. Within a stage, every independent fault is reported. A runner has to stop where the reference stops, or it reports refusals the corpus does not expect.

1. **The root and `aggregate.json`.** The root is listed first, and a symbolic link at a path Import owns there is refused at once. Then a missing, unreadable, non-JSON or misshapen `aggregate.json` is the only refusal.
2. **Listing.** Every directory Import lists (the root's child directories, each Space directory's `resources/`, and `assets/`) is listed before anything is refused, and every fault in listing (`unreadable`, `symbolic-link`) is reported together. A child directory holding no `space.json` is not a Space directory, and nothing in it is read.
3. **Reading.** Every file is read and every Space directory parsed before anything is refused, so each Space's faults and each asset's are reported together. Within one Space directory: a name that is not its Id refuses that directory alone; then a `space.json` of an unsupported version or with a space-level `graphs` refuses that directory alone; then its `space.json` shape faults and every Resource file's faults are reported together; then a `space.json` `id` that disagrees with the directory name.
4. **Each Space's intake**, every Space's refusals reported together. Within one Space, shape first, over `space.json` and every Resource together; then, only if the shape holds, the references within the Space, all reported together.
5. **The aggregate**, a stage at a time: Space ids repeated; Resource ids repeated across Spaces; the Meta Space missing; Space references to Spaces the aggregate does not hold; Space Resource selections; Space reference cycles across Spaces; ordinary Spaces nothing references. While a Resource of a kind no listed plugin draws remains, an ordinary Space nothing references is held rather than refused (ADR 0142), and a commit is not refused for an unreferenced Space the stored aggregate already held.

Two rules choose which of several places is reported:

- **A repeated id within a Space** (`duplicate-resource-id`, `duplicate-graph-id`, `duplicate-map-id`) is reported once for each id repeated, however many times it appears (`duplicate-ids-three-copies`). The Edges of a Graph are the exception: `duplicate-graph-edge` is reported once for each repeat.
- **`duplicate-resource-id` across Spaces** is reported once for each Space after the first that holds the id, Spaces taken in ascending order of Space id.
- **`space-reference-cycle` across Spaces** is reported once for each reference that closes a cycle in a depth-first walk that starts from each unvisited Space in ascending order of Space id and follows a Space's references in the order of its Resources and of the references each declares. Resources are ordered by Title, then by id, each compared **by UTF-16 code unit**, as JavaScript's `<` compares strings: never by locale, so `"Zeta"` comes before `"alpha"` (`space-reference-cycle-resource-order`). A Rust runner must compare `encode_utf16()` sequences, or equivalent: UTF-8 byte order agrees with it except where a character outside the Basic Multilingual Plane meets one from U+E000 to U+FFFF. A reference to a Space that is still being walked closes a cycle.

## Refusal kinds

The closed list. Each kind is named from the intake's own error types (`SpaceError`, `SpaceAggregateError` and the directory reader's refusals in the TypeScript intake), never from message text. `test/unit/intake-conformance.test.ts` holds this table to the TypeScript list, `INTAKE_REFUSAL_KINDS` in `packages/aggregate/src/intake-refusal.ts`, and to the cases. A Resource reference or Space reference is a field a plugin declares, so the refusals about one name the Resource's file and id and no `field`.

| Kind | Raised when | Located at | Cases |
| --- | --- | --- | --- |
| `aggregate-file-missing` | The directory has no `aggregate.json`, as a single Space directory does | `aggregate.json` | `directory/aggregate-file-missing` |
| `unreadable` | A directory could not be listed, or a file could not be read | the directory or file | Not in the corpus: a file git can check out is readable |
| `symbolic-link` | A path Import owns (`aggregate.json`, `assets/`, a Space directory, its `space.json`, `resources/` or a Resource file, or an asset file) is a symbolic link | the link | Not in the corpus: a symbolic link is not portable to every checkout |
| `space-directory-name` | A child directory holding a `space.json` is not named for a Space Id in lower case | the directory | `directory/space-directory-name`, `directory/space-directory-name-upper-case` |
| `space-id-mismatch` | A `space.json` declares an `id` other than its directory's name | `<dir>/space.json`, field `id` | `directory/space-id-mismatch` |
| `asset-refused` | A file in `assets/` is not an asset the host stores (over its size cap) | `assets/<name>` | Not in the corpus: the cap is 10 MiB |
| `asset-file-name` | A file in `assets/` is named by a hash that is not its content's | `assets/<name>` | `directory/asset-file-name` |
| `duplicate-asset` | Two or more files in `assets/` are named by one hash | each such file after the first in ordinal order of name | `directory/duplicate-asset` |
| `invalid-json` | `aggregate.json`, a `space.json` or a Resource file is not JSON | the file, by its own name | `directory/invalid-json-aggregate-file`, `directory/invalid-json-space-file`, `directory/invalid-json-resource-file`, `directory/invalid-json-resource-file-misnamed` |
| `invalid-shape` | `aggregate.json`, a `space.json` or a committed snapshot does not have the shape its schema requires | the file, field the schema's path to the fault, one refusal per fault as "Shape faults, one refusal each" says | `directory/invalid-shape-aggregate-file`, `directory/invalid-shape-space-file`, `directory/invalid-shape-undeclared-key-root`, `directory/invalid-shape-undeclared-key-nested`, `directory/invalid-shape-undeclared-keys-one-object`, `directory/invalid-shape-several-faults`, `directory/invalid-shape-two-checks-one-value`, `directory/invalid-shape-object-check-skipped`, `directory/invalid-shape-object-check-made`, `directory/invalid-shape-map-kind-unknown`, `commit/resource-content-refused` |
| `invalid-resource-file` | A Resource file declares no `kind`, a `kind` that is not a kind id, or an envelope or content its schema refuses | the file, by its own name, field `kind` or the schema's path to the fault, as for `invalid-shape` | `directory/invalid-resource-file-kind`, `directory/invalid-resource-file-content`, `directory/invalid-resource-file-misnamed`, `directory/invalid-resource-file-undeclared-key` |
| `unsupported-version` | A `space.json` declares a version this build does not read | `<dir>/space.json`, field `version` | `directory/unsupported-version` |
| `retired-space-graphs` | A `space.json` carries a space-level `graphs` (ADR 0040) | `<dir>/space.json`, field `graphs` | `directory/retired-space-graphs` |
| `duplicate-resource-id` | Two Resources in one Space, or in two Spaces, share an id | the Resource's file, id the Resource id, once for each id repeated within a Space; across Spaces, in each later Space | `directory/duplicate-resource-id`, `directory/duplicate-resource-id-across-spaces`, `directory/duplicate-ids-three-copies` |
| `duplicate-graph-id` | Two Graphs in one Space share an id, on one Map or two | `space.json`, id the Graph id, once for each id repeated | `directory/duplicate-graph-id`, `directory/duplicate-ids-three-copies` |
| `duplicate-map-id` | Two Maps in one Space share an id | `space.json`, id the Map id, once for each id repeated | `directory/duplicate-map-id`, `directory/duplicate-ids-three-copies` |
| `map-member-missing-resource` | A Map places a Resource the Space does not hold | `space.json`, id the Map id, field `positions.<resource id>` | `directory/map-member-missing-resource` |
| `map-active-graph-missing` | A Map opens active on a Graph no Map in the Space owns | `space.json`, id the Map id, field `activeGraph` | `directory/map-active-graph-missing` |
| `map-active-graph-outside-map` | A Map opens active on a Graph another Map owns | `space.json`, id the Map id, field `activeGraph` | `directory/map-active-graph-outside-map` |
| `graph-edge-missing-resource` | An Edge endpoint names a Resource the Space does not hold | `space.json`, id the Graph id, edge, field `from` or `to` | `directory/graph-edge-missing-resource` |
| `graph-edge-resource-outside-map` | An Edge endpoint names a Resource of the Space that its Graph's Map does not place | `space.json`, id the Graph id, edge, field `from` or `to` | `directory/graph-edge-resource-outside-map` |
| `unresolved-default-map` | `defaultMap` names no Map of the Space | `space.json`, id the Space id, field `defaultMap` | `directory/unresolved-default-map` |
| `duplicate-graph-edge` | One Edge appears again in its Graph (ADR 0032), once for each repeat | `space.json`, id the Graph id, edge | `directory/duplicate-graph-edge`, `commit/duplicate-graph-edge` |
| `reference-targets-self` | A Resource reference names the Resource declaring it | the declaring Resource's file and id | `directory/reference-targets-self` |
| `reference-target-missing` | A Resource reference names a Resource the Space does not hold | the declaring Resource's file and id | `directory/reference-target-missing`, `commit/dangling-reference` |
| `reference-target-not-targetable` | A Resource reference names a Resource whose kind may not be a Target, such as another Reference | the declaring Resource's file and id | `directory/reference-target-not-targetable` |
| `space-reference-cycle` | A Space reference names the Space holding it, or closes a cycle across Spaces | the declaring Resource's file and id | `directory/space-reference-cycle-own-space`, `directory/space-reference-cycle-across-spaces`, `directory/space-reference-cycle-resource-order` |
| `map-content-invalid` | A placement keeps Map content its Resource's plugin refuses | `space.json`, id the Map id, field `positions.<resource id>.content` | `directory/map-content-invalid`, `commit/map-content-refused` |
| `duplicate-space-id` | Two Spaces of one aggregate share an id | `<space id>/space.json`, id the Space id | Not in the corpus: directory names are unique, and a commit creating a stored Space is a conflict |
| `meta-space-missing` | `aggregate.json` names a Meta Space the aggregate does not hold | `aggregate.json`, field `metaSpaceId` | `directory/meta-space-missing` |
| `space-reference-missing` | A Space reference names a Space the aggregate does not hold | the declaring Resource's file and id | `directory/space-reference-missing` |
| `ordinary-space-unreferenced` | A Space other than the Meta Space has no Space Resource holding it | `<space id>/space.json`, id the Space id | `directory/ordinary-space-unreferenced`, `commit/create-unreferenced-space` |
| `space-resource-map-missing` | A Space Resource selects a Map its Space does not have | the Space Resource's file and id | `directory/space-resource-map-missing` |
| `space-resource-graph-missing` | A Space Resource selects a Graph its Space does not have | the Space Resource's file and id | `directory/space-resource-graph-missing` |
| `space-resource-graph-outside-map` | A Space Resource selects a Graph its Space has but its selected Map does not own | the Space Resource's file and id | `directory/space-resource-graph-outside-map` |

A snapshot whose Resource has no string id is located at `<space id>/resources/[<index>].json`, by its position in the snapshot's `resources`. A snapshot whose `resources` is missing or not an array is located at the directory `<space id>/resources`, with no `field`. No case reaches either.

## Accepted cases

One for each listed plugin (`accepted-ur`, `accepted-markdown`, `accepted-image`, `accepted-reference`, `accepted-space`); a kind no listed plugin draws, carried whole (`accepted-unknown-kind`); a Space with no Map yet (`accepted-space-without-map`); and `accepted-rewritten`, whose files are compact JSON in an order Export does not write, so its `export/` records what Export writes: keys in Export's order, two-space indentation and a closing newline. Every other accepted case is already as Export writes it and round-trips unchanged. The commit cases `accepted-update` and `accepted-delete-resource` record the directory after the commit in `next/`.

## Adding a case

Write the case's files by hand and its expected answer from the rules above, never by copying what an implementation answers. Export bytes are the exception: `export/` and `next/` are what the TypeScript Export writes, recorded by running it, because the Rust Export is held to them. A plugin's content rules change in both runtimes in the same change, with cases for both (ADR 0156).
