# 08: An embedded Map draws its editor at its Edit size

**Status:** needs-triage

**Blocked by:** 05, including its [ADR 0182 in PR #547](https://github.com/tobyhede/infinity-cube/pull/547). On this branch [ADR 0178](../../../docs/adr/0178-opening-keeps-a-resources-size-and-an-in-place-editor-draws-at-an-edit-size-the-map-stores.md) still specifies the larger of the size hint and the normal size on each axis. The fallback below depends on the change in ticket 05.

**What to build:** Apply the same editor sizing, displacement and camera rules on a Map drawn inside a Space Resource as on the outer canvas (ADR 0112, ADR 0178 and ticket 05). Distinguish the parent Space Resource’s Claim to author its Map from the child plugin’s editor. The child’s Map entry owns its Edit size.

## Acceptance

- [ ] The embedded Map draws the child editor at its stored Edit size, then falls back to its plugin’s size hint, then to its normal size on the Map.
- [ ] Use the visible bounds and zoom for the embedded editor. Apply the cap and least pan there and leave the parent’s size on its Map intact.
- [ ] A browser test edits and cancels an embedded Markdown Resource with an oversized stored Edit size. It checks the child fits the visible window, its position returns to the authored framing, and neither Space gains a revision.

PR #547 tests the saved Edit size and both Spaces’ revisions in its [embedded Map browser test](https://github.com/tobyhede/infinity-cube/blob/56e2d387/packages/app/e2e/space-resource.spec.ts#L1085). Its [render adapter test](https://github.com/tobyhede/infinity-cube/blob/56e2d387/packages/app/test/render-adapter.test.ts#L766) checks the size hint fallback.
