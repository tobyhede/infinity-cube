# 02 — Record the decisions in the glossary and the Storage requirements

**Status:** ready-for-agent

**Blocked by:** None (01 and `rust-host/issues/15` are resolved).

**ADR:** one new ADR, as `docs/agents/workflow.md` requires for a decision, records the accepted Rust/TypeScript divergences the spec's Decisions list: change order, reserved-lock timing, `load_space` over a broken Space, and `list_spaces` listing a broken Space. As ADR 0175 requires, the ADR edits no requirements doc: `python3 scripts/adr_snapshot.py check` lists it as pending until the next refresh folds it in.

**What to build:** The spec's decisions that are not code, written where the next reader looks. ST-126's clauses (code 14 split by cause, a path that is not a regular file, a path that is not UTF-8, a replaced or deleted file) and ST-7's listing of a broken Space, with TypeScript's listing failing for every Space, landed with 01's behaviour in `39f0948`.

- [ ] `CONTEXT.md` defines **Invariant failure**, **Unavailable** and **Unclassified failure** as the spec's Decisions word them, with no implementation names. `CONTEXT.md` already uses "unavailable" for commands; the new entry is reconciled with that use rather than defined twice.
- [ ] `docs/requirements/storage.md` states that a commit's answer does not depend on the order of its changes, and names the TypeScript SQL writer's refusal of a move listing the receiving Space first as the known exception (contract case "writes a moved Resource through the ownership check, which refuses it before its Space releases it").
- [ ] ST-7 names the broken stored states the TypeScript repository answers as unclassified failures (500 either way), among them `loadSpace` over a stored document failing intake, and says Rust answers each as an invariant failure.
- [ ] ST-127 notes that against another process's reserved lock a Rust write waits out the busy timeout before answering 503, where TypeScript fails at once; that writes from both runtimes wait against shared and exclusive locks; and that reads wait only against an exclusive lock.
- [ ] ST-126 states the limit of the replaced-file check: it runs before each operation's transaction, so a file replaced between the check and the transaction is still read or written once; the next operation answers unavailable.
- [ ] The ADR above is accepted, indexed in `docs/adr/README.md`, and links both ways with the ADRs it refines.
