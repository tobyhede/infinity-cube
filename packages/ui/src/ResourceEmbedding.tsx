import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  isPluginKind,
  mapContentWithoutMap,
  mayBeTarget,
  titleName,
  type PluginKind,
  type Resource,
} from '@project/core';
import type { Answer, Kept, ResourceId, Size } from '@project/resource-api/domain';
import {
  ResourceHostProvider,
  type EmbedProps,
  type RailOutlet,
  type ResourceHost,
  type TitleProps,
} from '@project/resource-api/view';
import type { PluginEntry } from './kinds/plugin-views';
import { MapTitleContext, MapTitleView } from './MapTitle';
import { readingAssets, usePluginAssets } from './plugin-assets';
import { ResourceFailureBoundary } from './ResourceFailureBoundary';
import { createSurfaceLifetime } from './surface-lifetime';

/**
 * The host-owned Resource embedding (ADR 0142): `<surface.Embed resource
 * title />`, through which a plugin draws another Resource inside its own rect,
 * as an Open Reference Resource draws its Target (ADR 0070).
 *
 * The embedded Resource's plugin is mounted on a surface offering no authoring
 * of it: no content or Map content commit, no Claim, no store and no pick, and
 * the Map content it declares for a surface with no Map. Its Title is the one
 * the embedding passed, with the rename passed with it, so the embedded plugin
 * draws that Title as it draws any and at most one Title draws; a picture is
 * named by it. The embedded plugin's rail commands join the embedding
 * Resource's rail, after its own, which is where a picture's rename is offered.
 *
 * The embedding guards recursion and a deleted Target, drawing a short note in
 * the rect for each: a Resource is never drawn inside itself, nor is one whose
 * kind may not be a Target (ADR 0113), which keeps referencing to one hop, and
 * a Resource embedded inside an embedding embeds nothing further.
 *
 * `HostEmbed` is one component for every surface's lifetime, reading what it
 * draws from context. Do not make `Embed` a new component per render: React
 * would remount the embedded plugin on each render of the surface around it,
 * dropping its state. `PluginResource.test.tsx` holds that every surface a
 * plugin is handed carries the one `Embed`, and `resource-embedding.test.tsx`
 * that a plugin it embeds keeps its state across renders of the surface.
 */

/** What an embedding drawn inside one surface reads. */
export interface Embedding {
  /** The Resources the surface's own content references, as they stand: what it may embed. */
  readonly resources: readonly Resource[];
  /** The Resources already being drawn around this point, outermost first. */
  readonly drawing: readonly ResourceId[];
  /** Whether this point is inside an embedded Resource, which embeds nothing further. */
  readonly nested: boolean;
  /** The host of the surface the embedding is drawn in, whose own region it shares. */
  readonly host: ResourceHost;
  /** Where the embedded Resource's rail commands go: the surface's rail, after its own plugin's. */
  readonly rail: RailOutlet;
  /** The size the embedding draws into: the surface's. */
  readonly size: Size;
  readonly selected: boolean;
  /** Told what an embedded plugin threw while drawing. */
  readonly onFailure?: ((error: Error) => void) | undefined;
  /** The entry of the plugin that draws an embedded Resource of this kind. */
  readonly entryFor: (kind: PluginKind) => PluginEntry;
}

const EmbeddingContext = createContext<Embedding | null>(null);

/** Provide what the embedding inside a surface reads. */
export function EmbeddingProvider({
  embedding,
  children,
}: {
  readonly embedding: Embedding;
  readonly children?: ReactNode;
}) {
  return <EmbeddingContext.Provider value={embedding}>{children}</EmbeddingContext.Provider>;
}

/** Why the embedding draws nothing of the Resource asked for. */
const NOTES = {
  recursive: 'This Resource cannot be shown inside itself.',
  nested: 'A Resource shown inside another shows nothing further.',
  deleted: 'The Resource this shows was deleted.',
  untargetable: 'This Resource cannot be shown here.',
} as const;

function EmbeddingNote({ children }: { readonly children: string }) {
  return (
    <p role="note" className="resource-failure" data-testid="embedding-note">
      {children}
    </p>
  );
}

/** The room an embedded plugin fills: all of the rect it is drawn in. */
const EMBEDDED_ROOM = {
  position: 'relative',
  flex: 1,
  width: '100%',
  height: '100%',
  minWidth: 0,
  minHeight: 0,
} as const;

/** The embedding a surface hands its plugin. */
export function HostEmbed(props: EmbedProps) {
  const embedding = useContext(EmbeddingContext);
  // The Map embedding is the Space plugin's (resource-plugins issue 07).
  if (embedding === null || !('resource' in props)) return null;
  const { resource: id, title } = props;
  if (embedding.drawing.includes(id)) return <EmbeddingNote>{NOTES.recursive}</EmbeddingNote>;
  if (embedding.nested) return <EmbeddingNote>{NOTES.nested}</EmbeddingNote>;
  const target = embedding.resources.find((resource) => resource.id === id);
  if (target === undefined) return <EmbeddingNote>{NOTES.deleted}</EmbeddingNote>;
  if (!isPluginKind(target.kind) || !mayBeTarget(target.kind))
    return <EmbeddingNote>{NOTES.untargetable}</EmbeddingNote>;
  return (
    <EmbeddedSurface
      key={target.id}
      target={target}
      kind={target.kind}
      title={title}
      embedding={embedding}
    />
  );
}

