# A permanent rejection is a dialog that takes focus

Status: accepted
Date: 2026-11-15
Refines: 0042
Related: 0068, 0082

ADR 0042 decides what a retryable failure, a conflict and a permanent rejection each keep, and ends: "None steals focus." ADR 0068 later made a conflict a choice the author must take before going on. Nothing did the same for a permanent rejection, a save the server will never accept, though the application has always shown one, and a refused save, as a dialog that takes focus until it is acknowledged. The maintainer ruled on 15 November 2026 (UI conflict C4 in `docs/requirements/conflicts/ui.md`).

## The decision

- **A permanent rejection, and a refused save, is a dialog that takes focus**, announced, explaining why the save was declined, and dismissed only by acknowledging it ("Continue editing"). After that, the Dock keeps a "Persistence rejected" cue.
- **It keeps what 0042 keeps**: local work and the explanation, and a later valid Edit may attempt the newest complete snapshot again.
- **A retryable failure still takes no focus**: it stays a standing alert beside the Dock with Retry.

## Why

- **A rejection has nothing to retry, only something to read.** A standing alert suits a failure the author can recover with one press. A rejection means the server declined the work itself, and the author should see why before editing further.

## Rejected

- **No focus, as 0042 reads**: the rejection would be easy to miss for an author not watching the Dock, who would keep working on a Space whose saves are declined.

## Consequences

- No code change: the application already does this (UI UI-93). Its tests check the dialog, its wording and its acknowledgement, but not yet that focus moves into it.
