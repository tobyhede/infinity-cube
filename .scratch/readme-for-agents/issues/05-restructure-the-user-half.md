# 05: Restructure the user half of the README

**What to build:** A person running their own talk reads the intro, Quick start, Running and the skill install, and gets everything they need without reaching the developer section. Each Quick start step ends on a check they can see (the save indicator reads `Persisted`, `Esc` returns to the Map, the stop prints `Stopped; <dir> holds every edit.`, `git status` is clean). User-facing behaviour now filed under development moves here: product links and Copy link, Edges drawn as parallel lanes between a shared pair of Resources, a Resource's authored size, and Presentation Notes. One line each introduces `cube check` (how an agent checks files it wrote), `cube mcp`, Mermaid Resources, the desktop application and Mounting, each linking to where it is described.

**Blocked by:** 01 (Correct how the README and skills describe Running).

**Status:** resolved

**Why:** The audit found the top of the README dense in places, its best completion check buried at the end of a 139-word bullet, the presenting keys and other concepts split across sections, contributor-only material (the shadcn skills, the manifest version bump) in the install section, and bare requirement citations that say neither what the target holds nor when to read it. `../audit/structure.md` has replacement text for the intro, Quick start and Running, and a target outline.

- [x] Every Quick start step ends on an observable check
- [x] Each concept (presenting keys, undo, ports, the empty-directory rule) is stated once, in one place. Two near-repeats are distinct rules: Quick start's "empty apart from dot-entries" is `init`'s precondition and Running's "missing or empty is refused" is `run`'s; "Git is your undo" (Running) and "No Undo in the application" (Current limitations) say different things.
- [x] The file-format bullets are one line and a link to the Aggregate directory doc
- [x] The moved user-facing behaviour matches the Navigation, Rendering and Maps and Graphs requirements it restates
- [x] The new one-liners are present and their links resolve
- [x] Each requirement link in these sections says what the target holds, and none repeats within a paragraph
- [x] The install section's commands are unchanged, since the Workflow doc points at them
