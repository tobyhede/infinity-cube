# Conflicts: Storage and hosts

These are open conflicts for `storage.md`, which is not written yet. Paths are relative to `packages/`.

## S1. How many places run the first-working-read loader?

- **Context.** Which reads initialize is stated in MG-75. Storage owns where the loader runs.
- **Disagreement.** 0080 says there is one server-side first-working-load boundary. The old contract (R18) says one boundary per context: the server, or the in-page host of a mounted page. The code builds the initializing loader in three places: the HTTP app, the persistence session registry, and Open Spaces in the browser.
- **Options.** (a) Restate the rule as "every working read goes through the one initializing loader, wherever it runs". (b) Keep one boundary per context and remove the extra call sites. (c) Confirm that the extra sites never see an uninitialized Space, and record that.
- **Evidence for (c), from reading only.** Behind HTTP, both the browser's Open Spaces loader and the registry loader read through the HTTP backend's single-Space route, which has already initialized the Space. So only a mounted page's in-page loader initializes in the browser.
- **Evidence.** `http/src/index.ts` (`createWorkingSpaceLoader`, the single-Space route); `persistence/src/session-registry.ts` (`workingTargetSelection`); `app/src/open-spaces.ts` (`compose`); `persistence/src/working-space.ts` `createWorkingSpaceLoader`.
