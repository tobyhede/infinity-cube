# 03 — The asset store

Status: ready-for-agent

**Blocked by:** 02 — The Resource API and its hosts.

**What to build:** the generic host asset store behind the Resource API, replacing the image-specific path: `POST /images`, the `images` table and `storeImage`. Any surface resolves an asset's URL; `store` and `pick` are offered where authoring is. A plugin's domain half declares `assetReferences(content, mapContent)`, and Export carries what is referenced into the Aggregate directory, in place of `loadReferencedImages` naming the kind (ADR 0118). Image still uses it through today's path until `04`.

**Roll forward:** the migrations in both SQL databases, `packages/http`, `docs/aggregate-directory.md`, ADR 0118's rule that bytes travel only while referenced.

**Acceptance:**

- A plugin other than Image, in a test, can store bytes and have them Exported while referenced and not after.
- No server-side module names the Image kind for storage or Export.
- `CI passed` is green, including the PostgreSQL and SQLite jobs.
