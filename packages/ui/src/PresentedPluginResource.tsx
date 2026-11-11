import { createContext, useContext, useState } from 'react';
import { mapContentWithoutMap, titleName, type PluginKind } from '@project/core';
import type { Size } from '@project/resource-api/domain';
import {
  createRailStore,
  ResourceHostProvider,
  type OwnProps,
  type ResourceHost,
  type TitleProps,
} from '@project/resource-api/view';
import { NO_ASSETS, NoEmbed, pluginEntryFor } from './kinds/plugin-views';
import { ResourceFailureBoundary } from './ResourceFailureBoundary';

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
  const { kind, title } = props;
  const name = titleName(title);
  const [host] = useState((): ResourceHost => ({
    Title: StageTitle,
    Own: StageOwn,
    rail: createRailStore(),
  }));
  const [drawing] = useState(() => Symbol('drawing'));
  const plugin = pluginEntryFor(kind).render({
    resourceId: props.resourceId,
    kind,
    title,
    content: props.content,
    mapContent: mapContentWithoutMap(kind),
    size: STAGE_SIZE,
    selected: false,
    operations: { kind },
    drawing,
    assets: NO_ASSETS,
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
