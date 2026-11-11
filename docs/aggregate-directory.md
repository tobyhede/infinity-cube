# The Aggregate directory

An **Aggregate directory** is the on-disk form of everything InfinityCube holds: every Space, rooted at the Meta Space, plus the assets its Resources use: a Markdown Resource's text and the pictures its Image Resources show. `pnpm cube init <dir>` creates one, `pnpm cube run <dir>` runs one ([ADR 0117](adr/0117-running-serves-an-aggregate-directory-as-the-durable-copy.md)), `pnpm cube check <dir>` reads one as a run would without serving or writing it, `pnpm cube mcp <dir>` serves a local MCP server that edits one's files, and `pnpm cube import` and `pnpm cube export` Import one into a database and Export one back out ([ADR 0124](adr/0124-one-hyper-cli.md)). Exporting writes the same format whichever store it reads from.

The directory is plain files meant for git: JSON in a fixed key order, one JSON Resource file per Resource, and assets (a Markdown Resource's text, a picture) named by their content. Exporting the same content twice writes the same bytes, so a diff shows only what changed.

```
my-talk/
  aggregate.json                                 { "version": 1, "metaSpaceId": "2b1c9a40-…" }
  2b1c9a40-0f0e-4c55-9d3a-6f1d2e3a4b5c/          the Meta Space
    space.json
    resources/
      a0000000-0000-4000-8000-000000000001.json
      a0000000-0000-4000-8000-000000000002.json
  7e4f0d2a-3c1b-4a6e-8f9d-0a1b2c3d4e5f/          an ordinary Space
    space.json
    resources/…
  assets/
    fZoCiTSlSs9w9S87nrFeaOkPdKB4wvFrbWfaMn23ZOs.png
    rcWY21QI-7ex4GKEZMhDprdPTIkEFjNXTGe9e9omKy4.md     a Markdown Resource's text
```

The bundled example is [`packages/app/fixture`](../packages/app/fixture).

## `aggregate.json`

```json
{ "version": 1, "metaSpaceId": "2b1c9a40-0f0e-4c55-9d3a-6f1d2e3a4b5c" }
```

It carries the one fact the directory cannot say for itself: **which Space is Meta**. Nothing infers that from ordering or naming ([ADR 0078](adr/0078-the-server-side-repository-owns-meta-lifecycle.md)), so a directory without `aggregate.json` is not an Aggregate directory. A single Space's directory on its own, with `space.json` and no `aggregate.json`, is refused. Both keys are required and no others are allowed.

There is no list of Spaces. A Space is in the aggregate because its directory is there.

## Space directories

Each Space is a child directory **named for the Space's Id, in lower case**, holding a `space.json`. The directory name is where the Space's Id is written. A name that is not a lower-case UUID is refused rather than read around, because a renamed directory would otherwise pass as a new Space on the next round trip. Where `space.json` also declares an `id`, the two must agree.

A child directory without a `space.json` is not a Space and is left alone.

### The rules that make Spaces an aggregate

- The Meta Space is the root. Every **ordinary** Space must be reached by some Space Resource in another Space; one that nothing reaches is refused: `Space <id> is not the Meta Space and no Space Resource points at it`. While any Resource's kind is one this version of InfinityCube has no plugin for, a Space nothing reaches is held instead ([ADR 0142](adr/0142-a-resource-plugin-owns-everything-inside-its-rect.md)): that Resource may be what reaches it, and nothing can read it to say. Deleting the last such Resource while a Space is held only this way is refused, naming the Space.
- A Space Resource's `map` and `graph` must name a Map of its target Space and a Graph that Map owns.
- Space Resources may converge on one Space but may not form a cycle, and a Space Resource may not target its own Space.
- Resource Ids are unique across the whole aggregate, not just within a Space.

## `space.json`

```json
{
  "version": 1,
  "id": "2b1c9a40-0f0e-4c55-9d3a-6f1d2e3a4b5c",
  "title": "Rust async",
  "maps": [
    {
      "id": "b0000000-0000-4000-8000-000000000001",
      "title": "Talk",
      "kind": "positioned",
      "positions": {
        "a0000000-0000-4000-8000-000000000001": {
          "x": 0,
          "y": 0,
          "size": { "width": 480, "height": 320 },
          "content": { "open": true }
        },
        "a0000000-0000-4000-8000-000000000002": { "x": 340, "y": 0 }
      },
      "graphs": [
        {
          "id": "b0000000-0000-4000-8000-000000000002",
          "title": "Main",
          "color": "#1f77b4",
          "headShape": "arrow",
          "edges": [
            {
              "from": "a0000000-0000-4000-8000-000000000001",
              "to": "a0000000-0000-4000-8000-000000000002",
              "title": "then"
            }
          ]
        }
      ],
      "activeGraph": "b0000000-0000-4000-8000-000000000002"
    }
  ],
  "defaultMap": "b0000000-0000-4000-8000-000000000001"
}
```

Every object here is **strict**: a key the format does not declare is refused rather than ignored, so a misspelt key fails loudly.

| Key | Meaning |
| --- | --- |
| `version` | Always `1`. Any other version is refused by name rather than migrated ([ADR 0040](adr/0040-layouts-own-card-membership-and-routes.md)). |
| `id` | The Space's Id. Optional here, because the directory name already carries it; if present it must match. |
| `title` | The Space's name. Non-empty. |
| `maps` | Optional. The Space's Maps, in order. A Space with none is given one the first time it is opened ([ADR 0079](adr/0079-v1-exposes-only-layouts-and-first-open-initializes-one.md)). Only the Meta Space can be written without Maps, because a Space Resource must name a Map of the ordinary Space it targets. |
| `maps[].id`, `.title` | The Map's Id and name. Map Ids are unique within the Space. |
| `maps[].kind` | `"positioned"`, the only kind. May be omitted. |
| `maps[].positions` | Resource Id → placement. **The keys are the Map's membership**: a Map may leave Resources out, and may not name one the Space does not hold. A placement is `{ "x", "y" }`, with an optional `size` and `content`, and no other key. `size` is `{ "width", "height" }`, no smaller than the Closed Size (260×146) on either axis; absent means the Closed Size, Open or Closed. `content` is the Resource's Map content (ADR 0142): any JSON value, which the Resource's plugin's schema accepts or refuses, and absent means that plugin's default; a Resource whose kind names no plugin in this build keeps whatever is stored, unread. An Ur Resource's is its Shape, `{ "shape": … }` with one of `rectangle`, `pill`, `ellipse` or `diamond`, absent meaning `rectangle`, and a Markdown, Space or Reference Resource's is `{ "open": true }` or `{ "open": false }`, absent meaning Closed, so one Map may draw it Open and another Closed. |
| `maps[].graphs` | The Graphs this Map owns, in order, **at least one**. A Graph Id is unique across the whole Space, not just the Map ([ADR 0108](adr/0108-graph-identity-is-unique-within-the-space.md)). `color` is a non-empty string used as the Graph's CSS colour, which is not checked as a colour, and `headShape` is one of `arrow`, `vee`, `dot`, `diamond`; both are optional. |
| `maps[].graphs[].edges` | Directed `{ "from", "to" }` Edges between Resources **this Map places**. Forks, merges, cycles and self-edges are allowed; an exact duplicate in one Graph is not. An Edge may carry a `title` that is one line with no leading or trailing whitespace, and `"titleHidden": true` beside it. The list may be empty. |
| `maps[].activeGraph` | Which Graph is active when the Map opens. Absent means the first. |
| `defaultMap` | The Map the Space opens on. If absent, opening the Space records its first Map here. |

There is no Space-level list of Resources or Graphs. Resources are the Resource files; Graphs belong to Maps.

## Resource files

A Resource is **one JSON Resource file**, `resources/<id>.json`, holding `{ id, title, kind, content }` ([ADR 0128](adr/0128-every-resource-kind-is-a-module-and-a-resource-file-is-json.md)). Resource files are found in `resources/` of a Space directory, **not recursively**. The format is published as JSON Schema in [`docs/schema/resource/`](schema/resource/README.md), with one example per kind.

```json
{
  "id": "a0000000-0000-4000-8000-000000000001",
  "title": "Why async?",
  "kind": "markdown",
  "content": { "url": "/assets/rcWY21QI-7ex4GKEZMhDprdPTIkEFjNXTGe9e9omKy4" }
}
```

A Markdown Resource's text is an **asset** ([ADR 0142](adr/0142-a-resource-plugin-owns-everything-inside-its-rect.md)), as a picture is: a plain Markdown file with no frontmatter and `\n` line endings, in [`assets/`](#assets) under the hash of its bytes, here `assets/rcWY21QI-7ex4GKEZMhDprdPTIkEFjNXTGe9e9omKy4.md`. Nothing is written beside the Resource file. A new Markdown Resource names the asset of zero bytes, `/assets/47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU`, which needs no file.

A Resource's identity is its `id`, never its file name. Exporting writes every Resource as `resources/<id>.json`, whatever it was called before.

Every Resource has `id`, `title`, `kind` and `content`, and none may be left out. The Title must have at least one non-blank line, and may run to several. `kind` is a kind id: a bare id, or `vnd.<owner>.<name>`, each part ASCII letters, digits and hyphens. A Resource file is strict, as `space.json` is: a key the envelope or a known kind's `content` does not declare, at any depth, is refused, naming the key and the file, so a misspelt key fails loudly. `content` depends on the kind:

| `kind` | `content` |
| --- | --- |
| `markdown` | `url`: `/assets/<hash>`, its text in `assets/`. No other URL, and no `path` or `mediaType`. |
| `ur` | `{}`. An Ur Resource is its Title alone. |
| `image` | `url`: `https:` or `http:`, or `/assets/<hash>` for a picture in `assets/`. Optional `naturalSize: { width, height }` in pixels. The Title is the image's text alternative. An Image Resource is never Open: a placement storing `"open": true` for one is refused. |
| `reference` | `target`: the Id of another Resource **in the same Space**, not itself and not another Reference Resource. It shows its Target's content, read-only. |
| `space` | `spaceId`, `map`, `graph`: the target Space and the Map and Graph it shows. Optional `framing: { centreX, centreY, zoom }`. |

A `kind` this version of InfinityCube has no plugin for is not refused ([ADR 0142](adr/0142-a-resource-plugin-owns-everything-inside-its-rect.md)): its `content` may be any JSON object, which is carried and never read, and the Resource is drawn as its Title and a note that its kind is not available. It can be placed, resized, connected, renamed, presented and deleted as any Resource, its Map entries' `content` is kept, and the assets its `content` names travel with it. It cannot become a Reference Resource's Target, since nothing can say whether its plugin allows that; a Reference that already names it is kept. Its `content`, and the `content` of its Map entries, are written with their keys sorted at every depth, integer-like keys first, and each number as JavaScript writes it: `1.0` comes back as `1`, and an integer beyond 2^53 loses precision. A version that has the plugin reads it as it stands. A misspelt kind is such a kind, so check the `kind` of a Resource drawn this way.

Only `resources/*.json` is read: a `.md` in `resources/` or beside `space.json` is not a Resource and is left alone.

## `assets/`

The bytes of every stored asset the aggregate's Resources reference ([ADR 0142](adr/0142-a-resource-plugin-owns-everything-inside-its-rect.md), [ADR 0118](adr/0118-an-aggregate-directory-carries-stored-image-bytes.md)). An asset is any file a Resource uses, of any media type: a Markdown Resource's text and an Image Resource's picture are the ones a Resource kind writes today.

- Each file is `assets/<hash>.<ext>`. The hash is the SHA-256 of the file's bytes as 43 characters of unpadded base64url, and it is also the last segment of the asset's URL, `/assets/<hash>`. The same bytes always have the same name, so they are stored once however many Resources reference them.
- The extension gives the asset's media type, through one table: `png`, `jpg` and `jpeg`, `webp`, `gif`, `avif`, `svg`, `md`, `txt`, `csv`, `html`, `css`, `js`, `json`, `pdf`, `mp4`, `webm`, `mp3` and `woff2`. Any other extension, or none, is `application/octet-stream`. Exporting keeps the name of a file already there, so the extension you chose is written back; a new file gets the table's extension for its media type, or `.bin` for one the table does not list.
- To add an asset by hand, compute its name and copy it in:

  ```sh
  hash=$(openssl dgst -sha256 -binary picture.png | base64 | tr '+/' '-_' | tr -d '=')
  cp picture.png "my-talk/assets/$hash.png"   # then use  url: /assets/<hash>  in the Resource
  ```

  A Markdown Resource's text is added the same way, as `assets/<hash>.md`; through `pnpm cube mcp`, its `write_asset` tool names the bytes and answers the URL.

- Importing reads every file directly in `assets/` named by a hash, alone or followed by a dot and any extension, and admits it whatever its type, up to 10 MiB. A file over that, one **not named for its own content**, or two files named by the same hash refuse the whole directory. A file whose name is not a hash is not read, and is left alone.
- An asset reference is a whole string value of exactly `/assets/<hash>`, anywhere in a Resource's `content` or a Map entry's `content`. A reference whose file is not in `assets/` is allowed: the reference stays, a picture draws as one that will not load, and a Markdown Resource draws a note in place of its text and offers no Edit. `pnpm cube check` accepts such a directory and names each such reference and the file it needs.
- The asset of zero bytes always exists, so no file is needed for it.
- An `https:` or `http:` URL stays a URL. InfinityCube does not download it, and nothing is written to `assets/` for it.
- Exporting owns the hash-named files in `assets/`: an asset no Resource references any more is removed, and an `assets/` left empty is removed. A file of a referenced asset whose bytes the store does not hold is kept. Other files, dotfiles, subdirectories and links inside `assets/` are left alone.

## Which Ids may be left out

A hand-written directory may omit these, and Importing mints them:

- a Space's `id` in `space.json` (the directory name supplies it);
- a Map's `id`, and a Graph's `id`;

A Resource's `id` is never left out and never minted: every Resource file carries its own, whether or not anything names it.

**A minted Id cannot be referred to**, because nothing in your files knows it. So write the Id of anything another file names: a Map named by `defaultMap` or a Space Resource's `map`, a Graph named by `activeGraph` or a Space Resource's `graph`. A reference to an Id nobody declares is refused.

The next Export writes every minted Id into the files.

## What Exporting replaces, and what it keeps

Exporting writes the directory **in place** ([ADR 0119](adr/0119-export-writes-in-place-and-git-answers-for-a-partial-write.md)). It owns exactly what Importing reads, and never reads, copies or touches anything else:

- **Owned:** `aggregate.json`; each Space directory's `space.json` and every `resources/*.json`; the hash-named files in `assets/`.
- **Kept:** any other file or directory, at the root or inside a Space directory, such as `.git`, a `README.md` at the root or in a Space directory, notes in a `notes/` directory or a `.gitignore`.

One write goes like this:

1. Every file the aggregate serialises to is computed in memory and checked the way Importing would read it. If it would not read back, nothing is written.
2. A file whose bytes are already on disk is left alone, so an unchanged file keeps its timestamp. Every other file is written to a dot-prefixed temporary file beside it and renamed over it, so no file is ever half-written.
3. Each owned file the aggregate no longer has is removed: a removed Resource's Resource file, an asset no Resource references, the files of a Space that is gone. A directory that removal leaves empty is removed too, so a gone Space's directory disappears unless it holds files of yours.

The directory itself, and each Space directory in it, is never renamed or recreated, so a shell or editor open inside one keeps working. A missing directory is created. Exporting refuses to write or remove anything through a symbolic link.

**There is no whole-write atomicity, backup or recovery copy.** A crash in the middle of a write can leave some files new and some old. Keep the directory under git: git restores it.

## How a directory is checked

Two layers:

- **Shape.** Zod schemas in `@project/core` check `aggregate.json`, each `space.json` and each Resource file. The same shapes are published as JSON Schema in [`docs/schema/`](schema/README.md).
- **References.** `@project/graph` checks that every Edge, placement, `activeGraph`, `defaultMap` and Reference Resource `target` resolves inside its Space, that there are no duplicate Ids or duplicate Edges, and then the aggregate rules above across Spaces.

`pnpm cube check`, `pnpm cube run` and `pnpm cube import` print what they refuse and exit non-zero; `check` Imports the directory as `run` does, so it refuses what `run` refuses, and writes nothing; it does not try the writes a run makes after an edit. A file that cannot be read is named by its path; a broken reference is named by its Space and the Ids involved. Reading comes before the reference checks, so fixing the first round of problems can reveal a second.

## Editing over MCP

`pnpm cube mcp <dir>` serves a local [MCP](https://modelcontextprotocol.io) server over standard input and output, for a client that calls MCP tools but has no shell or filesystem of its own. Its tools are `list_files`, `read_file`, `write_file` and `delete_file` over the files of `<dir>`; `write_asset`, which writes text or base64 bytes as `assets/<hash>.<extension>` (`md` unless another is named) and answers the `/assets/<hash>` a Resource names it by, so a client adds a Markdown Resource with tools alone — `md` text is written with `\n` line endings, as the Markdown plugin saves it, and bytes a file of another extension already holds are refused, naming that file; and `check`, which answers what `pnpm cube check` prints. A path is relative to `<dir>`; one that leaves it, names a dot-entry such as `.git`, or passes through a symbolic link is refused, and `list_files` follows no link either. A refused `check` and a refused path answer as tool errors. `read_file` and `write_file` carry a file as UTF-8 text unless `encoding` is `base64`, which carries a binary file such as a picture under `assets/` byte for byte; reading a file that is not UTF-8 as text is refused, naming `base64`. `write_file` replaces a file by renaming a written temporary file over it. A missing `<dir>` is refused, naming `pnpm cube init`; an empty one is served, so a client can write a new aggregate into it, and `check` there says to write `aggregate.json` and the Meta Space's directory rather than naming a command the client cannot run.

Standard output carries the protocol alone, so start it with pnpm's `--silent`, which drops the line pnpm prints before running a script, from the InfinityCube clone and with an absolute `<dir>`. A client whose configuration names a command but no working directory can start it through a shell:

```json
{
  "mcpServers": {
    "infinity-cube": {
      "command": "sh",
      "args": ["-c", "cd /path/to/infinity-cube && exec pnpm --silent cube mcp /path/to/talk"]
    }
  }
}
```

The server edits files, as an author does: a run serving the same directory writes over what it writes, so stop the run first, and a running talk sees the edits only when it is started again.

## Durable URLs and HTTP resources

Every addressable entity has a durable product URL built from its UUID. Product URLs encode UUIDs as unpadded 22-character base64url values; titles never take part in identity. A URL may name an entity canonically or add the Map and Graph context needed to reopen the same canvas, or the Active Resource while Presenting:

| Product URL | Destination |
| --- | --- |
| `/spaces/:spaceId` | Space |
| `/spaces/:spaceId/resources/:resourceId` | Resource, using the Space's current Map when it contains the Resource |
| `/spaces/:spaceId/graphs/:graphId` | Graph in its owning Map |
| `/spaces/:spaceId/maps/:mapId` | Authored Map |
| `/spaces/:spaceId/maps/:mapId/resources/:resourceId` | Resource in an explicit Map |
| `/spaces/:spaceId/maps/:mapId/graphs/:graphId` | Graph in an explicit Map |
| `/spaces/:spaceId/maps/:mapId/graphs/:graphId/present/:resourceId` | Presenting at its Active Resource |

These are navigation addresses, not persistence resources: resolving one never edits a Map, Active Graph or Resource. The browser and the Node host share one destination contract, so a malformed address receives `400`, an unresolved entity `404`, and a direct request returns the same application destination client-side navigation opens ([ADR 0069](adr/0069-entities-have-durable-web-addresses.md)).

The JSON API is smaller and keeps UUIDs in canonical spelling:

| HTTP resource | Purpose |
| --- | --- |
| `GET /api/spaces` | List the stored Spaces |
| `POST /api/spaces` | Commit a change set: each change names a Space, its complete next snapshot and the revision it was made against |
| `GET /api/spaces/:uuid` | Load one Space snapshot and its revision |
| `GET /api/aggregate` | Load the complete aggregate |
| `POST /assets` | Store an asset; the body is its bytes and `Content-Type` its media type |
| `GET /assets/:hash` | Read a stored asset |

Resources, Maps and Graphs are parts of a Space, so they have product URLs but no persistence endpoints of their own. API failures use RFC 9457 Problem Details (`application/problem+json`).
