# 01: Rethink and design how a plugin's Open and Edit work

**Status:** needs-triage

**Blocked by:** None (can start immediately).

**What to build:** a design for how a Resource plugin shows its content and how an author authors it on the canvas: what Open and Edit are, whether both should exist, and how they relate to Resize. The outcome is a design the maintainer has agreed, recorded as an ADR, with follow-up tickets cut from it. This ticket does not decide the answer.

## Why

Open and Edit have built up through a series of ADRs, each one narrowing the last, and nobody has looked at them as a whole since. What a person sees on the canvas today is hard to explain.

What `main` (`265d5b1`) draws for a Markdown Resource, as captured in this ticket's thread:

- Selected while Closed, the rail offers Actions, Edit and Open.
- After Open, the Resource draws its rendered text and the rail offers Actions, Edit and Close.
- While editing, the rail offers Save, Cancel and a disabled Close.
- Edit on a Closed Resource Opens it and starts editing in one press.

## How it got here

- **ADR 0064** split Open from Edit. Open is authored Map state, so several Resources can be Open without each holding a live editor. Edit on a Closed Resource composes Open with beginning an edit. Close is disabled while editing.
- **ADR 0036**: no pointer gesture opens a Resource. Opening is a control, because the click is selection and the double click is rename.
- **ADR 0122**: a Resource's size is independent of Open. Resize is the only thing that changes a size, and Open only changes what is drawn inside the rect.
- **ADR 0137** (superseded): "Open and expand" made Open size the Resource again.
- **ADR 0142**: Open stops being the application's. Markdown, Space and Reference keep `{ open }` in their own Map content, and Image and Ur have none. A plugin may send a size hint with a Map content commit, and Markdown's Open uses it in place of 0137.
- **ADR 0149**: Open content that does not fit its rect is clipped on the canvas, and resizing is how an author shows more.

## Constraints

These hold today and a design has to keep them or replace them in a new ADR:

- **Open is per Map.** The same Resource can be Open on one Map and Closed on another. ADR 0142 rejected moving Open into Resource content for exactly this reason.
- **Size is per Map and independent of Open** (ADR 0122). The Closed Size is the one floor for every kind.
- **A plugin owns everything inside its rect** (ADR 0142). The host offers capabilities such as Map content commits, Claims and Embed, and the plugin decides what to draw and which rail commands to offer.
- **No click opens a Resource** (ADR 0036). The click selects, and the double click on the Title renames.
- **Open never reaches the Stage.** Presenting frames every Resource the same way whether it is Open or Closed (Navigation NV-62).
- **A plugin declares Map content for an embedding with no Map** (`withoutMap`). Markdown, Space and Reference all declare `{ open: true }` there.
- **An Edit is one commit and one revision.** Open and Close are Edits today, so they persist and survive reload and Export.

## Complications

- **"Edit" means different things in different plugins.** For Markdown it is a source editor with a draft and four exits (ADR 0064). For a Space Resource it is a Claim that lets the author pan and zoom the drawn Map, and it is offered only while the Resource is Open. A single design has to say whether these are the same concept.
- **Resize and Open overlap.** Both are per Map, and since ADR 0149 clipping means a Resource's size already decides how much content shows. The one thing Resize cannot do today is show only the Title.
- **Closed currently avoids work.** A Closed Markdown Resource does not read its text asset. A Closed Space Resource does not hold the Space it references or mount its Embed. Showing content all the time changes what every Map loads.
- **The Markdown size hint is tied to Open.** Markdown measures its text and asks to grow in the same commit that Opens it. If Open changes, that hint needs a new trigger or none.
- **Edit composes Open.** Edit on a Closed Resource Opens it first, and Close is disabled while editing so the content cannot collapse under a live draft. Changing Open changes both rules.
- **Open is an Edit with its own revision, and tests depend on that.** The e2e tests wait for the Open's revision before acting (PR 490), because a Markdown Open commits only after it has read and measured its text.
- **Vocabulary.** CONTEXT.md defines **Opening**, keeps **Entering** for crossing into a Space, and lists Expanded and Open Size as words to avoid. "Open Edit" is used in prose without a glossary entry.
- **Stored data and the plugin contract.** Three plugins store `{ open }` in Map content and declare it in `withoutMap`. A change rolls tracked files forward and touches the Resource API, the authoring skill and its plugin manifests.

## Acceptance

- [ ] The current behaviour of Open, Edit and Resize is described for each plugin that offers them (Markdown, Space, Reference), checked against the code.
- [ ] Each constraint above is either kept or replaced, with the reason.
- [ ] Each complication above has an answer in the design.
- [ ] The maintainer agrees the design.
- [ ] The agreed design is recorded as an ADR that names the ADRs it supersedes or refines.
- [ ] Follow-up implementation tickets are cut from the ADR.
