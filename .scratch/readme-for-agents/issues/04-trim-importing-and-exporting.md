# 04: Trim Importing and Exporting

**What to build:** An operator moving an aggregate in or out of a database reads the commands, how to move an aggregate between PostgreSQL and SQLite through an exported directory, and that a database a host has already started on holds an aggregate, so importing into it needs `--dangerous-replace`. How the two doors decide and authorize is left to the Storage requirements, with one link that says so.

**Blocked by:** None (can start immediately).

**Status:** resolved

**Why:** The section restates Storage's import rules ("two doors and no mode parameter", the Meta authorization, the race with a starting host) and repeats the Running section's in-place write and the SQLite path rule, citing Storage four times. Found by the README audit (`../audit/duplication.md` and `../audit/structure.md`).

- [x] The section keeps the three commands, the cross-database recipe and the started-host warning
- [x] The door, authorization and race detail is replaced by one link to Storage that says what it holds
- [x] Nothing repeats the Running section or the SQLite section
