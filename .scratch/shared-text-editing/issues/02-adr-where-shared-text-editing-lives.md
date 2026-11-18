# 02: ADR — where shared text-asset editing lives

**What to build:** an accepted ADR deciding where the text reading and the Claim, draft and Save edit that the Markdown and Mermaid plugins share should live, so that the code exists once. It refines ADR 0142 (a plugin owns its rect and reaches only the Resource API) and ADR 0158 (the Resource API gained no renderer for one caller). With two callers the question is now real. The options to weigh:

- a hook or component in the Resource API's view half, which every plugin may use;
- a component the host provides through `ResourceHost`, as it provides the Markdown renderer and the source editor today;
- a small shared package that text plugins import, which ADR 0142's one-door rule currently forbids.

The ADR also decides whether Opening with a size hint (the measurer and the load wait) and the Edit, Done, Open and Close rail commands are in scope, which decides whether ticket 05 happens.

**Blocked by:** None (can start immediately).

**Status:** ready-for-human

- [ ] The ADR is written and accepted, naming the chosen home and why the others were rejected.
- [ ] It states whether Open sizing and the rail commands are shared, and ticket 05 is closed as `wontfix` if they are not.
- [ ] The Space and Resources and Rendering requirements docs, and their markers, are updated in the same change.
- [ ] CONTEXT.md gains any new name the ADR introduces.
