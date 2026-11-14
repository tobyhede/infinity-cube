# 10 — Store an SVG

Status: ready-for-agent

**What to build:** ADR 0107. The Image plugin admits an uploaded SVG as `image/svg+xml`, under the same 10 MiB cap and content-addressed id as the other formats, and draws it as it draws any picture.

- **Admission** (`packages/plugin-image/src/domain/admission.ts`): an SVG, by declared type or by its bytes, is admitted rather than refused. `image-svg-unsupported` is deleted with its copy, its Problem Details type and its tests.
- **Serving** (`packages/persistence/src/assets.ts`, `servedMediaType`): today only PNG, JPEG, WebP and GIF are handed to the page under their own type and everything else is `application/octet-stream`, so an SVG would not draw. On the host, `GET /assets/:hash` already sends `Content-Security-Policy: default-src 'none'; sandbox`, so `image/svg+xml` can be served as itself there.
- **A mounted talk** hands assets to the page as object URLs (`packages/app/src/mount/mount.ts`). An object URL has the page's origin and no response policy, so an SVG opened from one is a document on the application's origin with nothing sandboxing it. Settle this before an SVG object URL is served as `image/svg+xml`: for example, draw a mounted SVG from a `data:` URL or a sandboxed frame, or keep a mount's SVG inert and draw it some other way. Record the answer in ADR 0107's note.
- **Natural size**: what the browser measures, as for every format; an SVG with no measurable size records none (ADR 0107).

**Blocked by:** none.

**Acceptance:**

- An author uploads an SVG, it is stored, and the Image Resource draws it, on the host and in a mounted talk.
- Opening the stored SVG's URL directly runs none of its script: a test serves an SVG with a `<script>` and an `onload`, and asserts neither runs and no request leaves the page.
- `image-svg-unsupported` no longer exists anywhere in the source.
- The sandbox policy is checked by hand in Firefox and Safari, and the result recorded here (Chromium is covered by the test above).

Sanitising the bytes as a second layer stays parked in `09-sanitise-a-stored-svg.md`.
