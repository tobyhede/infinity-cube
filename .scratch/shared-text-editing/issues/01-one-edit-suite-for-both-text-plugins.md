# 01: One edit suite for both text plugins

**What to build:** one set of edit scenarios, written once and run against both the Markdown and the Mermaid plugin through the Resource API's test host. The Mermaid plugin (ADR 0158) copies its text reading, Edit, draft and Save from the Markdown plugin, and nothing holds the two copies together: a fix to one is not made in the other. After this ticket, a change to either plugin's edit that drifts from the other fails a test. Each plugin keeps its own notices; the suite asserts behaviour, and takes each plugin's wording as a parameter.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] One suite covers, for each plugin: reading its text asset; reading failed; Edit from Closed and from Open; the draft surviving a refused or failed Save; Save writing a new asset and committing it; Done; Mod+Enter; Edit offered nowhere when the text cannot be read; Edit not offered without `mayEdit`.
- [ ] The suite runs against both plugins and passes on `main`'s current code with no plugin change.
- [ ] Removing or changing one scenario's behaviour in only one plugin makes the suite fail (checked once by hand, recorded below under `## Answer`).
- [ ] Tests that only duplicate a suite scenario are removed from each plugin's own tests; plugin-specific tests stay.
