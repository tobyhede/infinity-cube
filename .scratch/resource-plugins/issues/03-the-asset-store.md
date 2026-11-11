# 03 — The asset store

Status: ready-for-agent

**Blocked by:** 02 — The Resource API and its hosts.

**What to build:** the one host asset store behind the Resource API, replacing the image-specific path: `POST /images`, the `images` table and `storeImage`. An asset is bytes with a media type, named by the SHA-256 of those bytes as 43 characters of unpadded base64url. Its URL is `/assets/<hash>`, and in an Aggregate directory it is `assets/<hash>.<ext>`. **Every file a Resource uses goes here, whatever its kind and whether or not it is text.**

Any surface resolves and reads an asset; `store` and `pick` are offered where authoring is. The host finds references by walking `content` and Map content for whole string values that are an asset URL, read or not, with no declaration from a plugin. Export carries what is referenced and leaves out what is not, in place of `loadReferencedImages` naming the kind (ADR 0118); the store never deletes an asset (ADR 0106). Until `04`, Image keeps its old frame and `image-replacement.ts`, which call the asset store.

The rules:

- **Admission.** Any media type is admitted, because a kind only a missing plugin understands can bring one. `store` takes the type from the Blob and allows zero bytes. The 10 MiB cap stands. A file named by a valid hash but not for its bytes refuses the directory, as two files of one hash do. A file in `assets/` not named by a valid hash is not Import's, and is preserved as anything else in the directory is.
- **Naming.** Import owns every file in `assets/` named by a valid hash with any extension. One host table maps extensions and media types both ways, an unlisted extension is `application/octet-stream`. One asset exists per hash: a store that already holds the bytes keeps the media type it first stored them under, whatever extension a later Import reads, and storing them again answers the same URL. Export keeps the name of a file the directory already has for that hash, so the extension Import read is written back; a directory with none gets a name from the stored type through the table.
- **The asset of zero bytes** always exists, in every store and directory, with no file needed.
- **Absent bytes** are not an error, as ADR 0118 has it: Import accepts the URL, and Export keeps it, completes and removes no file of that name.
- **Serving.** Only the four picture types are served inline, and everything else is served as `application/octet-stream` with `nosniff`. Bytes are read through `assets.read`, which answers refused when they are absent, and does not fetch an object URL in a mount. The route takes only a valid hash, because `/assets/` is also where the built application's scripts are served.

**Roll forward:** the migrations in both SQL databases, `packages/http`, `vite-space-http-plugin.ts`'s `APPLICATION_COLLECTIONS`, `packages/aggregate/src/aggregate-file.ts` and `images.ts`, `packages/persistence/src/images.ts`, `src/aggregate-directory/images.ts`, `packages/app/src/mount/mount.ts` and its display resolver, `.scratch/mounting/issues/11`, `images/` to `assets/` and `/images/<id>` to `/assets/<hash>` in every tracked file, `docs/aggregate-directory.md`, `docs/agents/http.md`, `docs/agents/editing-and-persistence.md`, the State section of `AGENTS.md`, ADR 0118's rule that bytes travel only while referenced, and the `infinity-cube-authoring` and `infinity-cube-getting-started` skills with their version bump in all three plugin manifests.

**Acceptance:**

- A plugin other than Image, in a test, can store text and binary bytes and have them Exported while referenced and not after.
- An asset referenced only from unread `content` or Map content is carried.
- A referenced asset with absent bytes completes the Export and removes no file of that name.
- An asset's file name and media type survive an Import into a store that does not already hold its bytes and an Export back. Into a store that does, the store keeps its first type, and Export keeps an existing file's name or names a new one from that type. A media type stored from the browser survives an Export and an Import only when the host table lists it: an unlisted one is written as `.bin` and reads back as `application/octet-stream`.
- A built application still loads its own scripts from `/assets/`, and a mounted talk reads an asset.
- A stored asset is never served as active content from the application's origin.
- No server-side module names a kind for storage or Export.
- `CI passed` is green, including the PostgreSQL and SQLite jobs.

## Decisions

