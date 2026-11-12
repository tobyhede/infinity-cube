import { createContext, useContext, useMemo, useState } from 'react';
import { mapContentWithoutMap, titleName, type ResourceKind, type Resource } from '@project/core';
import type { Size } from '@project/resource-api/domain';
import type { OwnProps, TitleProps } from '@project/resource-api/view';
import {
  createRailStore,
  ResourceHostProvider,
  type ResourceHost,
} from '@project/resource-api/view/host';
import { pluginEntryFor, type PluginSurfaceEntries } from './kinds/plugin-views';
import { readingAssets, usePluginAssets } from './plugin-assets';
import { EmbeddingProvider, HostEmbed, type Embedding } from './ResourceEmbedding';
import { ResourceFailureBoundary } from './ResourceFailureBoundary';
import { HostRenderedMarkdown, HostSourceEditor } from './ResourceTextHost';

/**
 * The Stage's host for a Resource a plugin draws (ADR 0142): the frame is the
 * plugin's rect, and it is given the value its Map content declaration's
 * `withoutMap` gives, or its default, since the Stage has no Map. It offers no
 * commit and no Claim, so nothing the plugin draws here can change the
 * Resource, and its rail is drawn nowhere.
 */

/** The frame's nominal size: the Stage's 16:9 frame, which the plugin's rect fills. */
const STAGE_SIZE: Size = { width: 1600, height: 900 };

/**
 * The name the Stage draws, read from context rather than closed over, so the
 * host hands the plugin one Title component for the drawing's lifetime.
 */
const StageNameContext = createContext('');

function StageTitle({ className }: TitleProps) {
  const name = useContext(StageNameContext);
  return <h2 className={['resource__title', className].filter(Boolean).join(' ')}>{name}</h2>;
}

function StageOwn({ children, className }: OwnProps) {
  return <div className={className}>{children}</div>;
}

export interface PresentedPluginResourceProps {
  readonly resourceId: string;
  readonly kind: ResourceKind;
  /** The Resource's Title, whole; the Stage draws its name. */
  readonly title: string;
  /** The Resource's content as stored, which its plugin's schema parses. */
  readonly content: unknown;
  /**
   * The Resources this one's content references, as they stand, which its
   * plugin may draw inside its frame through the embedding (ADR 0142).
   */
  readonly embeddable?: readonly Resource[] | undefined;
  /** Told what a plugin threw while drawing. */
  readonly onFailure?: ((error: Error) => void) | undefined;
  /** The Replacement epoch, which the drawing starts again on, as it does for another Resource. */
  readonly replacementEpoch?: number | undefined;
}

export function PresentedPluginResource(props: PresentedPluginResourceProps) {
  return <PresentedPluginSurface {...props} entry={pluginEntryFor(props.kind)} />;
}

/**
 * The Stage host around one plugin's entry, whichever plugin it is: what
 * `PresentedPluginResource` draws, and what a test draws a plugin of its own
 * through. The Stage authors nothing, so the plugin reads assets and stores none.
 */
export function PresentedPluginSurface(props: PresentedPluginResourceProps & PluginSurfaceEntries) {
  const { kind, title } = props;
  const supplied = usePluginAssets();
  const assets = useMemo(() => readingAssets(supplied), [supplied]);
  const name = titleName(title);
  const [host] = useState((): ResourceHost => ({
    Title: StageTitle,
    Own: StageOwn,
    rail: createRailStore(),
    RenderedMarkdown: HostRenderedMarkdown,
    SourceEditor: HostSourceEditor,
    // The Stage draws no rail.
    railBand: 0,
  }));
  const [drawing] = useState(() => Symbol('drawing'));
  const plugin = props.entry.render({
    resourceId: props.resourceId,
    kind,
    title,
    content: props.content,
    mapContent: mapContentWithoutMap(kind),
    size: STAGE_SIZE,
    selected: false,
    operations: { kind },
    drawing,
    assets,
    Embed: HostEmbed,
    onClaim: (claim) => claim.unmount(),
  });
  const { embeddable, onFailure } = props;
  const entryFor = props.entryFor ?? pluginEntryFor;
  const embedding: Embedding = useMemo(
    () => ({
      resources: embeddable ?? [],
      drawing: [props.resourceId],
      nested: false,
      host,
      // The Stage draws no rail, so no order among its commands.
      rail: host.rail,
      size: STAGE_SIZE,
      selected: false,
      onFailure,
      entryFor,
    }),
    [embeddable, props.resourceId, host, onFailure, entryFor],
  );
  return (
    <article
      className="resource resource--full resource--plugin"
      data-testid="resource-content"
      data-content-kind={kind}
    >
      <ResourceFailureBoundary
        // Keyed so traversing to another Resource of the same plugin, or a
        // replacement, draws afresh: no failure and no plugin state carry over.
        key={`${props.resourceId}:${String(props.replacementEpoch ?? 0)}`}
        onFailure={props.onFailure}
      >
        <StageNameContext.Provider value={name}>
          <EmbeddingProvider embedding={embedding}>
            <ResourceHostProvider host={host}>{plugin}</ResourceHostProvider>
          </EmbeddingProvider>
        </StageNameContext.Provider>
      </ResourceFailureBoundary>
    </article>
  );
}

/** The room the plugin fills: all of the space below the name. */
const CONTENT_ROOM = {
  position: 'relative',
  flex: 1,
  width: '100%',
  height: '100%',
  minWidth: 0,
  minHeight: 0,
} as const;

/** The plugin's Title: `PresentedResource` draws the name above it, so at most one draws. */
function NoTitle() {
  return null;
}

export interface PresentedPluginContentProps {
  readonly kind: ResourceKind;
  /** The name drawn above, which the plugin is given as its Title. */
  readonly title: string;
  /** The content, which the plugin's schema parses. */
  readonly content: unknown;
}

/**
 * A plugin kind's content drawn read-only below a name `PresentedResource`
 * draws, as the Notes window draws a presented note and a preview of each
 * move (ADR 0129, ADR 0142): no commit, no Claim, no rail drawn anywhere, and
 * nothing to embed.
 */
export function PresentedPluginContent({ kind, title, content }: PresentedPluginContentProps) {
  const supplied = usePluginAssets();
  const assets = useMemo(() => readingAssets(supplied), [supplied]);
  const [drawing] = useState(() => Symbol('drawing'));
  const [host] = useState((): ResourceHost => ({
    Title: NoTitle,
    Own: StageOwn,
    rail: createRailStore(),
    RenderedMarkdown: HostRenderedMarkdown,
    SourceEditor: HostSourceEditor,
    // `PresentedResource` draws no rail around this content.
    railBand: 0,
  }));
  const embedding: Embedding = useMemo(
    () => ({
      resources: [],
      drawing: [],
      nested: false,
      host,
      rail: host.rail,
      size: STAGE_SIZE,
      selected: false,
      entryFor: pluginEntryFor,
    }),
    [host],
  );
  const plugin = pluginEntryFor(kind).render({
    resourceId: '',
    drawing,
    kind,
    title,
    content,
    mapContent: mapContentWithoutMap(kind),
    size: STAGE_SIZE,
    selected: false,
    operations: { kind },
    assets,
    Embed: HostEmbed,
    onClaim: (claim) => claim.unmount(),
  });
  return (
    <div className="resource-presented-plugin" data-content-kind={kind} style={CONTENT_ROOM}>
      <ResourceFailureBoundary>
        <EmbeddingProvider embedding={embedding}>
          <ResourceHostProvider host={host}>{plugin}</ResourceHostProvider>
        </EmbeddingProvider>
      </ResourceFailureBoundary>
    </div>
  );
}
