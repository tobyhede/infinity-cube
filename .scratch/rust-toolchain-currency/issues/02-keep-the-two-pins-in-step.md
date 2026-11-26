# 02: Keep the two Rust pins in step

**What to build:** `verify` fails when the toolchain file's channel and the workspace `rust-version` name different releases, with a message naming both values and the file each lives in. An offline pnpm script runs the same check by hand. The build-tooling doc records where Rust is pinned and how to bump it, and `AGENTS.md` points at it.

**Blocked by:** 01

**Status:** resolved

- [x] A pure agreement judgment over the two files' text, tested at that seam: equal releases pass, a channel ahead of or behind `rust-version` fails, a missing or malformed value fails naming its file.
- [x] One unit test runs the judgment over the repository's real files.
- [x] An offline pnpm script exits non-zero on disagreement.
- [x] The build-tooling doc gains the pin locations, the rule and the bump procedure; `AGENTS.md`'s Rust entry points at it.
