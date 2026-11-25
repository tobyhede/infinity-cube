# 01: Gather the Map embedding's modules into one place

**What to build:** The modules that make up the Map embedding on a canvas move into one folder in `app`: the registry of Map embeddings, the embedded Open Space Resources hook, embedded publication and embed view. Behaviour does not change. This prefactor makes the later tickets edit one place.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] The four modules and their tests live under one folder, and every import is updated. Imports stay extensionless, and type-only imports use `import type`.
- [x] The canvas and Stage `HostMapProvider` adapters stay where they are (spec, decision 4).
- [x] No behaviour change. Typecheck, lint and the moved tests pass unchanged.
- [x] Any `docs/requirements/` citation that names a moved test file is updated in the same commit.
