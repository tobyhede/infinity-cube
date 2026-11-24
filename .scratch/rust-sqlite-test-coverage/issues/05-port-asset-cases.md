# 05: Port asset cases, with read-back after reopen

**Status:** ready-for-agent

**Blocked by:** 02.

**What to build:** Asset storage behaves the same on both runtimes, and an asset survives the things that rewrite a store. A shared case stores an asset, reopens the store, replaces the aggregate, and reads the asset back, comparing bytes and media type. Today neither runtime reads an asset back after a reopen.

- [ ] Every asset behaviour in the TypeScript contract is moved to the shared format.
- [ ] A case reads an asset back after reopening the SQLite file and after `replace_aggregate`, on both runtimes.
- [ ] Missing-asset and duplicate-asset answers match across runtimes.
