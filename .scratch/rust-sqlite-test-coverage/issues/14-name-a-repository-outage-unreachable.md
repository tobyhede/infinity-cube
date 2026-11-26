# 14 — Name a Repository outage Unreachable in the Rust SQLite code

**Status:** ready-for-agent

**Blocked by:** none (follows PR #540).

**Why:** `CONTEXT.md` names a Repository that cannot answer for now **Unreachable**, and lists "unavailable" as a word to avoid, because it means a command state. PR #540 added Rust helpers, test names and comments that call a Repository outage "unavailable". CodeRabbit's Domain Vocabulary check flagged this on #540, and the person chose to do it as a follow-up rather than in that PR.

**What to build:** Rename the outage words in the code and prose PR #540 added. Keep every contract name.

- [ ] `crates/host/src/sql/sqlite.rs`: rename `unavailable_code` to `unreachable_code`, its two unit tests (`reads_busy_and_locked_as_unavailable_by_their_primary_code`, `reads_a_file_it_cannot_open_as_unavailable_only_while_it_does_not_exist`), the local `unavailable` in the error mapping, and the doc comments that say an operation "fails as unavailable".
- [ ] `crates/host/tests/startup.rs`: rename the `unavailable()` helper, its call sites, and the comment that lists "broken, unavailable, broken".
- [ ] Other new Rust test files from #540: rename any helper, test name or comment that calls a Repository outage "unavailable".
- [ ] `.scratch/rust-sqlite-test-coverage/issues/05`, `09` and `10`: use "Unreachable" for the Repository state.

**Keep as they are:**

- The wire string `persistence-unavailable` and HTTP 503.
- The `RepositoryError::Unavailable` variant. It was there before #540 and other code matches on it. Renaming it would be a separate change.
- `// Case:` lines such as `names every operation on a closed database unavailable` in `crates/host/tests/sqlite_classification.rs`. They must match the TypeScript test names exactly, and `test/unit/repository-contract-rust-ports.test.ts` fails if one does not. If one of these is renamed, rename the TypeScript test in the same commit.

**Done when:** `grep -rni unavailable crates/host` finds only the variant, the wire string, and `// Case:` lines that match a TypeScript test name. Clippy, the host tests and the ports test still pass.
