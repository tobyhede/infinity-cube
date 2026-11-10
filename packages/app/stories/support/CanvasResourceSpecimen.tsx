import type { CSSProperties } from 'react';
import { isPluginKind, PLUGINS, type ResourceShape } from '@project/core';
import {
  CanvasResource,
  CLOSED_DISPLAY,
  PluginResource,
  type KindOperations,
  type CanvasResourceState,
} from '@project/ui';

interface CanvasResourceSpecimenCommonProps {
  readonly title: string;
  readonly state?: Exclude<CanvasResourceState, 'editing'>;
  readonly graphColor?: string;
  /** The Shape a Map records for an Ur Resource, which it is drawn in at any size. */
  readonly shape?: ResourceShape;
  /**
   * Draws the Resource Closed at this size, as a canvas adapter draws one
   * resized to it. Absent, it is the Closed Size.
   */
  readonly size?: { readonly width: number; readonly height: number };
  readonly kind?: KindOperations['kind'];
}

/** The two custom properties the stylesheet sizes a Resource from. */
export type ResourceFrameStyle = CSSProperties & {
  readonly '--resource-width': string;
  readonly '--resource-height': string;
};

type CanvasResourceSpecimenProps = CanvasResourceSpecimenCommonProps;

/**
 * Story fixture that composes the shipped visual primitive without redrawing it.
 *
 * Every kind the component declares is reachable from here, each at rest and
 * Closed: every Resource kind and the creation ghost, which is not a Resource
 * yet and carries neither content nor open state. A specimen may also be drawn
 * at a given size. None of them is handed an authoring callback, so
 * what a specimen draws is the Resource itself rather than the controls a canvas
 * would hang off it.
 */
export function CanvasResourceSpecimen({
  title,
  kind = 'markdown',
  state = 'rest',
  graphColor = '#ffc53d',
  shape: resourceShape = 'rectangle',
  size,
}: CanvasResourceSpecimenProps) {
  const kindOperations: KindOperations = { kind };
  if (isPluginKind(kind)) {
    // A fresh Resource of the kind, in the Shape asked for where its Map content takes one.
    const plugin = PLUGINS.find((entry) => entry.kind === kind);
    const askedMapContent = plugin?.mapContent.schema.safeParse({ shape: resourceShape });
    const drawn = (
      <PluginResource
        resourceId={`specimen-${kind}`}
        kind={kind}
        title={{ title, readOnly: true, onReturnFocus: () => undefined }}
        content={plugin?.newContent ?? {}}
        mapContent={
          askedMapContent?.success === true
            ? askedMapContent.data
            : (plugin?.mapContent.default ?? {})
        }
        outline={resourceShape}
        size={size}
        state={state}
        graphColor={graphColor}
        readOnly
        operations={{ kind }}
      />
    );
    if (size === undefined) return drawn;
    const pluginSized: ResourceFrameStyle = {
      '--resource-width': `${size.width}px`,
      '--resource-height': `${size.height}px`,
    };
    return <div style={pluginSized}>{drawn}</div>;
  }
  if (size === undefined) {
    return (
      <CanvasResource
        kindOperations={kindOperations}
        display={CLOSED_DISPLAY}
        title={title}
        state={state}
        graphColor={graphColor}
      />
    );
  }
  const sized: ResourceFrameStyle = {
    '--resource-width': `${size.width}px`,
    '--resource-height': `${size.height}px`,
  };
  return (
    <div style={sized}>
      <CanvasResource
        kindOperations={kindOperations}
        display={CLOSED_DISPLAY}
        title={title}
        state={state}
        graphColor={graphColor}
        size={size}
      />
    </div>
  );
}
