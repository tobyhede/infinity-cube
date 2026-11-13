import type { CSSProperties } from 'react';
import {
  mapContentProblem,
  newResourceDocument,
  resolvedMapContent,
  type ResourceShape,
} from '@project/core';
import { PluginResource, type CanvasResourceState } from '@project/ui';

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
  readonly kind?: string;
  /**
   * The content a Resource its plugin draws is given, for a kind whose plugin
   * starts no content of its own (a Reference Resource is made from its
   * Target). Absent, the plugin's new content.
   */
  readonly content?: unknown;
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
 * Every Resource kind is reachable from here, each at rest and drawn by its
 * plugin with its default Map content. A specimen may also be drawn at a
 * given size. None of them is handed an authoring callback, so
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
  content,
}: CanvasResourceSpecimenProps) {
  // A fresh Resource of the kind, in the Shape asked for where its Map content takes one.
  const askedMapContent = { shape: resourceShape };
  const drawn = (
    <PluginResource
      resourceId={`specimen-${kind}`}
      kind={kind}
      title={{ title, readOnly: true, onReturnFocus: () => undefined }}
      content={content ?? newResourceDocument(kind, title)?.content ?? {}}
      mapContent={
        mapContentProblem(kind, askedMapContent) === undefined
          ? askedMapContent
          : resolvedMapContent(kind, undefined)
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
  const sized: ResourceFrameStyle = {
    '--resource-width': `${size.width}px`,
    '--resource-height': `${size.height}px`,
  };
  return <div style={sized}>{drawn}</div>;
}
