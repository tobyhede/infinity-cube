# 03: Markdown edits through the shared text editing

**What to build:** the shared text reading and Claim, draft and Save edit lands where ticket 02's ADR puts it, and the Markdown plugin uses it in place of its own. A person reading or editing a Markdown Resource sees no change: the same notices, the same Edit and Save, the same refusal and retry.

**Blocked by:** 01 (One edit suite for both text plugins), 02 (ADR — where shared text-asset editing lives).

**Status:** ready-for-agent

- [ ] The shared code exists once, in the home the ADR names, with its own tests at that seam.
- [ ] The Markdown plugin reads and edits its text through it, and keeps only what is Markdown's own (rendering through the host, its notices).
- [ ] The suite from 01 passes for both plugins unchanged.
- [ ] The Markdown e2e and Ladle specs pass in CI.
- [ ] The package import rules (lint zones and narrowed tsconfig paths) admit the new dependency and nothing more.
