# A save refused `forbidden` names the cross-site cause

Status: ready-for-agent

**What to build:** replace `PERSISTENCE_FAILURE_REASONS.forbidden` in `packages/app/src/authoring-refusal.ts` ("You do not have permission to save this space.") with a sentence naming the cause, for example "This change was refused because it did not come from InfinityCube's own page. Open the Space from its own address and try again."

**Why:** ruling UI C6 (20 November 2026): since ADR 0161 the only `forbidden` a shipped host answers is the cross-site refusal (Storage ST-123), and InfinityCube has no permissions. UI-89 is bug: code differs until this lands.

**Acceptance criteria:**

- [ ] `app/test/authoring-refusal.test.ts` › "writes its own sentence for a forbidden rejection", `app/test/persistence-control.test.tsx` › "explains a permanent rejection from its code" and `app/e2e/http-persistence.spec.ts` › "a permanent rejection explains the reason and leaves the Space available" assert the new sentence.
- [ ] UI-89's `forbidden` note moves to **built**.
