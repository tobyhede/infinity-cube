import { COLLAPSED_RESOURCE_SIZE } from '@project/core';

/** A width and a height, in canvas units unless named otherwise. */
export interface Extent {
  readonly width: number;
  readonly height: number;
}

/** The screen pixels kept clear on each side of the visible canvas. */
const VIEW_MARGIN = 48;

/**
 * The most a plugin's size hint may grow a Resource to (ADR 0142): the visible
 * canvas at the current zoom, less a margin on each side, never below the
 * Closed Size.
 */
export function visibleCanvasCap(viewport: Extent, zoom: number): Extent {
  return {
    width: Math.max(COLLAPSED_RESOURCE_SIZE.width, (viewport.width - 2 * VIEW_MARGIN) / zoom),
    height: Math.max(COLLAPSED_RESOURCE_SIZE.height, (viewport.height - 2 * VIEW_MARGIN) / zoom),
  };
}
