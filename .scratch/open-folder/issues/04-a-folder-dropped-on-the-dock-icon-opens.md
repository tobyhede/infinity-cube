# 04 — A folder dropped on the Dock icon opens

**Status:** needs-triage

**Blocked by:** 01.

**What to build:** on macOS, handle `RunEvent::Opened { urls }`, so a folder dropped on the Dock icon (or opened with the application from Finder) opens as one more `open(origin, folders)` with a new `Origin`. The bundle needs `fileAssociations` with content type `public.folder`, not yet verified on a macOS build. Prior art: `/mnt/project-files/research/opening-module-prior-art-2026-11-26.md` in the project's shared files.

Open questions for triage: can `Opened` arrive before setup has decided what to show at launch, which would need the start-up gate the spec leaves out (Zed's #61346 was that race); does it need an ADR (ST-131).

## Comments
