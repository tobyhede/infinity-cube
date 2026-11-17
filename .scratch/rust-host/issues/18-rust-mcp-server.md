# 18 — The MCP server in the Rust binary

**Status:** needs-triage

**Blocked by:** 17.

**What to build:** `mcp <dir>` in the Rust binary: a stdio MCP server whose tools list, read, write and delete `<dir>`'s files and check it as `check` does, as `pnpm cube mcp` does today (`src/mcp/aggregate-mcp-server.ts`), with standard output carrying only the protocol. The same tool names, input schemas and answers, so an agent configured for one works with the other. ADR 0155 stages it with the remaining verbs, after 17.

- [ ] Conformance: one scripted MCP session (initialize, list tools, then each tool, including a write that `check` then refuses and a path outside `<dir>`), run against `pnpm --silent cube mcp` and the Rust binary, with the same tool list and the same results, refusals compared by kind and location rather than wording.
- [ ] Nothing but protocol on standard output, held by a test.
- [ ] The `AGENTS.md` Commands section and the `infinity-cube-authoring` skill name the Rust MCP server, with the plugin's version bumped in all three manifests.
