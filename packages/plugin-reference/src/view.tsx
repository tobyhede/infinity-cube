import { useMemo, useState, type CSSProperties } from 'react';
import { Link, Maximize2, Minimize2 } from 'lucide-react';
import { titleName, type Answer } from '@project/resource-api/domain';
import {
  definePluginView,
  Rail,
  Title,
  type PluginViewProps,
  type RailCommand,
} from '@project/resource-api/view';
import { referencePlugin, type ReferenceContent, type ReferenceMapContent } from './domain';

/**
 * The Reference plugin's view (ADR 0070, ADR 0142). Closed, it draws its own
 * Title. Open, it embeds its Target through the host's embedding, which offers
 * no authoring of the Target, and passes its own Title and rename, so the
 * Target's plugin draws that Title as it draws any and at most one Title
 * draws: a Reference to an Image is a picture named by the Reference. Open and
 * Close are its rail commands, where the surface offers a Map content commit.
 */

const FILL: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
};

/**
 * The band along the top of the rect the canvas keeps clear of controls, as it
 * does for every Resource it draws: eight pixels, the kind glyph's row, eight
 * pixels. A press there selects the Resource rather than beginning a rename.
 */
const RAIL_BAND = 30;

/** The Reference glyph's place on a Closed face: in the band, at its right. */
const GLYPH: CSSProperties = { position: 'absolute', top: 8, right: 8, lineHeight: 0 };

/** Whether a settled commit left nothing to say. */
const refusalOf = (answer: Answer): string | null =>
  answer === 'completed' || answer === 'unchanged' ? null : answer.refused;

function ReferenceView({ surface }: PluginViewProps<ReferenceContent, ReferenceMapContent>) {
  const name = titleName(surface.title.value);
  const open = surface.map.value.open;
  const commit = surface.map.commit;
  const { Embed } = surface;
  const [refusal, setRefusal] = useState<string | null>(null);

  const commands = useMemo((): readonly RailCommand[] => {
    if (commit === undefined) return [];
    const toggle = (next: ReferenceMapContent) => {
      void commit(next).then((answer) => setRefusal(refusalOf(answer)));
    };
    // Open and Close are one command whose name swaps, so a keyboard author's
    // focus stays on it across both.
    return [
      open
        ? {
            kind: 'action',
            id: 'open-close',
            label: `Close Resource ${name}`,
            icon: <Minimize2 size={14} />,
            run: () => toggle({ open: false }),
          }
        : {
            kind: 'action',
            id: 'open-close',
            label: `Open Resource ${name}`,
            icon: <Maximize2 size={14} />,
            run: () => toggle({ open: true }),
          },
    ];
  }, [commit, open, name]);

  return (
    <div
      // Closed, the Title sits at the foot of the rect, as every Closed
      // Resource's does.
      style={open ? FILL : { ...FILL, justifyContent: 'flex-end' }}
      data-open={open}
    >
      {open ? (
        <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
          <Embed resource={surface.content.value.target} title={surface.title} />
        </div>
      ) : (
        <div style={{ padding: `${RAIL_BAND}px 12px 8px`, minHeight: 0 }}>
          <Title />
        </div>
      )}
      {!open && (
        // What it is, in the band along the top, as every Closed Resource draws
        // its kind glyph; an Open one draws none.
        <span role="img" aria-label={referencePlugin.name} style={GLYPH}>
          <Link size={14} aria-hidden />
        </span>
      )}
      {refusal !== null && (
        <p role="status" style={{ margin: 0, padding: '0 12px', fontSize: 12 }}>
          {refusal}
        </p>
      )}
      <Rail commands={commands} />
    </div>
  );
}

/** The Reference glyph. */
function ReferenceGlyph({ size = 14 }: { readonly size?: number | undefined }) {
  return <Link size={size} />;
}

export const referencePluginView = definePluginView(referencePlugin, {
  View: ReferenceView,
  Glyph: ReferenceGlyph,
});
