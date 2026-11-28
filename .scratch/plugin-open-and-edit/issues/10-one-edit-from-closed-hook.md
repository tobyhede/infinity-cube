# 10: Decide whether the text plugins share how they start editing from Closed

**Status:** needs-triage

**Blocked by:** 07

**What to decide:** Markdown and Mermaid both need source text before they can edit from Closed. Review their read, refusal and retry paths after ticket 07. [ADR 0158](../../../docs/adr/0158-a-mermaid-resource-draws-its-diagram-with-mermaid-inside-its-plugin.md) allows the plugins to mirror each other. Record whether sharing that code would improve it. Each plugin chooses how to obtain any editor size it suggests. The public Resource API carries dimensions and leaves that implementation to the plugin.

## Acceptance

- [ ] Record the reasons to share the read and edit transitions or keep them in each plugin. A proposed change to the plugin contract follows the ADR workflow.
- [ ] If code is shared, both plugins keep their own choice of editor and sizing implementation. Their behaviour tests cover a refused read or Claim and a later successful Edit.
