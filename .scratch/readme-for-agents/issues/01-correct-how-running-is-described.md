# 01: Correct how the README and skills describe Running

**What to build:** A person or agent reading how Running works, in the README or in either `infinity-cube` plugin skill, is told what a run actually does today: a run locks its directory and a second run of the same directory is refused, naming it; a run with no Edit leaves the directory unchanged apart from the empty lock file; and opening a Space never writes the directory, its initialization reaching disk only with the next Edit. A `*.md` file beside `space.json` is described as left alone, as the README already says. The person is told to ignore the lock file in their content repository.

**Blocked by:** None (can start immediately).

**Status:** resolved

**Why:** The getting-started skill names the README's "How Running works" as the full description of Running, so the README's stale claims reach every agent that runs a talk. Found by the README audit (`../audit/staleness.md`). The binding sources are ADR 0162 and Storage ST-31, ST-64, ST-65, ST-66 and ST-124.

- [ ] The README's Running section states the lock, the refusal of a second run and the lock file's place in a `.gitignore`; "does not lock the directory" and "last write wins" between two runs are gone
- [ ] The README says a run with no Edit leaves the directory unchanged beside its empty lock file
- [ ] The README says opening a Space never writes the directory
- [ ] The getting-started skill no longer says a second run overwrites, and says a `*.md` beside `space.json` is left alone
- [ ] The authoring skill no longer says opening a Space records a `defaultMap` as an edit
- [ ] The version is bumped equally in all three plugin manifests, and the marketplace test holding them equal passes
- [ ] Each changed claim matches the Storage rule it restates, checked by reading the rule
