# Anti-slop

The 15 vendored rules are design constraints, not a formatting pass. Preserve type evidence from construction to use, parse external representations once at their I/O boundary, and give owned values named owner contracts. Use the diagnostic procedure below. Assertion changes also need both [assertion gates](#two-rules-on-assertions).

## Responding to a diagnostic

1. Read the diagnostic and its implementation under `tools/oxlint/anti-slop/rules/`; the implementation is the authoritative rule boundary.
2. Fix the lost evidence or misplaced boundary. Prefer inference or `satisfies` for known values, schema-derived or named owner types for contracts, and a parser at the first owned I/O boundary.
3. If the code is the boundary itself, implements an external contract, or exercises a real third-party seam, check `.oxlintrc.json` for the established exception category. Extend the narrowest existing file override with a site-specific rationale when the case genuinely matches. A new category must explain why the rule's preferred design cannot represent the code honestly.
4. Run `pnpm lint:anti-slop`. Every enabled rule must report zero unexcepted findings.

Do not reshape honest code merely to evade a syntactic rule: renaming an error to `cause`, replacing a justified dictionary with a `Map`, or moving a cast only hides the same design. Do not add a blanket disable, an inline suppression, or a rule downgrade. Repository exceptions live as file-scoped overrides in `.oxlintrc.json`, beside their rationale, so they remain reviewable.

## Evidence

- `no-known-value-widening` and `no-widen-then-assert`: keep a known value precise through use. Remove redundant broad annotations; use inference, `satisfies`, or a named owner contract.
- `no-chained-type-assertions`: a double assertion discards the missing proof. Preserve the source type or parse the value; `as const` chains are allowed.
- `no-object-parameters`, `no-unknown-parameters`, `no-unknown-returns`, and `no-unknown-type-aliases`: functions exchange parsed, named contracts. Keep `unknown` visible only inside an honest parsing, caught-error, or external-contract boundary; do not conceal it behind an alias.
- `no-unsafe-dictionary-type`: dictionaries carry a concrete owner/schema-derived value type. Parse an external payload before insertion.
- `no-runtime-typeof`: decode representations at I/O boundaries, then branch on domain values. Type predicates may use `typeof`; `.oxlintrc.json` records the boundary, platform-detection, closed-union, and value-under-test exceptions.

## Two rules on assertions

Since ADR 0062 a narrowing assertion faces two gates doing different jobs, and satisfying one says nothing about the other.

- `anti-slop/require-safety-comment-for-type-assertion` (oxlint) **demands a reason**. Put a `SAFETY:` comment immediately before a non-const assertion or its containing statement. State the evidence that makes the assertion safe, including at sites covered by the baseline.
- `@typescript-eslint/no-unsafe-type-assertion` (ESLint, type-aware) **caps the count**. A narrowing assertion is an error anywhere in the repository.

For assertion changes, run both `pnpm lint:anti-slop` and `pnpm lint`. Oxlint requires a nearby justification and rejects wording that admits the assertion is unverified. ESLint enforces the count. Reviewers check that the stated invariant holds at the assertion.

### The suppressions baseline

`eslint-suppressions.json` at the repository root records the narrowing assertions that predate the rule, counted per file; the file itself is the count. A committed list of violations invites two wrong readings, and both are wrong:

- **It is not evidence the rule is decorative.** Those sites were examined in a reviewed pass (`.scratch/anti-slop/` issue 07) under exactly the test the rule applies, and none was found to be a missing type boundary. The file is the record of what review already accepted. A new assertion fails lint even in a file the baseline lists — and adding one to a listed file reports *every* assertion in that file, because a count-based baseline cannot tell which is new. That is the intended pressure.
- **It is not a backlog to schedule.** ADR 0062 rejected the cleanup on the evidence. `--prune-suppressions` runs in the `lint` that `verify` performs, so the file shrinks on its own as assertions go for other reasons, and the ceiling never rises. A project to empty it is the cleanup the ADR rejected, arriving under another name.

It is **generated and never hand-edited** — not to add an entry, not to raise a count, not to reformat (it is in `.prettierignore` for that reason).

**Do not regenerate it to make a new finding go away.** `eslint . --suppress-rule @typescript-eslint/no-unsafe-type-assertion` *merges and overwrites with current counts*, so running it on a tree that has grown assertions silently re-baselines them in and leaves `verify` green. That is the "answer a new finding by adding it to the suppressions file" ADR 0062's *negative to remember* forbids, reached through a command rather than an editor. `test/unit/assertion-ratchet.test.ts` pins the total against a ceiling for exactly this reason, and fails if the file goes missing, empties, grows a second rule, rises, or takes a shape ESLint would not have written.

The one gap left, recorded so nobody assumes otherwise: the baseline counts per file and rule rather than per site, so removing one assertion and adding another **in the same file** leaves the count equal and is never detected.

### Proving the gates still bite

When changing a rule or a fixture, follow the [typing fixture guide](../../tools/typing-fixtures/README.md) and run `test/unit/typing-fixtures.test.ts`. Every `must-fail` fixture must be rejected and every `must-pass` fixture must survive within its declared exemptions. Check the scoped overrides in `.oxlintrc.json` before relying on a passing fixture.

## Ownership

- `no-shape-in-symbol-names`: name symbols for their domain role or owner; `shape` describes structure but assigns no responsibility. Two domain terms are allowed, both configured in `.oxlintrc.json`: **head shape** (ADR 0105) and a Resource's **Shape** (ADR 0121), the second written `resource shape` in a compound (`allowedCompounds`) and allowed alone only as the Map entry's whole field name `shape` (`allowedNames`) — where the identifier names a property (an object or destructuring key, a member access, a type member or a JSX attribute), never as a local or a parameter, which is written `resourceShape`. A new domain term joins those lists only if `CONTEXT.md` defines it and "shape" in it names drawn geometry.
- `no-object-parameters` also rejects ownerless `object` contracts; name what the function accepts.

## Seams and operations

- `no-module-mocking`: test through a real composition-time dependency seam and a faithful implementation. The scoped third-party rendering and filesystem fault-injection exceptions are documented in `.oxlintrc.json`; do not copy them to ordinary collaborators.
- `no-reflect-apply`: call typed functions directly or put dynamic dispatch behind a named interface.
- `no-reflect-get`: use typed property access or parse dynamic input into a named type before reading it.
- `no-conditional-empty-object-spread`: build the object, then add an optional property in a separate statement. Preserve omission semantics; assigning `undefined` is not equivalent under `exactOptionalPropertyTypes`.

## Nondeterminism is injected at composition, never mocked (ADR 0109)

A module that mints identities, reads time or otherwise depends on a nondeterministic in-process function receives that function when it is composed, so a test can supply a deterministic one. Its operational interface then stays in domain language and does not repeat the dependency on every call.

- **`newId` is required, with no default.** `createSpaceAuthoring` takes it exactly as it takes `reportObserverError`, and mints the Resource, Map and Graph ids of a completed Edit from it. `packages/app/src/compose-app.ts` supplies it explicitly, so every authored identity has one visible source. `createOpenSpaces` takes the same `newId`, also required with no default, and accepts an optional `reportObserverError`. It resolves the reporter at that boundary and forwards both dependencies to every `composeApp` call.
- **Do not answer a test's need for a known id with `vi.spyOn(crypto, 'randomUUID')`.** ADR 0109 rejects it on the grounds ADR 0016 gave for `loadSpace`: a constant collides across a property test's cases, so it needs a counter, at which point a generator exists anyway; `randomUUID` is an unseedable CSPRNG, so controlling it means owning it; and the mock stops working in silence the day the implementation moves to UUID v7 and reads the clock as well as the entropy pool. A spy also hides a miscount: a spy naming two ids for an Edit that mints three lets the third come from the real generator unnoticed. Tests name the ids they assert on through `packages/app/test/minting.ts`.
- **Do not manufacture a port or adapter for a dependency with one in-process implementation**, and do not hide nondeterminism behind global mocking. Deterministic rules stay uninjected: `titles.ts` mints `Resource N`, `Map N` and `Graph N` through three named operations with the `<Prefix> N` arithmetic private, because nothing there is worth replacing in a test.

## Sources of truth

`.oxlintrc.json` is the live enabled-rule and exception list. `tools/oxlint/anti-slop/PROVENANCE.md` pins the upstream source; upgrading requires a manual re-diff. `.scratch/anti-slop/research.md`, `spec.md`, and resolved issues record the adoption and migration history, not current instructions.
