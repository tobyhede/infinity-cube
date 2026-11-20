# Fresh-reader questions: Editing

Written before drafting, from the sources at `d461223`, so the draft cannot shape them. Each answer cites the ADR, code and test it rests on. A reader starts at `AGENTS.md` and is not told which document holds the answer.

## Q1 (ordinary task). An author renames a Resource while the previous Edit's commit is still in flight. Does the rename wait, and what reaches the store?

**Expected answer.** The rename completes at once: a commit in flight withholds no authoring and an Edit never waits for persistence (Editing ED-8; ADR 0035, ADR 0042). The session holds at most one commit in flight; the rename coalesces into the newest working Space, which commits next against the revision just acknowledged (ED-42; ADR 0042). The status reads `pending` meanwhile (statuses table). There is no Save to press (ED-7; ADR 0030).

**Evidence.** `packages/persistence/test/session.test.ts` › "coalesces edits behind one in-flight commit to the latest complete snapshot", "carries the acknowledged revision into the coalesced commit it starts"; `packages/persistence/src/session.ts` (one in-flight commit, `submit` decides from `state.working`).

## Q2 (crosses into Storage and UI). A host answers a save 403 `forbidden`, as ADR 0161 has both hosts answer a change sent from another site. What status does the session take, and how does the author recover?

**Expected answer.** The transport classifies `forbidden` as a permanent failure, `forbidden` (Storage ST-101, ST-123; ADR 0098, ADR 0161; `packages/http/src/backend.ts` maps `forbidden` to `{ kind: 'permanent-failure', code: 'forbidden' }`). A permanent failure puts the session in `rejected` (Editing ED-46; ADR 0042): Retry is not offered (a 403 is not a size rejection or a blocked replay), and the next Edit commits the newest working Space. The application words the code itself and never shows the Problem Details detail (ED-44, ST-102; `packages/app/src/authoring-refusal.ts` has a sentence for `forbidden`). The report is a dialog that takes focus until acknowledged (UI-93; ADR 0154). ADR 0161 adds no new session status or recovery: the product's own page always passes the rule, so a `rejected` from it means a page that is not the product's.

**Evidence.** `packages/persistence/test/session.test.ts` › "disables retry after permanent failure but allows a later valid submit"; `packages/http/src/backend.ts` (the `forbidden` case of the failure classifier); `packages/http/src/index.ts` (`CROSS_SITE_CHANGE_DETAIL`, ADR 0161).

## Q3 (crosses into Navigation and Space and Resources). An only-drawn Space is replacing an image (exclusive work) when the canvas Space's save conflicts. Which recovery actions can the author take now, and what happens to the replacement if the stored Space is accepted afterwards as part of a failed coordinated save?

**Expected answer.** While exclusive work runs, every Space withdraws authoring and navigation (ED-68, Navigation NV-50; ADR 0126, ADR 0142). Accept stored is withheld until the work answers; Retry and Keep local stay available (ED-70; ADR 0042, ADR 0126). Once Accept stored runs after a failed coordinated save, every Space the save covered is replaced and advances its own replacement epoch, so the other Space's running work and drafts are discarded, not written into the restored copy (ED-32; ruling Editing C1, `DECISIONS.md`). That is a known bug: today only the canvas Space's epoch advances (`packages/app/src/space-authoring.ts` `acceptStoredSpace`; `packages/persistence/src/session.ts` `restoreCoordinatedCommit`).

**Evidence.** `packages/app/test/persistence-control.test.tsx` › "keeps Keep local and retry during a replacement and withholds Reload until it answers"; `packages/app/test/dock-navigation-hold.test.tsx` › "withdraws the canvas Space’s navigation and authoring while an only-drawn Space replaces an image"; `packages/app/test/active-graph-after-coordinated-recovery.test.ts` › "leaves the Dock and the canvas naming one Graph" (pins the current behaviour).

## Baseline against the reading path before the refresh

Run once by the agent that wrote the questions, not independently.

- **Q1.** `AGENTS.md` routes "save" to Editing; ED-7, ED-8 and ED-42 answer it with the evidence above. Found.
- **Q2.** `AGENTS.md` routes a failed save to Editing; ED-46 gives the recovery, and ED-44 points to ST-101, which names `forbidden` as permanent. ST-123 states ADR 0161's rule. The answer is found, but Editing does not say that ADR 0161 changed nothing in the session, so a reader checking ADRs above the old marker (0157) has to work that out from ST-101. The refresh adds a trace row for 0161 and notes it under ED-46's evidence.
- **Q3.** ED-68, ED-70 and ED-32 answer it; NV-50 holds navigation. Found.