Made while delivering the host half (PR #461).

1. **Image's picture rule moves to the browser until issue 04.** Sniffing PNG, JPEG, WebP or GIF from the bytes and refusing SVG now runs in `packages/app/src/picture-admission.ts` (`admitImage`, `storePicture`) before the bytes are stored. The host admits any media type. Its `asset-too-large` refusal is shown to the author as `image-too-large`.
2. **A media type is stored as its lower-case essence.** Parameters are dropped, and a missing or invalid type is `application/octet-stream`. Bytes already stored keep the type they were first stored under.
3. **Export keeps an existing file's name for a hash**, so the extension Import read is written back. In a directory with no file for the hash, the name comes from the extension table, and an unlisted media type gets `.bin`.
4. **The zero-byte asset** is always held, as `application/octet-stream`: storing it answers `existing` and writes nothing. Export writes no file for it and keeps any file of its hash.
5. **Absent bytes.** Export keeps any file whose hash is referenced but whose bytes the store does not hold, and reads it back with the files it writes, so a misnamed or duplicated kept file refuses the Export before anything is written.
6. **What Import owns in `assets/`**: files named `<hash>` or `<hash>.<anything>`. Any other file is not read and is left alone. Two files of one hash refuse the directory.
7. **Served assets also carry `Content-Security-Policy: default-src 'none'; sandbox`**, beside `nosniff` and the octet-stream rule. That rule is `servedMediaType` in `@project/persistence`, which a mount's object URLs use too.
8. **The SQL migrations drop `images` and create `assets`** rather than renaming, because no state outlives a reset.
9. **The walk covers Resource `content` and Map content.** `referencedAssetHashes` (`src/aggregate-directory/assets.ts`) passes each Map entry's `content`, which issue 02 added, and each Resource's `content` to `assetReferences` (`packages/core/src/assets.ts`), a pure walk over any JSON value (`test/unit/referenced-asset-hashes.test.ts`). No plugin's Map content holds an asset reference yet, so the walk is tested directly rather than through an Export whose intake would refuse Map content no plugin declares.
10. **The "plugin other than Image" test uses Markdown Resources** whose `source` holds an asset URL, since no plugin API exists yet (`test/unit/export-aggregate.test.ts`).
11. **`readAsset` uses the upload timeout.**
12. **Problem codes** `invalid-asset-hash` (400) and `asset-too-large` (413) replace the image codes.
13. **`AssetRef` and `assetRefSchema` live in `@project/core`** for now. Issue 02 re-exports them from `@project/resource-api/domain`.
14. **The asset-reference walk is recorded as an anti-slop boundary** in `.oxlintrc.json`: it takes `unknown` and uses `typeof`, because it reads any JSON value whatever kind declared it, and `z.custom` calls `isAssetRef` with raw input.
15. **The held-replacement e2e specs stand in the host's 413 answer on release**, because the host no longer refuses a small file and the browser refuses a non-picture before sending.
16. **A plugin's surface reaches the asset store through `PluginAssetsProvider`** (`packages/ui/src/plugin-assets.ts`), supplied at startup from the same `AssetClient` the Image path uses (`browserPluginAssets` in `packages/app/src/space.ts`), with the browser's file picker as `pick`. `url` and `read` come from it on every surface. `store` and `pick` reach a plugin only through the canvas's `PluginHost`, beside its commits, so they are withdrawn as commits are: offered only where the surface offers commits and no exclusive work runs, a kept store answering refused and a kept pick answering no files while work runs or after the surface unmounts, and `Exclusive.store` live only while its own run is (`packages/app/test/plugin-host.test.ts`, `packages/ui/test/PluginResource.test.tsx`). The Stage and a read-only surface get `url` and `read` only.
17. **`@project/resource-api/domain` keeps its own `AssetRef` and `isAssetRef`** rather than re-exporting core's, because the package resolves no `@project/*` by design. Its pattern accepts any 43 base64url characters, a superset of core's canonical hash, so every reference the host writes passes it.
18. **A refusal a plugin reads from the asset store is worded by the host.** `browserPluginAssets` (`packages/app/src/space.ts`) answers `describeAssetRefusal`'s sentence for a store or read refusal (`packages/app/src/authoring-refusal.ts`), never the stable code, as every refusal a plugin reads is (ADR 0057); a code with no sentence gets the general one (`packages/app/test/plugin-assets.test.ts`).
19. **A media type survives a directory only through the host table.** Import types a file by its extension, so a type stored from the browser that the table does not list is written as `.bin` and reads back as `application/octet-stream`, and the acceptance criterion says so. An extension derived from the subtype would not round-trip either, because Import could not read the type back from it. The listed, unlisted and store-already-holds cases are `test/unit/aggregate-round-trip.test.ts`.
20. **`assets.read` answers bytes typed as they were stored.** `GET /assets/:hash` serves every non-picture as `application/octet-stream`, so the stored type travels beside it in `X-Asset-Media-Type` (`ASSET_MEDIA_TYPE_HEADER`, `@project/persistence`), and `HttpSpaceBackend.readAsset` types the Blob it answers by that header, normalised as an essence. A mount reads through the same backend over its in-page host, so its `read` answers the same (`packages/http/test/asset-http-client.test.ts`, `packages/http/test/asset-http-app.test.ts`).
