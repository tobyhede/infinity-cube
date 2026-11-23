# 01 — Design the Start window

**Status:** ready-for-agent

**Blocked by:** nothing.

**What to build:** Designs, on a canvas the user reviews, for every screen and state of the Start window (ADR 0170, Storage ST-131), before any implementation. This is a prototype and design ticket: it produces pictures and a clickable prototype, not shipped code.

**Why:** the home window ADR 0167 removed was built without a design and was half-baked. The Start window is the first thing a person who downloads InfinityCube sees, so its layout is agreed before it is built.

**States to show**, each in light and dark, at the window size the shell opens:

- First launch: no recent Spaces, New Space the obvious action, Open Folder… beside it.
- With recent Spaces: the list (each entry the Space's Title and its folder), most recent first, and how one is opened.
- A recent Space that is gone, and one that did not open, each with its reason and Remove.
- The New Space form: Name ("Untitled Space"), Location (Documents) with Browse…, Create and Cancel; the folder it will write shown before Create.
- The New Space form refusing a folder that is not empty, the message beside the field.
- File › New Space… chosen while Spaces are open: the Start window over or beside them.

**Constraints:**

- Built only from `@project/ui` components and the shadcn registry (`shadcn-first-ui` skill); a deviation is named in the design.
- Uses the application's tokens and colour schemes, so it reads as the same product as a Space window.
- Native menus are not part of the design; they stay as ADRs 0167 and 0168 decide.

- [ ] A canvas design covering every state above, published for review.
- [ ] A clickable prototype of the first-launch → New Space → Space flow.
- [ ] The user has accepted the design; its decisions on layout and controls are added to UI as a rule (the UI trace's 0170 row says none exists until then).

## Comments
