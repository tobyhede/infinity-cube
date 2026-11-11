import { createContext, useContext, useMemo, useState } from 'react';
import { mapContentWithoutMap, titleName, type PluginKind } from '@project/core';
import type { Size } from '@project/resource-api/domain';
import type { OwnProps, TitleProps } from '@project/resource-api/view';
import {
  createRailStore,
  ResourceHostProvider,
  type ResourceHost,
} from '@project/resource-api/view/host';
import { NoEmbed, pluginEntryFor, type PluginEntry } from './kinds/plugin-views';
import { readingAssets, usePluginAssets } from './plugin-assets';
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
  readonly kind: PluginKind;
  /** The Resource's Title, whole; the Stage draws its name. */
  readonly title: string;
  /** The Resource's content as stored, which its plugin's schema parses. */
  readonly content: unknown;
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
export function PresentedPluginSurface(
  props: PresentedPluginResourceProps & { readonly entry: PluginEntry },
) {
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
    Embed: NoEmbed,
    onClaim: (claim) => claim.unmount(),
  });
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
          <ResourceHostProvider host={host}>{plugin}</ResourceHostProvider>
        </StageNameContext.Provider>
      </ResourceFailureBoundary>
    </article>
  );
}

/** The room an embedded plugin fills: all of the content area it is drawn in. */
const EMBEDDED_ROOM = {
  position: 'relative',
  flex: 1,
  width: '100%',
  height: '100%',
  minWidth: 0,
  minHeight: 0,
} as const;

export interface EmbeddedPluginContentProps {
  readonly kind: PluginKind;
  /** The Title the embedding passes, which the plugin is given as its name; the frame draws it. */
  readonly title: string;
  /** The embedded Resource's content, which its plugin's schema parses. */
  readonly content: unknown;
}

/** The embedded plugin's Title: the frame around it draws the Reference's own, so at most one draws. */
function NoTitle() {
  return null;
}

/**
 * Another Resource's plugin drawn inside the old frame's content area, as an
 * Open Reference Resource draws its Target (ADR 0070, ADR 0142): on a surface
 * offering no authoring of the Target, given the Reference's own Title as its
 * name, drawing no Title of its own, and filling the room it is given.
 */
export function EmbeddedPluginContent({ kind, title, content }: EmbeddedPluginContentProps) {
  const supplied = usePluginAssets();
  const assets = useMemo(() => readingAssets(supplied), [supplied]);
  const [drawing] = useState(() => Symbol('drawing'));
  const [host] = useState((): ResourceHost => ({
    Title: NoTitle,
    Own: StageOwn,
    rail: createRailStore(),
    RenderedMarkdown: HostRenderedMarkdown,
    SourceEditor: HostSourceEditor,
    // The frame around an embedded plugin keeps its own band clear.
    railBand: 0,
  }));
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
    Embed: NoEmbed,
    onClaim: (claim) => claim.unmount(),
  });
  return (
    <div className="resource-embedded-plugin" data-content-kind={kind} style={EMBEDDED_ROOM}>
      <ResourceFailureBoundary>
        <ResourceHostProvider host={host}>{plugin}</ResourceHostProvider>
      </ResourceFailureBoundary>
    </div>
  );
}
