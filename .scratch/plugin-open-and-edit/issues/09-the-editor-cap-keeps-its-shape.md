# 09: The drawn editor fits the visible canvas

**Status:** needs-triage

**Blocked by:** 05

**What to verify:** Ticket 05 caps the editor at the visible canvas at the current zoom, less the margin on each side. Clamp each dimension independently. The viewport can draw an editor smaller than the Closed Size. The Closed Size floor belongs to the size a completed resize can store. A plugin chooses its suggestion independently of the canvas calculation.

## Acceptance

- [ ] Cover a viewport too narrow, one too short and one smaller than the Closed Size on both axes. The drawn dimensions fit the available area.
- [ ] A change of zoom updates the drawn cap and leaves the stored sizes alone.
- [ ] A completed resize starts from the drawn rect and stores an Edit size that meets the Closed Size floor.
