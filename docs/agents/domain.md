# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This is a **single-context** repo: one `CONTEXT.md`, one `docs/requirements/` and one `docs/adr/` at the root. It is a pnpm monorepo, but the `@project/*` packages are architectural layers of one domain (everything derives from `core`'s schema), not separate bounded contexts, so a single root context fits.

## Before exploring, read these

1. **`CONTEXT.md`** at the repo root, for terms.
2. **The owning requirements doc** in `docs/requirements/`, chosen from the task table in `AGENTS.md`. It restates the accepted ADRs for its topic in current words, with each rule's reason, build status and evidence. Near its top it links `snapshot.lock.json`, which records which ADRs the requirements restate.
3. **Any ADR that `python3 scripts/adr_snapshot.py check` lists as pending.** A pending ADR, new or changed since the lock recorded it, binds where it differs from the requirement, until the next refresh, if it is accepted; a proposed one binds nothing.
4. **Older ADRs in the area**, when you need the full argument, a rejected alternative or the history, or when you are about to change what one decides.

The seven topics with requirements, and the rules for keeping them current, are listed in [`workflow.md`](workflow.md#adrs-and-the-requirements-snapshot). A topic not on that list is read through its ADRs and the engineering guides in `docs/agents/`.

If any of these files don't exist, **proceed silently**. Don't flag their absence or suggest creating them upfront; create them lazily when terms or decisions actually get resolved.

## File structure

```
/
├── CONTEXT.md                          the glossary
├── docs/requirements/
│   ├── README.md                       the seven topics and what each owns
│   ├── maps-and-graphs.md              one requirements doc per topic, each linking the lock
│   ├── trace/                          where each source rule went
│   └── conflicts/                      disagreements and their rulings
├── docs/adr/
│   ├── README.md                       the accepted set, one line each
│   ├── 0001-recursive-spaces.md        accepted ADRs, numbered NNNN-<slug>.md
│   ├── …
│   ├── superseded/                     retired decisions, kept as history
│   └── archive/agent-guides/           the product guides the requirements replaced, kept as history
└── packages/
```

ADRs are binding and append-only. A superseded ADR lives in `docs/adr/superseded/`, so the top-level listing is the live set; `docs/adr/README.md` states each accepted decision in one line. Check an ADR's `Status:` before relying on it: a superseded one is history, not a rule. Its `Refines`/`Refined by` links point at the decisions that narrowed it. Never edit an accepted ADR's decision; its status block is the only part that changes, and `test/unit/adr-status-blocks.test.ts` holds the convention.

For *how* these get written (the grilling loop, when a decision earns an ADR, how an accepted ADR reaches the requirements, the verification bar) see [`workflow.md`](workflow.md).

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids. ADRs keep the vocabulary they were written in; `docs/adr/README.md` maps their older words to current ones.

**Map shares its spelling with a builtin and an Array method, so code follows ADR 0101's conventions.** No domain value is bound to a local named `map`: a callback's domain initial is `(m)`, and a longer-lived local takes a descriptive name. A `…Map` suffix on one of our identifiers means the entity, never a lookup table (say `…ById`, `…ByKind`). `.map(`, `.flatMap(`, `ReadonlyMap`, `WeakMap`, `MiniMap`, Prisma's `@@map` and a dependency's own names (Zod's `optionsMap`) are foreign and stay as they are.

**Graph is the name for what older records call Route (ADR 0041).** Schemas, code, tests and fixtures say Graph, Graph navigation and Traversal history; Route and Walk survive only in historical records and in qualified HTTP or graph-layout routing prose, such as `RoutedEdge` in `react-flow-adapter`. Unqualified `Graph` and `GraphEdge` name the domain; a strategy's and the renderer's intermediates are `LayoutStrategyGraph` and `GraphRenderEdge`; the canvas is `SpaceCanvas`. Do not add a Route-named alias.

**`path` means a file path only.** The Map's Graphs are spelled `graphs`/`activeGraph`. The `path` identifiers left are filesystem paths, the HTTP and product URL paths `@project/http` builds and matches (`productDestinationPath`, `SPACE_COLLECTION_PATH`, Hono's `context.req.path`), or React Flow's own SVG `edge-path` class; do not rename those.

**“Arrangement” is ordinary prose, not a domain entity.** `AuthoringRefusal` uses `placement-pending`, and `CanvasContent`'s third kind is `'resources'`, produced by `canvasContent`'s `hasResourcesOnCanvas`. **`'resources'` is not a synonym for Placement**: it means “Resources are mounted on the canvas”, which stays true while replacement placement is still pending.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap to record during domain review. A term that settles goes into `CONTEXT.md` in the same change, and a renamed term is also applied to the requirements docs that use it.

The vocabulary guard, `test/unit/current-domain-vocabulary.test.ts`, and what it does not scan are described in [`workflow.md`](workflow.md#domain-vocabulary).

## Flag ADR and requirement conflicts

If your output contradicts an accepted ADR or a requirement, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0002 (layout/view separation) and the Maps and Graphs requirement that restates it — but worth reopening because…_

A requirement that disagrees with an accepted ADR is a defect in the requirement, never a reason to ignore the ADR: follow the ADR and report the requirement for correction. Changing what an accepted ADR decides takes a new ADR (see [`workflow.md`](workflow.md#when-to-write-an-adr)). Code is evidence of what is built; it does not retire an accepted rule.
