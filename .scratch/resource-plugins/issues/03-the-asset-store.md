# 03 — The asset store

Status: ready-for-agent

**Blocked by:** 02 — The Resource API and its hosts.

**What to build:** the one host asset store behind the Resource API, replacing the image-specific path: `POST /images`, the `images` table and `storeImage`. An asset is bytes with a media type, named by the SHA-256 of those bytes as 43 characters of unpadded base64url. Its URL is `/assets/<hash>`, and in an Aggregate directory it is `assets/<hash>.<ext>`. **Every file a Resource uses goes here, whatever its kind and whether or not it is text.**

Any surface resolves and reads an asset; `store` and `pick` are offered where authoring is. The host finds references by walking `content` and Map content for whole string values that are an asset URL, read or not, with no declaration from a plugin. Export carries what is referenced and leaves out what is not, in place of `loadReferencedImages` naming the kind (ADR 0118); the store never deletes an asset (ADR 0106). Until `04`, Image keeps its old frame and `image-replacement.ts`, which call the asset store.

The rules:

- **Admission.** Any media type is admitted, because a kind only a missing plugin understands can bring one. `store` takes the type from the Blob and allows zero bytes. The 10 MiB cap stands. A file not named for its bytes refuses the directory, as two files of one hash do.
- **Naming.** Import owns every file in `assets/` named by a valid hash with any extension. One host table maps extensions and media types both ways, an unlisted extension is `application/octet-stream`, and Export writes back the extension it read. One asset exists per hash: the first stored type stands, and storing the same bytes again answers the same URL.
- **The asset of zero bytes** always exists, in every store and directory, with no file needed.
- **Absent bytes** are not an error, as ADR 0118 has it: Import accepts the URL, and Export keeps it, completes and removes no file of that name.
- **Serving.** Only the four picture types are served inline, and everything else is served as `application/octet-stream` with `nosniff`. Bytes are read through `assets.read`, which answers refused when they are absent, and does not fetch an object URL in a mount. The route takes only a valid hash, because `/assets/` is also where the built application's scripts are served.

**Roll forward:** the migrations in both SQL databases, `packages/http`, `vite-space-http-plugin.ts`'s `APPLICATION_COLLECTIONS`, `packages/aggregate/src/aggregate-file.ts` and `images.ts`, `packages/persistence/src/images.ts`, `src/aggregate-directory/images.ts`, `packages/app/src/mount/mount.ts` and its display resolver, `.scratch/mounting/issues/11`, `images/` to `assets/` and `/images/<id>` to `/assets/<hash>` in every tracked file, `docs/aggregate-directory.md`, `docs/agents/http.md`, `docs/agents/editing-and-persistence.md`, the State section of `AGENTS.md`, ADR 0118's rule that bytes travel only while referenced, and the `infinity-cube-authoring` and `infinity-cube-getting-started` skills with their version bump in all three plugin manifests.

**Acceptance:**

- A plugin other than Image, in a test, can store text and binary bytes and have them Exported while referenced and not after.
- An asset referenced only from unread `content` or Map content is carried.
- A referenced asset with absent bytes completes the Export and removes no file of that name.
- An asset's file name and media type survive Import and Export.
- A built application still loads its own scripts from `/assets/`, and a mounted talk reads an asset.
- A stored asset is never served as active content from the application's origin.
- No server-side module names a kind for storage or Export.
- `CI passed` is green, including the PostgreSQL and SQLite jobs.
