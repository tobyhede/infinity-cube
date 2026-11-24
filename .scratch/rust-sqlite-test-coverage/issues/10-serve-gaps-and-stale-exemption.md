# 10: Close the `serve` gaps and the stale ports exemption

**Status:** ready-for-agent

**Blocked by:** None (can start immediately).

**What to build:** `infinity-cube serve --store sqlite` is held as a process for every rule its requirement states. The HTTP conformance ports test reflects what is actually ported: its exemption saying no command serves SQLite is no longer true, because `serve` now tests the misdirected-Host case.

- [ ] Process tests cover: an unwritable parent directory, an explicit `--port`, a second signal exiting at once, and `SQLITE_PATH` with surrounding whitespace (matching the TypeScript trimming rule, or recording why it differs).
- [ ] The ports test lists `serve`'s process tests as a SQLite adapter, each ported case carries its case marker, and the stale exemption is removed.
