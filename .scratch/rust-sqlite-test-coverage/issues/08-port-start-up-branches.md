# 08: Port the start-up branches to Rust

**Status:** ready-for-agent

**Blocked by:** None (can start immediately).

**What to build:** Rust start-up of a store-backed host (ST-10) is held for every branch the TypeScript start-up tests hold: a long outage (40 failures in a row) still establishing the Meta Space, an unclassified failure, invalid Default Content, a one-off invariant failure, and the back-off schedule. Where the Rust code has no such branch, the ticket records whether that is a defect or by design.

- [ ] Each TypeScript start-up case has a Rust counterpart driven by a scripted store under paused time, or a recorded reason it does not apply.
- [ ] `serve` reports a stopped start-up on standard error, held by a process test.
