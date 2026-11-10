# 02 — The asset store

Status: ready-for-agent

**Blocked by:** 01 — The Resource API and its hosts.

**What to build:** the generic host asset store behind the Resource API, replacing the image-specific path: `POST /images`, the `images` table and `storeImage`. A plugin stores bytes and receives what its content refers to them by. A plugin's domain half declares `assetReferences(content)`, and Export carries what is referenced into the Aggregate directory, in place of `loadReferencedImages` naming the kind (ADR 0118). Image still uses it through today's path until `03`.

**Roll forward:** the migrations in both SQL databases, `packages/http`, `docs/aggregate-directory.md`, ADR 0118's rule that bytes travel only while referenced.

**Acceptance:**

- A plugin other than Image, in a test, can store bytes and have them Exported while referenced and not after.
- No server-side module names the Image kind for storage or Export.
- `CI passed` is green, including the PostgreSQL and SQLite jobs.
