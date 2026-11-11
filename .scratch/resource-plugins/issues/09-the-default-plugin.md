# 09 — The default plugin

Status: ready-for-agent

**Blocked by:** 03 — The asset store; 07 — The Space plugin.

**What to build:** the default plugin, an ordinary plugin the host selects when a stored Resource's `kind` names no plugin in this build, in place of ADR 0120's refusal (`KIND_UNREGISTERED`). It draws the Title and says the kind is not available, in a rectangle. The Resource keeps every canvas capability and offers no authoring of its content or a Create.

Such a Resource is the same `Resource` value as any other, so the host carries it without reading it. A rename changes `title`, `content` and Map content stay unread JSON, and its assets travel by the walk from `03`. Delete removes the Resource, and an asset leaves the Export once nothing references it, while the store keeps it (ADR 0106). A plugin that returns reads the Resource as it stands.

While any plugin is missing, an unrooted Space is held rather than refused. A Resource with no `kind`, and content a present plugin's schema rejects, stay refused.

**Roll forward:** `packages/core/src/schema.ts`'s `kindedContent`, `docs/schema/resource/resource.schema.json`, `packages/graph/src/resource-file.ts`, the unrooted-Space check in `space-aggregate.ts`, `docs/aggregate-directory.md`'s ownership rules, `docs/agents/editing-and-persistence.md`, the `infinity-cube-authoring` skill, and tests asserting the refusal.

**Acceptance:**

- An Aggregate holding an unknown kind opens, and that Resource moves, connects, renames, deletes and presents.
- Run, edit another Resource and Export leave its canonically written `<id>.json` and its assets byte-identical, and its Map content unchanged as JSON.
- Rename → Export → Import shows the new Title, with `content` unchanged as JSON and its assets byte-identical.
- Delete → Export → Import leaves no such Resource and no asset only it referenced, and an asset another Resource references stays.
- For each of PostgreSQL and SQLite: Import, discard the source directory, Export into an empty directory, restore the plugin and Import that directory. The Resource reads through its plugin, and an asset that is not valid UTF-8 is byte-identical.
- Deleting a Resource with no plugin that alone rooted a Space, then restoring the plugin, refuses the aggregate naming that Space.
- Where a Resource with no plugin and a Space Resource both own one Space (ADR 0074's shared ownership), the host cannot read the first's reference, so deleting the Space Resource deletes the Space with it, and restoring the plugin refuses the aggregate naming the Resource whose Space is gone. This is the cost ADR 0142 accepts, not a held Space.
- An asset's file name and media type survive the round trip, under issue 03's naming rule.
- A build that gains the plugin over a store already holding the Resource reads it through the plugin, with no Export or Import.
- `CI passed` is green, including the PostgreSQL and SQLite jobs.

## Decisions

1. The default plugin is its own package, `@project/plugin-default`, built with `definePlugin` and `definePluginView` like any other, and listed in no `plugins.ts`. Its declared kind `default` is never matched, because only listed plugins are matched by kind. Its surface is handed the stored kind instead, so the note names the kind that is missing. Core reads its flags and Map content through `defaultKind` (`packages/core/src/kinds/default.ts`). ui and app reach it through the fallback in `pluginEntryFor` and `defaultDecorator`.
2. A missing kind is the `MissingKind` arm of core's `Resource` union: a branded string, carried as `ResourceKind = KindId | MissingKind`. Comparing a kind with `===` cannot rule out a branded string, so narrowing to one kind is done with `isOfKind(value, kind)`. Tests, scripts and fixtures were rewritten to use it.
3. A missing kind's `content` must be a JSON object. This agrees with the envelope JSON Schema, whose `content` is `object`. A non-object is refused. A kind that is not a well-formed id is still refused, now as `kind-malformed` (`KIND_MALFORMED` replaces `KIND_UNREGISTERED`).
4. A misspelt or miscased bare kind, such as `Markdown`, is well formed. It is now carried as a missing kind and drawn as "not available" instead of being refused. The authoring skill tells authors to check the spelling when a Resource draws that note.
5. A Resource with a missing kind may not become a Target. The default plugin declares no `mayBeTarget`, so `createInMap` refuses `reference-target-not-targetable` and the rail draws Create Reference unavailable, naming the kind. Intake still carries a Reference that already names one (`storedResourceReferenceProblems`), and that Reference embeds the default view. The ADR's "referenced" is read as "a Reference that names it is kept". The other reading, that a new Reference may be created, would let a returning plugin that declares no Target leave the aggregate refused, which is the outcome decision 7 rejects. A missing kind declares no Resource or Space references, and its content resolves as `unresolved`. Also, deleting a Resource that the missing plugin's own references would have named is not refused, because those references cannot be read.
6. The host gives a missing kind's surface only its Title commit, withdrawn by the exclusive gate like any other surface. It gets no content, Map content, store, pick or Claim operation.
7. The held rule applies while any Resource in the aggregate has a missing kind (`loadSpaceAggregate`). Refusing on restore was not done, because it would leave an accepted store that no longer opens. Instead, if a commit deletes the last such Resource while a Space is held only by the rule, the commit is refused at that point, naming the Space: the baseline is held and the candidate is not. If another missing-kind Resource remains, the delete is accepted, and the Space is refused once none remain (`test/unit/missing-plugin-round-trip.test.ts`).
8. "A plugin that returns" and "a build that gains the plugin" are covered by construction, not simulated. The plugin list is fixed at build time, so simulating them would mean making it injectable for one test. Tests show the value is carried unchanged: deep-equal through the store, and byte-identical through Export from memory, SQLite and PostgreSQL. The contract case "carries a Resource whose plugin is missing through Import and Export byte-identical" Imports, discards the source, Exports into an empty directory and re-Imports, with an asset that is not valid UTF-8. Intake then parses that same value through whichever plugin the build has.
9. `resource.schema.json` now uses an `if` that lists the built-in kind ids, and applies `builtInKinds` only to them. Any other kind's `content` is an object. Adding a bundled kind means adding its id to that list.
10. The round-trip tests use `application/pdf` assets. The extension table maps a media type it does not list to `application/octet-stream`, so the name and media type survive only for listed types. That limit belongs to issue 03 and is not changed here.
11. Export writes a missing kind's `content`, and every Map entry's `content`, in one canonical form: keys sorted by code unit at every depth (`canonicalJsonValue` in `packages/core/src/json-value.ts`). It is applied in `canonicalResource` and in `write-space-directory.ts`. Without it, PostgreSQL's `jsonb` hands keys back in its own order and an Export rewrites untouched files. On PostgreSQL the contract case fails without this change and passes with it. A plugin's own content keeps its schema's order, as before.
12. The Dock's Resources and Connect lists show every missing kind under one `unavailable` toggle, "Resources of a kind not in this build". The toggle is drawn only while the Space holds such a Resource, so it is not a permanent zero.
13. Issue 08's creation host refuses a `from: 'resource'` creation whose Reference Target has a missing kind. The refusal comes from `createInMap`, and its notice uses the rail's sentence, "“<kind>” is not available in this build, so it cannot be referenced." (`describeAuthoringRefusalIn` in `packages/app/src/authoring-refusal.ts`, which now also holds `referenceTerminal`). The default plugin offers no creation, so `pluginCreations` never lists it.
