# 12 — Port the stored-content and Export cases to Rust on SQLite

**Status:** resolved

**Blocked by:** 03.

**What to build:** Rust ports, on a SQLite file reopened between write and read, of the contract cases about what a stored Space keeps and what an Export of the Aggregate writes, which fit none of 04, 05 and 06. The tracked fixture lacks most of this content, so no Rust SQLite test reads it back today.

- [x] Each stored-content or Export case 03 lists for this ticket has a port with its `// Case:` line, and its pending exemption is deleted. Among them: a Space with no Maps; a Resource of a kind no plugin lists, its content nested with nulls and fractional numbers; an Ur Resource; Map `content`; an Edge with a Title and one hidden; a commit that changes a Resource's content, its head shape and its Map content; and an Export of what SQLite read back. Content the tracked fixture lacks and every mutant of the row codec dropping it survives today: Graph `color`, a Map's `activeGraph`, a Space Resource's `framing`, and the key order of Map content and of a missing-plugin Resource's content, each committed out of canonical order.
- [x] Each port asserts the value read back equals the value committed, byte for byte where the contract compares bytes.
- [x] "carries a Resource whose plugin is missing through Import and Export byte-identical" and "hands a Resource whose plugin is missing to that plugin when it returns" are ported through the library, `import_directory` into SQLite and `export_aggregate` from it after a reopen, with no CLI verb (that is `rust-host/issues/26`).

## Comments

### Resolved (2026-11-26)

The nine stored-content and Export cases are the shared table's `content` group (`crates/host/tests/repository_contract/content.rs`), run on SQLite and the memory store, each read back after a reopen. The two missing-plugin Import and Export cases go through `import_directory` into the store and `export_aggregate` from it after a reopen, with no CLI verb; the files Export writes are compared byte for byte, and the Space read again from them is compared with object keys in ascending order, since Export writes content it does not own in canonical order.

`keeps_what_the_fixture_lacks_as_committed`, not a port, commits Graph `color`, a Map's `activeGraph`, a Space Resource's `framing`, and Map content and a missing-plugin Resource's content with keys out of canonical order, then reads each back exactly, key order included, after a reopen, and through an Export.

Mutants of `crates/host/src/document.rs`, run against the `content` group: dropping a Graph's `color`, dropping a Map's `activeGraph`, and writing a missing-plugin Resource's content or a placement's Map content in canonical rather than wire key order are each killed (by `keeps_what_the_fixture_lacks_as_committed`, and the last two also by `stores_renames_and_reloads_a_resource_whose_plugin_is_missing`).
