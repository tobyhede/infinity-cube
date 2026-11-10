import { useMemo } from 'react';
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
}

export function PresentedPluginResource(props: PresentedPluginResourceProps) {
  const { kind, title } = props;
  const name = titleName(title);
  const host: ResourceHost = useMemo(() => {
    function StageTitle({ className }: TitleProps) {
      return <h2 className={['resource__title', className].filter(Boolean).join(' ')}>{name}</h2>;
    }
    return { Title: StageTitle, Own: StageOwn, rail: createRailStore() };
  }, [name]);
  const plugin = pluginEntryFor(kind).render({
    resourceId: props.resourceId,
    kind,
    title,
    content: props.content,
    mapContent: mapContentWithoutMap(kind),
    size: STAGE_SIZE,
    selected: false,
    operations: { kind },
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
      <ResourceFailureBoundary onFailure={props.onFailure}>
        <ResourceHostProvider host={host}>{plugin}</ResourceHostProvider>
      </ResourceFailureBoundary>
    </article>
  );
}
