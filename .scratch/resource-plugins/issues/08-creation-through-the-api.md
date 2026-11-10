# 08 — Creation through the API

Status: ready-for-agent

**Blocked by:** 07 — The Space plugin.

**What to build:** `creates` on each plugin view and `host.create`, as [`spec.md`](../spec.md) sets out, replacing `KindCreation`, `kind-creation.ts` and each `app/kinds/` creation. The host owns placement from the gesture, Title continuation, single-flight, the availability re-check after a wait (today's `later()`), and a new Space's lifetime and two snapshots (ADR 0074, ADR 0089). Data matching is exact over wildcard, then build order.

**Paths:** Dock press for Markdown and Ur; create-and-connect, drawing an Edge to a new Resource; Image through the picker; Image from dropped files or a pasted URL; Space with a new Space; Space from an existing Space in the Resources list, pressed or dragged; Reference from its Target's menu.

**Acceptance:**

- Each path behaves as it does today, in one atomic Edit per press or drop.
- A cancelled picker creates nothing, and a Create withheld during the wait creates nothing.
- A plugin reaches a new Space only by asking for one.
- `app/kinds/` holds no creation.
- `CI passed` is green, including the PostgreSQL and SQLite jobs.

## Decisions

- **`New<C>` names a Space-dependent content `contentFor`, not a function-typed `content`.** The spec's `content: C | ((s: NewSpace) => C)` cannot be told apart from a `C` that is itself a function without an assertion; a separate field is told apart with `in`.
- **`CreationHost` gained `report(words)`.** A plugin's own refusal (picture admission, a refused store) has no surface to show it on, and the spec says the host reports it; `report` is how the plugin hands the host its words.
- **A `'data'` creation declares media `types` and may add `accepts`.** Matching is exact (2) over `type/*` or `*/*` (1), then build order (`packages/app/src/plugin-host/creation.ts`, `dataCreation`); a pasted URL matches as `text/uri-list`. The Image plugin declares `*/*` as well as its formats, so a dropped file no plugin names is still refused by name, as today.
- **A list of Spaces offers `from: 'spaces'`.** Not `'space'`, which reads as the kind to `kind-ids-in-modules.test.ts` and to a reader; a `contentFor` item without `newSpace` in that creation links the offered Space.
- **The lifecycle takes the plugin's document.** `CreateSpaceResourceInput.document(shown)` builds the Space Resource's document from the Space made or linked, and the lifecycle throws unless it names exactly that Space, holding its lifetime. With no `document`, it writes the Space kind's own, so `space-resource-planning.ts` stays in `KIND_FEATURE_FILES` and `ONE_KIND_FEATURES`.
- **create-and-connect stays the host's `create-and-connect` Edit.** Its Resource is the default kind's and its Edge must land in the same atomic Edit, which a plugin `run` asking `create` cannot carry.
- **Single flight applies to a Dock press, per kind, from `create` until it settles.** A picker may never answer, so the window is not the whole `run`. Today only Create Space Resource was withheld in flight, a Markdown Resource could land while its coordination was open, and a Space from the Resources list linked behind it: so another kind's Create, and every gesture not from the Dock, still runs. The flights live in `useResourcePlacement` (`createCreationFlights`) and outlast the host each Map builds, so moving to another Map keeps a creation's flight. The Dock draws a Create withheld while its own kind is in flight.
- **The host does not report its own "unavailable" and "creating" refusals.** A creation no longer available has no one to tell, and a second press is ignored; exclusive work and a `create` the gesture may not make are reported.
- **One `resource-create` notice channel**, titled `${plugin name} not created`, replaces `space-resource-create`, `reference-create` and `image-create`. "Space not created" is now "Space Resource not created" and "Image not created" is "Image Resource not created". A surface that keeps its sentence (the Resources list) gets it through `settle` instead.
- **A Space from the Resources list continues nowhere** (`CreationGesture.continues: false`): the list keeps the reader, as it does after adding a Resource, so the caret stays in it.
- **A Dock press places on the Map drawn when its Resources are asked for** (`CreationPlace.mapId`), at that Map's visible centre, as today's `later()` did: a picture picked after moving to another Map lands there and continues there. A drop or a menu command keeps the Map it was made on.
- **A `run` that throws or rejects is told** on `resource-create` in the failure's words, as `brokeOn` told the old channels, and still reaches the operational reporter.
- **Content a plugin's schema refuses is reported** through the host, as every refused `create` is.
- **The Title continuation goes to the surface's own continuation**, not through command outcomes, which continue on the application's canvas: a Map drawn inside a Space Resource continues in its own drawing.
- **The rail's Create rows come from the plugins creating from a Resource**, labelled `Create ${name}` less `Resource` ("Create Reference"), with each plugin's glyph and id `create-${kind}`.
- **Picture measurement moved into the Image plugin** (`measurePicture`, `MEASURE_TIMEOUT_MS`), and `ImageSources` left the composition.
- **Space Authoring has one creation completion, `created-resources`**, placing several Resources in a row stepped by a collapsed width plus 40. Content its kind's schema refuses is `resource-content-invalid`, which replaces `image-url-unsupported`; content naming a Space is the new `space-reference-creation-unsupported`, since only the lifecycle may create one.
- **The Dock keeps registry order** (`KIND_IDS`) for its Creates; data matching uses build order (`PLUGIN_KINDS`).
