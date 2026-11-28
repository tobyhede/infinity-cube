# 09: The drawn editor fits the visible canvas

**Status:** needs-triage

**Blocked by:** 05

**What to verify:** After ticket 05 lands, verify that the editor fits the visible canvas at the current zoom, with room for a margin where space permits. Clamp each dimension independently. The viewport can draw an editor smaller than the Closed Size. The Closed Size floor belongs to the size a completed resize can store. Each plugin chooses how to obtain its size hint.

## Acceptance

- [ ] Cover a viewport too narrow, one too short and one smaller than the Closed Size on both axes. The drawn dimensions fit the available area.
- [ ] A change of zoom updates the drawn cap and leaves the stored sizes alone.
- [ ] A resize starts from the drawn rect and saves the final visible length of each axis that changed. Preserve the saved dimension on an untouched axis. On a first resize, use the uncapped size hint or normal size for that axis, subject to the Closed Size minimum. If neither edge changes, save nothing.

The [viewport cap tests on PR #547](https://github.com/tobyhede/infinity-cube/blob/56e2d387/packages/app/test/visible-canvas-cap.test.ts) cover zoom and a canvas smaller than the Closed Size. Verify the final stored dimensions separately against the resize criterion above.
