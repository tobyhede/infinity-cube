import type { OutlinePoint, OutlineSize, ResourceShapeOutline } from './resource-shape-outline';

/**
 * A Shape's paper and edge, drawn in place of the Resource's own border
 * and fill, which `canvas-resource.css` withdraws for it.
 *
 * Drawn in the units of the rect the Resource is drawn at, so the drawing is
 * not stretched and the outline touches the midpoint of each of the rect's
 * sides, where the adapter's handles sit and Edges attach (ADR 0110, ADR
 * 0121). The stroke keeps the border's width however the drawing is scaled,
 * because `canvas-resource.css` gives it `vector-effect: non-scaling-stroke`.
 *
 * The geometry is drawn twice: first the selection ring, a wider stroke that
 * `canvas-resource.css` shows only while the Resource is selected or its Title
 * is being written, then the edge, whose fill covers the ring's inner half. So
 * the ring follows the outline.
 */
export function ResourceShapeOutlineDrawing({
  outline,
  size: { width, height },
}: {
  readonly outline: ResourceShapeOutline;
  readonly size: OutlineSize;
}) {
  return (
    <svg
      className="canvas-resource__outline"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {OUTLINE_LAYERS.map(({ className }) =>
        outline.kind === 'polygon' ? (
          <polygon key={className} className={className} points={points(outline.points)} />
        ) : (
          <rect
            key={className}
            className={className}
            width={width}
            height={height}
            rx={outline.rx}
            ry={outline.ry}
          />
        ),
      )}
    </svg>
  );
}

/** The outline's two layers, ring beneath edge, each drawn from the same geometry. */
const OUTLINE_LAYERS = [
  { className: 'canvas-resource__outline-ring' },
  { className: 'canvas-resource__outline-edge' },
] as const;

/** An outline polygon's vertices, as its `points` attribute spells them. */
const points = (vertices: readonly OutlinePoint[]): string =>
  vertices.map(({ x, y }) => `${x},${y}`).join(' ');
