# 04: Mermaid edits through the shared text editing

**What to build:** the Mermaid plugin drops its copy of the text reading and edit and uses the shared one from 03. A person editing a Mermaid Resource sees no change: its notices still speak of "source", the empty note still asks to write Mermaid source when Edit is available, and the drawing still follows the light or dark scheme.

**Blocked by:** 03 (Markdown edits through the shared text editing).

**Status:** ready-for-agent

- [ ] The Mermaid plugin's view holds no copy of the text reading, the draft or Save.
- [ ] The suite from 01 passes for both plugins unchanged.
- [ ] The Mermaid plugin's own tests (theme, drawing, failure and empty notes, the load wait) and its e2e spec pass in CI.
- [ ] ADR 0158's note that the plugin copies the Markdown plugin's edit is superseded by the ADR from 02, not edited.
