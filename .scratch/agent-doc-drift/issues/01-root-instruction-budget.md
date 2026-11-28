# 01 — Keep root instructions within budget

**What to build:** CI checks the instruction file and its Claude alias.

**Blocked by:** None

**Status:** resolved

- [x] Accept exactly 12,288 UTF-8 bytes and reject one additional byte, including multibyte text.
- [x] Detect a broken symlink or a regular file replacing the alias.

## Answer

The static CI job checks file size and the Claude symlink. Fixture tests exercise the UTF-8 boundary and both invalid aliases.
