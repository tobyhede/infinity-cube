# 02 — Record the decisions in the glossary and the Storage requirements

**Status:** ready-for-agent

**Blocked by:** `rust-host/issues/15` (PRs #520, #521) merging to `main`, with 01.

**What to build:** The spec's decisions that are not code, written where the next reader looks. ST-126's clauses (code 14 split by cause, a path that is not a regular file, a path that is not UTF-8) and ST-7's listing of a broken Space are 01's, since they change with that behaviour.

- [ ] `CONTEXT.md` defines **Invariant failure**, **Unavailable** and **Unclassified failure** as the spec's Decisions word them, with no implementation names.
- [ ] `docs/requirements/storage.md` states that a commit's answer does not depend on the order of its changes, and names the TypeScript SQL writer's refusal of a move listing the receiving Space first as the known exception (contract case "writes a moved Resource through the ownership check, which refuses it before its Space releases it").
- [ ] ST-7 names the broken stored states the TypeScript repository answers as unclassified failures (500 either way), among them `loadSpace` over a stored document failing intake, and says Rust answers each as an invariant failure.
- [ ] ST-127 notes that against another process's reserved lock Rust waits out the busy timeout before answering 503, where TypeScript fails at once, and that both wait against shared and exclusive locks.
- [ ] The requirements snapshot marker is updated as `docs/agents/workflow.md` requires.
