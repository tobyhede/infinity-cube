/** The size a drawn diagram's SVG declares, and the most it is drawn wide. */
export interface DiagramExtent {
  readonly width: number;
  readonly height: number;
  readonly maxWidth: number;
}

const positive = (value: number): number | undefined =>
  Number.isFinite(value) && value > 0 ? value : undefined;

/** A length in pixels, as `120`, `120px` or `120.5`; a percentage or another unit is none. */
const pixels = (value: string | null | undefined): number | undefined => {
  const match = value?.trim().match(/^(\d+(?:\.\d+)?)(px)?$/);
  return match?.[1] === undefined ? undefined : positive(Number(match[1]));
};

/**
 * The size the SVG Mermaid answers declares, read from the string in a
 * document of its own, so nothing it holds joins the page: its `viewBox`, or
 * its `width` and `height` in pixels, and the most it is drawn wide, which is
 * its `max-width` in pixels, its `width` in pixels, or its own width. None
 * for an SVG that declares no size.
 */
export function diagramExtent(svg: string): DiagramExtent | undefined {
  const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
  if (root.localName !== 'svg') return undefined;
  const box = (root.getAttribute('viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const width = positive(box[2] ?? Number.NaN) ?? pixels(root.getAttribute('width'));
  const height = positive(box[3] ?? Number.NaN) ?? pixels(root.getAttribute('height'));
  if (width === undefined || height === undefined) return undefined;
  const maxWidth =
    pixels(root.getAttribute('style')?.match(/max-width:\s*([^;]+)/)?.[1]) ??
    pixels(root.getAttribute('width')) ??
    width;
  return { width, height, maxWidth };
}

/**
 * The height a diagram of `extent` is drawn at in a box `available` wide: as
 * wide as the box allows up to its most, at its own aspect.
 */
export function diagramHeightAt(extent: DiagramExtent, available: number): number {
  const drawnWidth = Math.min(available, extent.maxWidth);
  return (extent.height * drawnWidth) / extent.width;
}
