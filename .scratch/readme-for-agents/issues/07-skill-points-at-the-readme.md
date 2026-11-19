# 07: Point the getting-started skill at the README for Running

**What to build:** An agent setting a person up tells them how the run treats their files from one source, the README's Running section, rather than from the skill's own six-point copy. The skill keeps its step and its completion criterion (the person has the address and has been told each point), and names the points it must cover by pointing at the README section.

**Blocked by:** 01 (Correct how the README and skills describe Running), 05 (Restructure the user half of the README).

**Status:** ready-for-agent

**Why:** The skill's copy is where its stale claims came from: two copies of one meaning drift. Found by the README audit (`../audit/duplication.md`). Read the Workflow doc's skills section before changing it; the skill is also installed outside this repository, so it may link only by absolute URL.

- [ ] The skill's Running step points at the README section by absolute URL and no longer restates it
- [ ] The step still ends on a checkable completion criterion
- [ ] The version is bumped equally in all three plugin manifests, and the tests holding the skill's links and the manifests pass
