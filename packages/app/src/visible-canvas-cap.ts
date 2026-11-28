import { COLLAPSED_RESOURCE_SIZE, type ResourceSize } from '@project/core';

/** The screen pixels kept clear on each side of the visible canvas. */
const VIEW_MARGIN = 48;

/**
 * The most an in-place editor is drawn at: the visible canvas at the current
 * zoom, less a margin on each side (ADR 0178). Each axis is kept at least the
 * Closed Size, a floor ADR 0178 does not state; `visible-canvas-cap.test.ts`
 * holds it.
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

/** One axis of `leastPanToShow`: the start in view first, then as much of the end as fits. */
const shift = (start: number, end: number, low: number, high: number): number => {
  if (start < low) return low - start;
  if (end > high) return Math.max(high - end, low - start);
  return 0;
};

/**
 * How far the camera pans, in screen pixels, to show `rect` (in Map
 * coordinates) inside the visible canvas less the margin, by the least
 * distance (ADR 0178): nothing for a rect already in view, and the top-left
 * kept in view for one larger than the canvas. A pan is not an Edit.
 */
export function leastPanToShow(
  rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  viewport: { readonly x: number; readonly y: number; readonly zoom: number },
  area: { readonly width: number; readonly height: number },
) {
  const left = rect.x * viewport.zoom + viewport.x;
  const top = rect.y * viewport.zoom + viewport.y;
  return {
    x: shift(left, left + rect.width * viewport.zoom, VIEW_MARGIN, area.width - VIEW_MARGIN),
    y: shift(top, top + rect.height * viewport.zoom, VIEW_MARGIN, area.height - VIEW_MARGIN),
  };
}
