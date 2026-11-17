# 17 — The remaining CLI verbs: init, import and export

**Status:** needs-triage

**Blocked by:** 16.

**What to build:** `init <dir>`, `import <dir> --store <postgres|sqlite> [--dangerous-replace]` and `export <dir> --store …` in the Rust binary, answering as `pnpm cube init`, `import` and `export` do today (`src/cli/run.ts`): the same refusals, by kind and location (ADR 0156); `init` writing through Export (Storage, "Nothing writes an Aggregate directory except Export"); `import` replacing only with `--dangerous-replace` (ADR 0094); `export` writing in place, only the files Import reads, unchanged ones skipped. Once `init` exists, the Rust `run` and `check` name the Rust `init` in their refusal of a missing or empty directory instead of `pnpm cube init` (12).

The MCP server is 18, the development and test hosts 19, and retiring the TypeScript server 20.

- [ ] Conformance: for each verb, a case list run against both `pnpm cube <verb>` and the Rust binary with the same arguments, comparing exit status, refusal kind and location, and the directory's or store's contents afterwards (the bytes of every file `init` and `export` write; the stored Space after `import`), against SQLite and PostgreSQL.
- [ ] `init` then `check` accepted; `import` then `export` round-trips the fixture unchanged.
- [ ] Storage requirements and the `AGENTS.md` Commands section name the Rust verbs; the `infinity-cube-getting-started` skill names them where it names `pnpm cube init`, with the plugin's version bumped in all three manifests (`plugins/infinity-cube/plugin.json`, `plugins/infinity-cube/.claude-plugin/plugin.json`, `plugins/infinity-cube/.codex-plugin/plugin.json`).
