# 06 — Port the asset cases to Rust

**Status:** ready-for-agent

**Blocked by:** 03.

**What to build:** Rust ports of the contract's asset cases, among them "keeps stored assets outside the aggregate its lifecycle doors replace" and "keeps a stored asset across a fresh repository host". TypeScript already holds both; Rust reads no stored asset back after a reopen or a replace.

- [ ] Each asset case 03 lists for this ticket has a port with `// Case: <name>` on SQLite, and its pending exemption is deleted.
- [ ] A Rust-stored asset is read back, byte for byte and with its media type, after the file is reopened and after `replace_aggregate`.
