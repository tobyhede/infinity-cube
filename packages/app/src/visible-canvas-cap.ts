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
