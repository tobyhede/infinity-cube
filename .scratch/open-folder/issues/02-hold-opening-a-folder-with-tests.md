# 02 — Hold opening a folder with tests at its interface

**Status:** ready-for-agent

**Blocked by:** 01.

**What to build:** a recording fake of 01's port, and tests that drive `open` and `create_space` through it with the real Registry and a temp folder, replacing `launch.rs`'s `after` and `closes_start` table tests rather than adding beside them.

- [ ] A folder another request is still starting neither focuses a window nor closes the Start window.
- [ ] A quit that begins during a start says nothing.
- [ ] A declined empty-folder offer at launch with nothing open shows the Start window; from the menu it leaves the windows as they are.
- [ ] An accepted offer from the Start window writes the Space, opens it and closes the Start window.
- [ ] A New Space whose folder another request is still starting comes back `NotCreated::NotOpened`.
- [ ] A folder whose last write is still running is refused with an error.
- [ ] A start that fails after reserving rolls the Registry back and stops the server.
- [ ] The Registry refusing `opened` (a quit overtook it) stops the server and says nothing.
- [ ] Two spellings of one folder are one Aggregate.
- [ ] A launch naming no folder shows the Start window.
- [ ] The table tests of `after` and `closes_start` are gone, their cases (ST-131 among them) held by the tests above.

## Comments
