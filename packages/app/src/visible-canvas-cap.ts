import { COLLAPSED_RESOURCE_SIZE, type ResourceSize } from '@project/core';

/** The screen pixels kept clear on each side of the visible canvas. */
const VIEW_MARGIN = 48;

/**
 * The most a plugin's size hint may grow a Resource to (ADR 0142): the visible
 * canvas at the current zoom, less a margin on each side, never below the
 * Closed Size.
 */
export function visibleCanvasCap(
  viewport: { readonly width: number; readonly height: number },
  zoom: number,
): ResourceSize {
  return {
    width: Math.max(COLLAPSED_RESOURCE_SIZE.width, (viewport.width - 2 * VIEW_MARGIN) / zoom),
    height: Math.max(COLLAPSED_RESOURCE_SIZE.height, (viewport.height - 2 * VIEW_MARGIN) / zoom),
  };
}

/**
 * A plugin's size hint capped at `cap` (ADR 0142). Each side is capped, and
 * a hint the cap narrows keeps its area as far as the cap's height allows:
 * the hint measured text at its own width, and that text reflowed at a
 * narrower width needs about as much more height as the width it lost.
 */
export function capSizeHint(
  hint: { readonly width: number; readonly height: number },
  cap: { readonly width: number; readonly height: number },
): ResourceSize {
  const width = Math.min(hint.width, cap.width);
  const height = width < hint.width ? Math.ceil((hint.height * hint.width) / width) : hint.height;
  return { width, height: Math.min(height, cap.height) };
}
