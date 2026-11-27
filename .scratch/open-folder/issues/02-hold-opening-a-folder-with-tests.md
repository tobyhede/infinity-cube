# 02 — Hold the rules for a folder's open with tests at their interface

**Status:** resolved

**Blocked by:** 01.

**What to build:** a recording fake of 01's port, and tests that drive `open` and `create_space` through it with the real Registry and a temp folder, replacing `launch.rs`'s `after` and `closes_start` table tests rather than adding beside them.

- [x] A folder another request is still starting neither focuses a window nor closes the Start window.
- [x] A quit that begins during a start says nothing.
- [x] A declined empty-folder offer at launch with nothing open shows the Start window; from the menu it leaves the windows as they are.
- [x] An accepted offer from the Start window writes the Space, opens it and closes the Start window.
- [x] A New Space whose folder another request is still starting comes back `NotCreated::NotOpened`.
- [x] A folder whose last write is still running is refused with an error.
- [x] A start that fails after reserving rolls the Registry back and stops the server.
- [x] The Registry refusing `opened` (a quit overtook it) stops the server and says nothing.
- [x] Two spellings of one folder are one Aggregate.
- [x] A launch naming no folder shows the Start window.
- [x] The table tests of `after` and `closes_start` are gone, their cases (ST-131 among them) held by the tests above.

## Comments

- 2026-11-26: built in `open_folder/tests.rs`, 16 tests; the PR's review added four (a quit before a launch naming no folder, and New Space written and opened, refused for its name, and overtaken by a quit), 20 in all. Each of these changes to `open_folder.rs` fails at least one of them: closing the Start window for any open from it, not showing it for a launch naming no folder, not refusing a folder still writing, and not stopping a server whose window failed. The case 'the Registry refusing `opened` stops the server silently' is `given_a_quit::begun_while_a_folder_starts_its_server_is_stopped_and_nothing_is_said`, since a quit is the only way the Registry refuses it.
