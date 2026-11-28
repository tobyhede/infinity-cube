# 08: An embedded Map draws its editor at its Edit size

**Status:** needs-triage

**Blocked by:** 05

**What to build:** Apply the same editor sizing, displacement and camera rules on a Map drawn inside a Space Resource as on the outer canvas (ADR 0112, ADR 0178 and ticket 05). Distinguish the parent Space Resource’s Claim to author its Map from the child plugin’s editor. The child’s Map entry owns its Edit size.

## Acceptance

- [ ] The embedded Map draws the child editor at its stored Edit size, then falls back to its plugin’s suggestion, then to its Display size.
- [ ] Use the visible bounds and zoom for the embedded editor. Apply the cap and least pan there and leave the parent’s Display size intact.
- [ ] A browser test edits and cancels an embedded Markdown Resource with an oversized stored Edit size. It checks the child fits the visible window, its position returns to the authored framing, and neither Space gains a revision.

The local application test in `packages/app/e2e/space-resource.spec.ts`, “an embedded editor fits its window and restores the authored framing”, exercises the saved Edit size and both Spaces’ revisions. The fallback order is covered in `packages/app/test/render-adapter.test.ts`, “uses the suggested width and height when no Edit size is stored”.
