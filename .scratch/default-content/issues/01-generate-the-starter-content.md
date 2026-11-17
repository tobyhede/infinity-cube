# 01 — Generate the starter content a new aggregate opens on

Status: needs-triage

**What to build:** ADR 0077's Default Content. `defaultContentAggregate` (`src/startup/default-content.ts`) still returns the ordinary new Space, a placeholder that calls itself "the seam and not yet the content". Replace its body with one deterministic generator for a short starter talk, so `pnpm cube init` and a database host's first start-up (requirements `storage.md` ST-10, ST-11) both open on something that shows what InfinityCube does.

- **What it holds:** a Meta Space whose `defaultMap` places a few Resources, one of each listed plugin that starts with content (Markdown, Image, Reference, Space, Ur; read the kinds from `@project/plugins/domain`'s `PLUGINS`, not from this list), joined by one Graph that presents end to end. A Space Resource frames a second, small Space, so the starter shows nesting. Any picture is an asset the generator carries, so Export writes it under `assets/`.
- **Deterministic:** the same `newId` sequence gives the same aggregate, and nothing reads the clock or the network.
- **Ordinary authored state:** nothing marks it protected, repairs it or adds it again once a repository is initialized (ADR 0077, ST-11).
- **Words:** the Resources' text says what to do next (open, present, edit, `pnpm cube run`), in current vocabulary (`docs/agents/domain.md`).

Out of scope: the CLI hard reset ADR 0077 pairs with this generator. It was closed with `.scratch/v1-release/issues/16`; this ticket is only the content.

**Open for triage:** the starter talk's actual content (topic and wording), which is Toby's call.

**Acceptance:**

- `pnpm cube init <dir>` writes the starter aggregate, and `pnpm cube check <dir>` accepts it.
- A database host's first start-up stores the same aggregate, and `test/unit/database-startup.test.ts` and `test/unit/aggregate-round-trip.test.ts` pass against it.
- An e2e test on the `new-space` project opens the starter Map and presents its Graph from first Resource to last.

Split from `.scratch/v1-release/issues/16` on 2026-11-16.
