# 01 — Design the Start window

**Status:** ready-for-agent

**Blocked by:** nothing.

**What to build:** Designs for every screen and state of the Start window (ADR 0170, Storage ST-131), reviewed before any implementation. This is a prototype and design ticket: it produces review stories and a clickable prototype, not shipped code.

**Where the designs live:** Ladle review stories in `packages/app/stories/review/start-window.stories.tsx`, one story per state, drawn with the real `@project/ui` components and the application's tokens, so what is approved is what 02 builds. `stories/review` is staged work, not catalogue evidence (`shadcn-first-ui`, step 1); the catalogue check excludes it (`packages/app/stories/design-system-inventory.ts`), so these stories carry no parity claims or tagged tests. Their screenshots, light and dark, are published side by side on a canvas for review without running `pnpm ladle`.

**Skills, in order:**

1. `mattpocock-skills:prototype` runs the ticket: a throwaway prototype answering a design question.
2. `shadcn-first-ui`, step 1 only: read the catalogue and name the closest `@project/ui` parts. Its remaining steps are 02's, which rebuilds the chosen design through them.
3. `shadcn` to search the registry for what the catalogue lacks (a recent-items list, an empty state).
4. `design:ux-copy` for the labels, the empty state and the refusal messages.
5. `design:design-critique` and `design:accessibility-review` as a pass before review.

**Why:** the home window ADR 0167 removed was built without a design and was half-baked. The Start window is the first thing a person who downloads InfinityCube sees, so its layout is agreed before it is built.

**States to show**, each in light and dark, at the window size the shell opens:

- First launch: no recent Spaces, New Space the obvious action, Open Folder… beside it.
- With recent Spaces: the history (each entry the Space's Title and its folder), most recent first, ten at most, and how one is opened; an entry already open in a window shown as open.
- A recent Space that is gone, and one that did not open, each with its reason and Remove.
- The New Space form: Name ("Untitled Space", or "Untitled Space 2" when that is taken), Location (Documents) with Browse…, Create and Cancel; the folder it will write shown before Create.
- The New Space form refusing a name that is not one folder name (for example `a/b`), and a folder that is not empty, each message beside its field.
- File › New Space… chosen while Spaces are open: the Start window over or beside them.

**Constraints:**

- Built only from `@project/ui` components and the shadcn registry (`shadcn-first-ui` skill); a deviation is named in the design.
- Uses the application's tokens and colour schemes, so it reads as the same product as a Space window.
- Native menus are not part of the design; they stay as ADRs 0167 and 0168 decide.

- [ ] A review story for every state above, in `packages/app/stories/review/`, and their light and dark screenshots published on a canvas for review.
- [ ] A clickable prototype of the first-launch → New Space → Space flow, as an interactive review story.
- [ ] The user has accepted the design; its decisions on layout and controls are added to UI as a rule (the UI trace's 0170 row says none exists until then).

## Comments
