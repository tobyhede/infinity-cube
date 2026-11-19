# 01 — Accept the Rust host ADRs

**Status:** resolved

**Blocked by:** None.

**What to build:** The maintainer reviews ADRs 0155, 0156 and 0157 and accepts, amends or rejects each. Accepting one changes its status to `accepted`, adds `Refines:` lines (0155 refines 0034 and 0124; 0156 refines 0010; 0157 refines 0071) with the matching `Refined by:` on each refined ADR, adds its line to `docs/adr/README.md`, and restates it in its owning requirements doc with the snapshot marker advanced, in the same change (`docs/agents/workflow.md`).

The restatement covers, besides each ADR's own lines:

- **Storage:** the desktop sidecar host as a host of Running (ADR 0155's first stage, already built in `src/desktop/` and `packages/desktop/` ahead of acceptance); ST-39 (one reader) and ST-90 (a mount refuses what the CLI refuses, in the same words) and the invariant "Every door applies the same intake" (`docs/requirements/storage.md`, "Effects across operations"), each reworded so that across runtimes the doors agree on the kind of refusal and where it is, not on the words (ADR 0156).
- **Space and Resources:** intake as one rule with two implementations held to one corpus (ADR 0156), and the plugin-list rule: adding a plugin is one line in each half of `packages/plugins` and, once the Rust intake exists, its Rust module and one entry in the Rust plugin list (ADR 0156).
- **UI:** the WebKit floor and the declared minimum systems (ADR 0157).

- [x] Each ADR accepted, amended or rejected by the maintainer.
- [x] Accepted ones indexed, reciprocal `Refines`/`Refined by` in place, `test/unit/adr-status-blocks.test.ts` green.
- [x] Storage (0155, 0156), Space and Resources (0156) and UI (0157) requirements restated as listed above, markers advanced.

## Answer

The maintainer accepted ADRs 0155, 0156 and 0157 on 18 November 2026, each with the `Refines:` lines named above, the reciprocal `Refined by:` lines, and an index row. Storage ST-22, ST-39, ST-90 and "Every door applies the same intake" say that across runtimes the doors agree on the kind of error and where it is. SR-15 names the Rust half of adding a plugin. UI-110 states the WebKit floor and the minimum systems as not built (05 builds it), and the platform-floor rule in `docs/agents/build-tooling.md` names the declared minimum system. The Storage, Space and Resources and UI snapshots, and the other four, now read "through 0157". The sidecar rules ST-113 to ST-116 cite ADR 0155 as accepted.
