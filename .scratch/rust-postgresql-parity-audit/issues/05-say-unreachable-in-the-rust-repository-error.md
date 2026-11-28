# 05 — Say Unreachable in the Rust repository error

**Status:** needs-triage

**Blocked by:** nothing.

**Kind:** vocabulary. Not a correctness gap: the variant answers 503 as ADR 0177 decides.

## What is wrong

ADR 0177 says "The term is Unreachable" and `CONTEXT.md:464-466` defines **Unreachable** with "unavailable (a command state)" on its _Avoid_ list. The Rust host still names the failure `RepositoryError::Unavailable`, with the message "the store is unavailable: …" (`crates/host/src/repository.rs:224-226`), and `classify` in `crates/host/src/sql/postgres.rs:300` answers it. Every caller, test and log line therefore says the avoided word. The HTTP problem type `persistence-unavailable` is the wire contract and is out of scope.

## What to build

- [ ] Rename the variant `Unreachable` and its message, across `host`, `cli` and the desktop shell, leaving the HTTP problem type alone.
- [ ] If the rename is not wanted, say so in ADR 0177's successor and add the variant to the vocabulary test's exemptions with the reason.

**Named mutants:** none; a rename.

## Comments

**2026-11-28, re-read at `5a0956f8`.** Untouched.

`crates/host/src/repository.rs:225-226` still reads `#[error("the store is unavailable: {0}")] Unavailable(String)`.
