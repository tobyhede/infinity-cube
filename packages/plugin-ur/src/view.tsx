import { useMemo, useState, type CSSProperties } from 'react';
import { Circle } from 'lucide-react';
import { OUTLINES, type Outline, type Size } from '@project/resource-api/domain';
import {
  definePluginView,
  Rail,
  Title,
  type PluginViewProps,
  type RailCommand,
} from '@project/resource-api/view';
import { urPlugin, type UrContent, type UrMapContent } from './domain';

/** What a person choosing a Shape reads for each one. */
const RESOURCE_SHAPE_LABELS = {
  rectangle: 'Rectangle',
  pill: 'Pill',
  ellipse: 'Ellipse',
  diamond: 'Diamond',
} as const satisfies Record<Outline, string>;

/** How far a quarter arc of radius 1 stands in from its corner at 45°. */
const ARC_INSET = 1 - Math.SQRT1_2;

/**
 * The rectangle inscribed in a Shape at `size`, as insets from the rect's
 * sides, which the Title is laid out in so it stays inside the outline the
 * canvas strokes.
 */
interface InscribedInsets {
  readonly inline: number;
  readonly block: number;
}

function inscribed(outline: Outline, { width, height }: Size): InscribedInsets {
  switch (outline) {
    case 'rectangle':
      return { inline: 0, block: 0 };
    case 'pill': {
      const inset = (Math.min(width, height) / 2) * ARC_INSET;
      return { inline: inset, block: inset };
    }
    case 'ellipse':
      return { inline: (width / 2) * ARC_INSET, block: (height / 2) * ARC_INSET };
    case 'diamond':
      return { inline: width / 4, block: height / 4 };
  }
}

/** A Shape's glyph, drawn in Lucide's 24-unit grid at its weight. Decorative. */
function ResourceShapeGlyph({ outline }: { readonly outline: Outline }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={14}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      data-resource-shape={outline}
    >
      {outline === 'diamond' ? (
        <polygon points="12,5 22,12 12,19 2,12" />
      ) : (
        <rect
          x={2}
          y={5}
          width={20}
          height={14}
          rx={outline === 'rectangle' ? 2 : outline === 'pill' ? 7 : 10}
          ry={outline === 'rectangle' ? 2 : 7}
        />
      )}
    </svg>
  );
}

const RESOURCE_SHAPE_CHOICES = OUTLINES.map((outline) => ({
  id: outline,
  label: RESOURCE_SHAPE_LABELS[outline],
  icon: <ResourceShapeGlyph outline={outline} />,
}));

const isOutline = (id: string): id is Outline => OUTLINES.some((outline) => outline === id);

/**
 * An Ur Resource: its Title, centred in the rectangle its Shape inscribes, and
 * the Shape chosen from its rail wherever the surface offers a Map content
 * commit. A refusal is shown in its rect as the host worded it.
 */
function UrView({ surface }: PluginViewProps<UrContent, UrMapContent>) {
  const outline = surface.map.value.shape;
  const commit = surface.map.commit;
  const [refusal, setRefusal] = useState<string | null>(null);
  const commands = useMemo((): readonly RailCommand[] => {
    if (commit === undefined) return [];
    return [
      {
        kind: 'choice',
        id: 'shape',
        label: 'Shape',
        choices: RESOURCE_SHAPE_CHOICES,
        chosen: outline,
        choose: (id) => {
          if (!isOutline(id)) return;
          void commit({ shape: id }).then((answer) =>
            setRefusal(answer === 'completed' || answer === 'unchanged' ? null : answer.refused),
          );
        },
      },
    ];
  }, [commit, outline]);
  const insets = inscribed(outline, surface.size);
  const style: CSSProperties = {
    position: 'absolute',
    inset: `${insets.block}px ${insets.inline}px`,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: outline === 'rectangle' ? '8px 12px' : 0,
    overflow: 'hidden',
    textAlign: 'center',
  };
  return (
    <div style={style} data-outline={outline}>
      <Title />
      {refusal !== null && (
        <p role="alert" style={{ margin: 0, fontSize: 12 }}>
          {refusal}
        </p>
      )}
      <Rail commands={commands} />
    </div>
  );
}

/** The Ur glyph. */
function UrGlyph({ size = 14 }: { readonly size?: number | undefined }) {
  return <Circle size={size} />;
}

export const urPluginView = definePluginView(urPlugin, { View: UrView, Glyph: UrGlyph });
