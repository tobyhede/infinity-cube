# A plugin tells the host of an error in what it draws

Status: proposed by the user 2026-11-19; follow-up after #481 merges. Needs an ADR (it changes the
Resource API) and updates to UI (notices, UI-89/UI-94) and Rendering.

## Problem

A plugin's view can only say an error inside its own rect. The Mermaid plugin draws Mermaid's message
as a note there, and the note is clipped because the Resource keeps the size it Opened at. Unreadable
text, a failed fetch and a failed picture are said the same way by the other plugins.

A creation already has a way out: `CreationHost.report(words)` in
`packages/resource-api/src/view/index.tsx`, which the host shows as a notice. A drawn view has none.

## Proposal

- The view half of the Resource API lets a plugin declare an error for its Resource, in words the
  plugin worded, and withdraw it. It is a standing condition rather than an event: it lasts while the
  plugin declares it and clears when the source draws again, unlike a notice the next press clears.
- The host shows it as it shows any error, names the Resource by its short Title (UI-99), and offers a
  control that selects and reveals that Resource on the canvas.
- The host may also mark the Resource itself (on its outline or rail), so the error is found from the
  canvas as well as from the notice.
- The Mermaid plugin then declares a source it cannot draw, and keeps at most a short note in its rect.

## Open questions

- Where it is shown: the one notice area (UI-94), the StatusPanel, or a mark on the Resource alone.
  Many broken Resources on one Map must not flood the notice area.
- Whether it is shown while presenting on the Stage, where there is no Edit to fix it with.
- Whether a Closed Resource can have an error at all, since Mermaid draws nothing while Closed.
- How it is announced to a screen reader (once on appearing, not on every draw).
