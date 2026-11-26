# 02: A Map entry stores an Edit size

**Status:** ready-for-agent

**Blocked by:** None (can start immediately).

**What to build:** the stored half of the Edit size ([ADR 0178](../../../docs/adr/0178-opening-keeps-a-resources-size-and-an-in-place-editor-draws-at-an-edit-size-the-map-stores.md), [spec](../spec.md)). A Map entry may carry an optional `editSize` (`{ width, height }`) beside `x`, `y` and `size`, on an entry of any kind. Both intakes accept it and refuse one below the Closed Size on either axis, as they do `size` (MG-22). Export writes it back in the entry's key order, and an Edit can write it without touching `size`, `x`, `y` or Map content, and without displacing anything. Nothing draws it yet.

## Acceptance

- [ ] The TypeScript Map entry schema (`packages/core/src/schema.ts`) and the Rust intake (`crates/intake/src/schema.rs`, the entry's key list and checks) accept an optional `editSize`, keep the entry strict otherwise, and refuse one below the Closed Size on either axis with the code `size` uses.
- [ ] Intake corpus cases under `conformance/intake/` cover an accepted `editSize` on at least two kinds, one below the Closed Size, and one of the wrong shape; both intakes pass them, and the Rust host's Export bytes for the accepted case match (`crates/host/tests/corpus.rs`).
- [ ] A Space Authoring operation writes one entry's `editSize` as one Edit, answering unchanged for the size it already stores and refusing a Resource not on the Map in the usual order (`resource-not-in-map` → `resource-not-found`); it moves no Resource.
- [ ] An entry with no `editSize` loads, round-trips and exports unchanged.
- [ ] If `plugins/infinity-cube/skills/infinity-cube-authoring/SKILL.md` lists what a placement may hold, it names `editSize`, with the version bump in all three plugin manifests.
