# 10: One edit-from-Closed hook for the text plugins

**Status:** needs-triage

**Blocked by:** 07

**What to build:** The Markdown and Mermaid views carry the same code to begin an edit from Closed: `startEdit`, the `beginning` ref, the measuring wait, the hidden measurer and the pending-edit state (`'idle' | 'reading' | 'editing'`). ADR 0158 accepts the two views mirroring each other, but every fix has to be made twice. Decide whether `resource-api/view` should offer this as one hook. Exporting it changes the plugin contract, so that decision may need an ADR ([ADR 0178](../../../docs/adr/0178-opening-keeps-a-resources-size-and-an-in-place-editor-draws-at-an-edit-size-the-map-stores.md)).

Raised in review on PRs #547 and #551.

## Acceptance

- [ ] A decision is recorded: a shared hook in `resource-api/view`, or the mirroring kept with the reason.
- [ ] If a hook is added, both plugins use it, and their existing tests pass unchanged.
