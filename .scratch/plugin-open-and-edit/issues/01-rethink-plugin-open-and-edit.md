# 01: Rethink and design how a plugin's Open and Edit work

**Status:** needs-triage

**Blocked by:** None (can start immediately).

**What to build:** a design for how a Resource plugin shows its content and how an author authors it on the canvas: what Open and Edit are, whether both should exist, and how they relate to Resize. The outcome is a design the maintainer has agreed, recorded as an ADR, with follow-up tickets cut from it. This ticket does not decide the answer.

## Why

Open and Edit have built up through a series of ADRs, each one narrowing the last. What a person sees on the canvas today is hard to explain.

What `main` (`ee471b6`) draws for a Markdown Resource, checked against `packages/plugin-markdown/src/view.tsx` and UI-53–UI-55 (a Mermaid Resource offers the same, UI-53):

- Selected while Closed, the rail offers the Actions menu, Edit and Open.
- After Open, the Resource draws its rendered text and the rail offers Actions, Edit and Close.
- While editing, the rail offers Save, Cancel and a disabled Close.
- Edit on a Closed Resource Opens it and starts editing in one press.

## How it got here

- **ADR 0064** split Open from Edit. Open is authored Map state, so several Resources can be Open without each holding a live editor. Edit on a Closed Markdown Resource composes Open with beginning an edit, and Close is disabled while editing (UI-54, UI-55).
- **ADR 0036**: no pointer gesture opens a Resource. Opening is a control, because the click is selection and the double click on the Title is rename.
- **ADR 0122**: a Resource's size is independent of Open. Resize is the only thing that changes a size, and Open only changes what is drawn inside the rect.
- **ADR 0137** (superseded by 0142, its file since deleted; only 0142's row in `docs/adr/README.md` names it): "Open and expand" made Open size the Resource again.
- **ADR 0142**: Open stops being the application's. Markdown, Space and Reference keep `{ open }` in their own Map content, and Image and Ur have none. A plugin may send a size hint with a Map content commit, and Markdown's Open uses it in place of 0137 (MG-88).
- **ADR 0158**: the Mermaid plugin takes Markdown's shape. It keeps `{ open }`, Opens with a size hint, and edits through the host's source editor exactly as Markdown does (MG-27, UI-53).
- **ADR 0149**: Open content that does not fit its rect is clipped on the canvas, and resizing is how an author shows more.

## Constraints

These hold today and a design has to keep them or replace them in a new ADR:

- **Open is per Map.** The same Resource can be Open on one Map and Closed on another. ADR 0142 rejected moving Open into Resource content for exactly this reason.
- **Size is per Map, and Open does not change it except through a size hint** (ADR 0122, refined by ADR 0142). A Markdown or Mermaid Open on an entry storing no size carries a size hint, which the canvas applies as a Resize with displacement in the same Edit (MG-88). The Closed Size is the one floor for every kind.
- **A plugin owns everything inside its rect** (ADR 0142). The host offers capabilities such as Map content commits, Claims and Embed, and the plugin decides what to draw and which rail commands to offer.
- **No click opens a Resource** (ADR 0036). The click selects, and the double click on the Title renames.
- **Open never reaches the Stage.** Presenting frames every Resource the same way whether it is Open or Closed (Navigation NV-62).
- **A plugin declares Map content for an embedding with no Map** (`withoutMap`). Markdown, Mermaid, Space and Reference all declare `{ open: true }` there.
- **An Edit is one commit and one revision.** Open and Close are Edits today, so they persist and survive reload and Export.

## Complications

- **The rail's Edit command starts different Content actions in different plugins.** CONTEXT.md keeps **Edit** for a validated change to the Space and calls what a plugin lets an author do to its content a **Content action**. For Markdown and Mermaid the Edit command opens a source editor with a draft and four exits (ADR 0064). For a Space Resource it is a Claim that lets the author pan and zoom the drawn Map, and it is offered only while the Resource is Open. A single design has to say whether these are the same kind of Content action.
- **Resize and Open overlap.** Both are per Map, and since ADR 0149 clipping means a Resource's size already decides how much content shows. The one thing Resize cannot do today is show only the Title.
- **Closed currently avoids work.** A Closed Markdown or Mermaid Resource does not read its text asset. A Closed Space Resource does not hold the Space it references or mount its Embed. Showing content all the time changes what every Map loads.
- **The size hint is tied to Open.** Markdown and Mermaid measure their content and ask to grow in the same commit that Opens it, and they are the only plugins that send one. If Open changes, that hint needs a new trigger or none.
- **Edit composes Open, differently per plugin.** Markdown and Mermaid offer Edit while Closed, and it Opens the Resource first; Close is then disabled so the content cannot collapse under a live draft (UI-54, UI-55). Space offers Edit only while Open, so its Edit never composes Open, and its Close stays enabled and ends the Claim before Closing (`packages/plugin-space/src/view.tsx`, UI-61). Changing Open changes each of these.
- **Open is an Edit with its own revision, and tests depend on that.** The e2e tests wait for the Open's revision before acting (PR 490), because a Markdown Open commits only after it has read and measured its text.
- **Vocabulary.** CONTEXT.md defines **Opening**, keeps **Entering** for crossing into a Space, and lists Expanded and Open Size as words to avoid. "Open Edit" survives in ADRs 0084 and 0122 but is a retired name: ADR 0142 left "no Open Edit and no Open key" (archived guide `maps-and-graphs.md`, R39). A design should not bring it back.
- **Stored data and the plugin contract.** Four plugins store `{ open }` in Map content and declare it in `withoutMap`. A change rolls tracked files forward and touches the Resource API, the Rust intake's plugin mirror (`crates/intake/src/plugins/`), the authoring skill and its plugin manifests.

## Acceptance

- [ ] The current behaviour of Open, Edit and Resize is described for each plugin that offers them (Markdown, Mermaid, Space, Reference), checked against the code.
- [ ] Each constraint above is either kept or replaced, with the reason.
- [ ] Each complication above has an answer in the design.
- [ ] The maintainer agrees the design.
- [ ] The agreed design is recorded as an ADR that names the ADRs it supersedes or refines.
- [ ] Follow-up implementation tickets are cut from the ADR.

## Comments

- 2026-11-26: A proposed answer is [`../spec.md`](../spec.md), drawn from the Ladle prototype (Review → Markdown prototype → Temporary Edit Size). Its open questions go to the maintainer before the ADR is written.
