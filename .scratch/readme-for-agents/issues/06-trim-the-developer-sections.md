# 06: Trim the developer sections

**What to build:** A contributor reads Development servers, Verify, Local PostgreSQL and Current limitations as a short human summary that points at AGENTS.md for the rest, with no repeats of the user half and nothing that goes stale on its own.

**Blocked by:** 03 (Cut Architecture and Tests down to a link to AGENTS.md), 05 (Restructure the user half of the README).

**Status:** resolved

**Why:** The audit found the Node, pnpm and install requirements repeated, a `pnpm verify` comment listing only some of its steps (AGENTS.md says the list lives in `package.json` alone), Playwright project detail, deployment advice inside "Local PostgreSQL", a "no undo" limitation repeating Running, a constant's name and path, Presentation Notes listed as a limitation, and a bundle measurement with history attached. `../audit/duplication.md` and `../audit/structure.md`.

- [x] Requirements and install appear once in the README
- [x] The `pnpm verify` line describes it without listing its steps, or links to where they are listed
- [x] Current limitations holds only limitations, with no measurement, history, constant name or repeat of Running
- [x] The kept gotchas stay: `playwright install chromium` once, and `docker compose down --volumes` destroys local data
