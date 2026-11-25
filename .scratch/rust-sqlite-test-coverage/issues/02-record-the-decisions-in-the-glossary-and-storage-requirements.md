# 02 — Record the decisions in the glossary and the Storage requirements

**Status:** ready-for-agent

**Blocked by:** `rust-host/issues/15` (PRs #520, #521) merging to `main`, with 01.

**What to build:** The spec's decisions that are not code, written where the next reader looks. ST-126's clause for a path that is not a regular file is 01's, since it changes with that behaviour.

- [ ] `CONTEXT.md` defines **Invariant failure**, **Unavailable** and **Unclassified failure** as the spec's Decisions word them, with no implementation names.
- [ ] `docs/requirements/storage.md` states that a commit's answer does not depend on the order of its changes, and names the TypeScript SQL writer's refusal of a move listing the receiving Space first as the known exception (contract case "writes a moved Resource through the ownership check, which refuses it before its Space releases it").
- [ ] ST-7 notes that the TypeScript repository answers some of its broken stored states as unclassified failures (500 either way), and that Rust answers each as an invariant failure.
- [ ] ST-127 notes that against another process's lock Rust waits out the busy timeout before answering 503, where TypeScript fails at once.
- [ ] The requirements snapshot marker is updated as `docs/agents/workflow.md` requires.
