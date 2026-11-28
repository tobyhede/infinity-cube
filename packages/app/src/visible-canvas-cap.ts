import type { ResourceSize } from '@project/core';

/** The screen pixels kept clear on each side of the visible canvas. */
const VIEW_MARGIN = 48;

/** Leave at least one screen pixel for the editor on a small canvas. */
function margin(axis: number): number {
  return Math.min(VIEW_MARGIN, Math.max(0, (axis - 1) / 2));
}

/** The available width and height in Map units. */
export function visibleCanvasCap(
  viewport: { readonly width: number; readonly height: number },
  zoom: number,
): ResourceSize {
  return {
    width: (viewport.width - 2 * margin(viewport.width)) / zoom,
    height: (viewport.height - 2 * margin(viewport.height)) / zoom,
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
  const horizontal = margin(area.width);
  const vertical = margin(area.height);
  return {
    x: shift(left, left + rect.width * viewport.zoom, horizontal, area.width - horizontal),
    y: shift(top, top + rect.height * viewport.zoom, vertical, area.height - vertical),
  };
}
