# 05 — Port the broken-state and classification cases to Rust

**Status:** ready-for-agent

**Blocked by:** 03.

**What to build:** A Rust port of each contract case about broken stored state and store failures that 03 lists as pending, plus a Rust test for each classification, naming its glossary term (02).

- [ ] Each broken-state case 03 lists for this ticket has a port with `// Case: <name>`, and its pending exemption is deleted. Replacing an Aggregate over broken stored state, and a fast-path commit over a broken Space, are among them; Rust tests neither today.
- [ ] One Rust test per classification, asserting the answer and the HTTP status: busy and a closed repository are **unavailable** (503); a file missing `repository_state` and a constraint violation are **unclassified failures** (500); a file missing `resources` (01) and each broken state are **invariant failures** (500); code 14 is an **unclassified failure** (500, 01).
- [ ] `list_spaces` on SQLite still lists the other Spaces, and the broken one, when one Space's document fails intake, and loading that Space answers broken stored state (the spec's Settled questions).
