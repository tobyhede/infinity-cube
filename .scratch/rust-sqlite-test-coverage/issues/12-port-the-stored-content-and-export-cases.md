# 12 — Port the stored-content and Export cases to Rust on SQLite

**Status:** ready-for-agent

**Blocked by:** 03.

**What to build:** Rust ports, on a SQLite file reopened between write and read, of the contract cases about what a stored Space keeps and what an Export of it writes, which fit none of 04, 05 and 06. The tracked fixture lacks most of this content, so no Rust SQLite test reads it back today.

- [ ] Each stored-content or Export case 03 lists for this ticket has a port with its `// Case:` line, and its pending exemption is deleted. Among them: a Space with no Maps; a Resource of a kind no plugin lists, its content nested with nulls and fractional numbers; an Ur Resource; Map `content`; an Edge with a Title and one hidden; a commit that changes a Resource's content, its head shape and its Map content; and an Export of what SQLite read back. Content the tracked fixture lacks and every mutant of the row codec dropping it survives today: Graph `color`, a Map's `activeGraph`, a Space Resource's `framing`, and the key order of Map content and of a missing-plugin Resource's content, each committed out of canonical order.
- [ ] Each port asserts the value read back equals the value committed, byte for byte where the contract compares bytes.
- [ ] "carries a Resource whose plugin is missing through Import and Export byte-identical" and "hands a Resource whose plugin is missing to that plugin when it returns" are ported through the library, `import_directory` into SQLite and `export_aggregate` from it after a reopen, with no CLI verb (that is `rust-host/issues/26`).
