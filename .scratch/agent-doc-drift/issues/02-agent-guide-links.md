# 02 — Catch broken links in agent guidance

**What to build:** CI validates local links from the root instructions and engineering guides.

**Blocked by:** None

**Status:** resolved

- [x] Check file targets and same-page and cross-file heading anchors.
- [x] Report the source and broken destination.

## Answer

The static CI job runs the existing link checker over the root instructions and engineering guides. Fixture tests exercise missing files and anchors.
