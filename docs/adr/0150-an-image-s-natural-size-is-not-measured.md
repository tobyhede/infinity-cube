# An image's natural size is not measured

Status: accepted
Date: 2026-11-12
Refines: 0106, 0126
Related: 0122, 0142

ADR 0106 measured an image when its URL was set and recorded its natural size on the Resource, so that a first Open could size the Resource to the picture. ADR 0122 retired first-Open sizes, so nothing reads the recorded size any more, and ADR 0126 bounded the measurement at ten seconds as part of the wait an image replacement imposes. The maintainer ruled on 12 November 2026 (ruling Space and Resources C1 in `docs/requirements/DECISIONS.md`) to stop measuring.

## The decision

- **Nothing measures a picture's natural size.** Creation and Replace write the URL alone, without loading the picture.
- **`naturalSize` stays optional in the file format and nothing reads it.** It is removed at the next deliberate format change, because the Image plugin's strict schema would otherwise refuse every saved image that carries it.
- An image replacement's wait is bounded by its upload alone; ADR 0126's measurement bound no longer applies.

## Why

- **A field with no reader costs work** on every creation and Replace, and holds up a pasted URL's creation until the picture loads.

## Consequences

- Code differs today: a stored file is sized from its header and a pasted URL by loading it, and creation and Replace write `naturalSize` (Space and Resources SR-26).
