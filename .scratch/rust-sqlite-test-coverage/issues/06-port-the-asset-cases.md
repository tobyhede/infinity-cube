# 06 — Port the asset cases to Rust

**Status:** resolved

**Blocked by:** 03.

**What to build:** Rust ports of the contract's asset cases, among them "keeps stored assets outside the aggregate its lifecycle doors replace" and "keeps a stored asset across a fresh repository host". TypeScript already holds both; Rust reads no stored asset back after a reopen or a replace.

- [x] Each asset case 03 lists for this ticket has a port with `// Case: <name>` on SQLite, and its pending exemption is deleted.
- [x] A Rust-stored asset is read back, byte for byte and with its media type, after the file is reopened and after `replace_aggregate`.

## Comments

### Resolved (2026-11-26)

The seven asset cases are the shared table's `assets` group (`crates/host/tests/repository_contract/assets.rs`), run on SQLite and the memory store. Each reads its asset back after the store is reopened (SQLite), the lifecycle case after `replace_aggregate` and a reopen. The Markdown case Imports the new Space `conformance/init/expected` holds, its Resource pointed at a text asset carried in `assets/`, reads the Resource and the asset back, and Exports in place onto the same files byte for byte, which is the Rust shape of the TypeScript case's decode and serialize.
