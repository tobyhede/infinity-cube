# 07: Edit no longer Opens a Closed Resource

**Status:** ready-for-agent

**Blocked by:** 04, 05

**What to build:** Edit on a Closed Markdown or Mermaid Resource begins editing without committing Open ([ADR 0178](../../../docs/adr/0178-opening-keeps-a-resources-size-and-an-in-place-editor-draws-at-an-edit-size-the-map-stores.md), replacing UI-54's Open-then-edit and UI-56's "every exit leaves the Resource Open"). The plugin reads its text for that edit only, draws its source editor using ticket 05’s sizing rules for either stored Open state, and when the edit ends by any of the four exits the Resource is drawn Closed again. If the text cannot be read, no edit begins and nothing is committed. The Open and Close control stays in place and unavailable while editing (UI-55). Editing is not stored: a reload ends it and the Resource comes back as stored (ADR 0042). Retire the prototype story, `packages/app/stories/review/temporary-edit-size.stories.tsx` and its `TemporaryEditSize.tsx` and CSS, with the `operations` prop it added to `packages/app/stories/support/ReactFlowCanvas.tsx` if nothing else uses it.

## Acceptance

- [ ] `packages/plugin-markdown` and `packages/plugin-mermaid` begin an edit from Closed with no Map content commit, and their "offers Edit when Closed, which Opens it and then begins editing" tests are replaced by tests of this rule, including Save, Mod-Enter, Cancel and Escape leaving it Closed.
- [ ] Unreadable text or a refused Claim ends the request. A later Edit can start. Mermaid can edit from Closed while diagram rendering is unavailable.
- [ ] The Open and Close control is drawn unavailable while editing, Open or Closed.
- [ ] An application Playwright test edits a Closed Resource, Saves, and finds it Closed at its canvas size with its content saved; a reload during an edit comes back Closed.
- [ ] The prototype story is gone, and `pnpm e2e:ladle` passes without it.
