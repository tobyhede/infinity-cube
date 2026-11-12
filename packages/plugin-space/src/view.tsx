import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Box, Check, Maximize2, Minimize2, Pencil } from 'lucide-react';
import { titleName, type Kept, type SpaceView } from '@project/resource-api/domain';
import {
  definePluginView,
  Rail,
  refusalOf,
  Title,
  useRailBand,
  type Claim,
  type PluginViewProps,
  type RailCommand,
} from '@project/resource-api/view';
import { selectView, spacePlugin, viewOf, type SpaceContent, type SpaceMapContent } from './domain';

/**
 * The Space plugin's view (ADR 0068, ADR 0142). Closed, it draws its Title and
 * its glyph and requests nothing. Open, it draws the Map it selects through the
 * host's Map embedding, with its Title below; the embedding draws the Map and
 * Graph chooser, the shown Space's own authoring and its links, and writes a
 * choice through `select`, this plugin's own content commit. Its rail is its
 * own: Open, Close, and Edit, which takes a Claim and passes it to the
 * embedding so the Map is authored in place until Done releases it.
 */

const FILL: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
};

/** The Space glyph's place on a Closed face: in the band, at its right. */
const GLYPH: CSSProperties = { position: 'absolute', top: 8, right: 8, lineHeight: 0 };

function SpacePluginView({ surface }: PluginViewProps<SpaceContent, SpaceMapContent>) {
  const name = titleName(surface.title.value);
  const open = surface.map.value.open;
  const commitMap = surface.map.commit;
  const commitContent = surface.content.commit;
  const takeClaim = surface.claim;
  const { Embed } = surface;
  const [held, setHeld] = useState<Claim | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const railBand = useRailBand();

  // The Claim is released whenever it stops being held: on Done, on Close, on
  // unmounting, and when Closed from outside, as by another author's Close,
  // since a Closed face draws no Done. The host completes the release.
  if (!open && held !== null) setHeld(null);
  useEffect(() => {
    if (held === null) return;
    return () => {
      held.release();
    };
  }, [held]);

  // Keyed by the values, not by the parsed content's identity, which the host
  // may mint afresh each render: what the embedding is asked for changes only
  // when the selection does.
  const selected = viewOf(surface.content.value);
  const { spaceId, graph, framing } = selected;
  const mapId = selected.map;
  const centreX = framing?.centreX;
  const centreY = framing?.centreY;
  const zoom = framing?.zoom;
  const view = useMemo(
    (): SpaceView => ({
      spaceId,
      map: mapId,
      graph,
      framing:
        centreX === undefined || centreY === undefined || zoom === undefined
          ? undefined
          : { centreX, centreY, zoom },
    }),
    [spaceId, mapId, graph, centreX, centreY, zoom],
  );
  // The embedding writes a choice through this plugin's own content commit, so
  // what withdraws the commit withdraws the choice (ADR 0142).
  const select = useMemo(
    (): Kept<SpaceView> | undefined =>
      commitContent === undefined
        ? undefined
        : { value: view, commit: (next) => commitContent(selectView(view, next)) },
    [commitContent, view],
  );

  const commands = useMemo((): readonly RailCommand[] => {
    const editing: RailCommand[] = !open
      ? []
      : held !== null
        ? [
            {
              kind: 'action',
              // Edit's own id: one control toggled, so the focus stays on it.
              id: 'edit',
              label: `Done Resource ${name}`,
              icon: <Check size={14} />,
              run: () => setHeld(null),
            },
          ]
        : takeClaim === undefined
          ? []
          : [
              {
                kind: 'action',
                id: 'edit',
                label: `Edit Resource ${name}`,
                icon: <Pencil size={14} />,
                run: () => {
                  const taken = takeClaim();
                  if (taken !== undefined) setHeld(taken);
                },
              },
            ];
    if (commitMap === undefined) return editing;
    const toggle = (next: SpaceMapContent) => {
      void commitMap(next).then((answer) => setRefusal(refusalOf(answer)));
    };
    // Open and Close are one command whose name swaps, so a keyboard author's
    // focus stays on it across both.
    return [
      ...editing,
      open
        ? {
            kind: 'action',
            id: 'open-close',
            label: `Close Resource ${name}`,
            icon: <Minimize2 size={14} />,
            run: () => {
              // A Closed face draws no Done, so Close ends the Edit first.
              setHeld(null);
              toggle({ open: false });
            },
          }
        : {
            kind: 'action',
            id: 'open-close',
            label: `Open Resource ${name}`,
            icon: <Maximize2 size={14} />,
            run: () => toggle({ open: true }),
          },
    ];
  }, [commitMap, open, name, held, takeClaim]);

  return (
    <div
      // Closed, the Title sits at the foot of the rect, as every Closed
      // Resource's does.
      style={open ? FILL : { ...FILL, justifyContent: 'flex-end' }}
      data-open={open}
    >
      {open ? (
        <>
          <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
            <Embed map={view} select={select} claim={held ?? undefined} />
          </div>
          <div style={{ padding: '4px 12px 8px' }} data-testid="space-resource-footer">
            <Title />
          </div>
        </>
      ) : (
        <>
          <div style={{ padding: `${railBand}px 12px 8px`, minHeight: 0 }}>
            <Title />
          </div>
          {/* What it is, in the band along the top, as every Closed Resource
              draws its kind glyph; an Open one draws none. */}
          <span role="img" aria-label={spacePlugin.name} style={GLYPH}>
            <Box size={14} aria-hidden />
          </span>
        </>
      )}
      {refusal !== null && (
        <p role="alert" style={{ margin: 0, padding: '0 12px', fontSize: 12 }}>
          {refusal}
        </p>
      )}
      <Rail commands={commands} />
    </div>
  );
}

/** The Space glyph. */
function SpaceGlyph({ size = 14 }: { readonly size?: number | undefined }) {
  return <Box size={size} />;
}

export const spacePluginView = definePluginView(spacePlugin, {
  View: SpacePluginView,
  Glyph: SpaceGlyph,
});
