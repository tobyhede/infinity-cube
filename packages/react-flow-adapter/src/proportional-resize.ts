export type ResizeSize = {
  readonly width: number;
  readonly height: number;
};

/**
 * The size a proportional Resize draws for the size React Flow proposes: the
 * start rect's width-to-height ratio, driven by whichever axis the pointer has
 * changed more relative to the start, so moving inward on one axis shrinks the
 * rect. Both dimensions are whole canvas units, and neither falls under its
 * floor; rounding and the floors can move the ratio by under one unit.
 */
export function proportionalSize(
  start: ResizeSize,
  proposed: ResizeSize,
  floor: ResizeSize,
): ResizeSize {
  const ratio = start.width / start.height;
  const widthChange = Math.abs(proposed.width - start.width) / start.width;
  const heightChange = Math.abs(proposed.height - start.height) / start.height;
  const driven = widthChange >= heightChange ? proposed.width : proposed.height * ratio;
  const width = Math.max(Math.round(driven), floor.width, Math.round(floor.height * ratio));
  return { width, height: Math.max(Math.round(width / ratio), floor.height) };
}