/** The Title passed to an embedding, which its Title component draws. */
const EmbeddedTitleContext = createContext<Kept<string> | null>(null);

/**
 * The embedded plugin's Title: the one the embedding passed. On the Map it is
 * drawn as the Map draws the embedding Resource's own, with the Map's rename
 * where the passed Title carries a commit, since an embedding passes its own
 * Title (ADR 0142); with no Map, it is the name alone.
 */
function EmbeddedTitle({ className }: TitleProps) {
  const kept = useContext(EmbeddedTitleContext);
  const mapTitle = useContext(MapTitleContext);
  if (kept === null) return null;
  if (mapTitle !== null) {
    const drawn = {
      ...mapTitle,
      title: kept.value,
      readOnly: mapTitle.readOnly || kept.commit === undefined,
    };
    return (
      <MapTitleContext.Provider value={drawn}>
        <MapTitleView className={className ?? ''} />
      </MapTitleContext.Provider>
    );
  }
  return (
    <h2 className={['resource__title', className].filter(Boolean).join(' ')}>
      {titleName(kept.value)}
    </h2>
  );
}

/** Refused once the embedded surface is gone: what it kept is no longer drawn here. */
const EMBEDDING_GONE = {
  refused: 'This Resource is no longer drawn here.',
} as const satisfies Answer;

/**
 * `commit` as an embedded plugin keeps it: answered refused, without being
 * called, once `drawn` says the embedded surface is gone.
 */
export const commitWhileDrawn =
  (commit: (next: string) => Promise<Answer>, drawn: () => boolean) =>
  (next: string): Promise<Answer> =>
    drawn() ? commit(next) : Promise.resolve(EMBEDDING_GONE);

function EmbeddedSurface({
  target,
  kind,
  title,
  embedding,
}: {
  readonly target: Resource;
  readonly kind: PluginKind;
  readonly title: Kept<string>;
  readonly embedding: Embedding;
}) {
  const supplied = usePluginAssets();
  const assets = useMemo(() => readingAssets(supplied), [supplied]);
  // A commit the embedded plugin kept answers refused once this surface is
  // gone, whatever the surface around it still offers (ADR 0142); its drawing
  // is one of its own, as any surface's is.
  const [lifetime] = useState(createSurfaceLifetime);
  useEffect(() => {
    lifetime.begin();
    return lifetime.end;
  }, [lifetime]);
  const passed = title.commit;
  const commitTitle = useMemo(
    () => (passed === undefined ? undefined : commitWhileDrawn(passed, lifetime.drawn)),
    [passed, lifetime],
  );
  const kept = useMemo(
    (): Kept<string> => ({ value: title.value, commit: commitTitle }),
    [title.value, commitTitle],
  );
  const outer = embedding.host;
  const outerRail = embedding.rail;
  const host: ResourceHost = useMemo(
    () => ({ ...outer, Title: EmbeddedTitle, rail: outerRail }),
    [outer, outerRail],
  );
  const inner: Embedding = useMemo(
    () => ({
      ...embedding,
      nested: true,
      drawing: [...embedding.drawing, target.id],
    }),
    [embedding, target.id],
  );
  const entry = embedding.entryFor(kind);
  const mapTitle = useContext(MapTitleContext);
  const plugin = entry.render({
    resourceId: target.id,
    drawing: lifetime.drawing,
    kind,
    title: title.value,
    content: target.content,
    mapContent: mapContentWithoutMap(kind),
    size: embedding.size,
    selected: embedding.selected,
    operations: { kind, commitTitle },
    assets,
    Embed: HostEmbed,
    onClaim: lifetime.hold,
  });
  return (
    <div className="resource-embedded-plugin" data-content-kind={kind} style={EMBEDDED_ROOM}>
      <ResourceFailureBoundary
        // A failed drawing of the Target is tried again once its content
        // changes, as the surface around it is on its own Map content.
        retryOn={JSON.stringify(target.content)}
        onFailure={embedding.onFailure}
      >
        <EmbeddedTitleContext.Provider value={kept}>
          <EmbeddingProvider embedding={inner}>
            <ResourceHostProvider host={host}>{plugin}</ResourceHostProvider>
          </EmbeddingProvider>
          {/* A plugin that draws no Title is renamed in the Map's editor, drawn over it. */}
          {!entry.drawsTitle &&
            mapTitle?.editor !== undefined &&
            !mapTitle.readOnly &&
            kept.commit !== undefined && (
              <div className="canvas-resource__title-over">
                <EmbeddedTitle />
              </div>
            )}
        </EmbeddedTitleContext.Provider>
      </ResourceFailureBoundary>
    </div>
  );
}
