import { referenceKind, type ReferenceKindId } from '@project/core';
import type { ResourceFlowNodeOf } from '@project/react-flow-adapter';
import type {
  CanvasResourceDecorationContext,
  KindCanvasDecoration,
  KindDecoration,
} from '../canvas-resource-decoration';
import { pluginSurfaceOperations, type PluginHost } from '../plugin-host/plugin-commits';

export type ReferenceResourceDecorationContext = Pick<
  CanvasResourceDecorationContext,
  'authorOnCanvas' | 'editableResourceIds'
> & {
  /**
   * Where the plugin's commits go and the gate that withdraws them (ADR 0142).
   * Absent where this canvas offers a plugin no commit.
   */
  readonly pluginHost?: PluginHost | undefined;
};

/**
 * A Reference Resource's plugin surface (ADR 0142): its Title and Map content
 * commits, where the canvas authors it. The surface it embeds its Target on
 * offers no authoring of the Target, whatever this one offers.
 */
export function decorateReferenceResourceNode(
  node: ResourceFlowNodeOf<ReferenceKindId>,
  context: ReferenceResourceDecorationContext,
): KindDecoration<ReferenceKindId> {
  return {
    kindOperations: pluginSurfaceOperations(
      referenceKind.id,
      node.data.resourceId,
      {
        authorOnCanvas: context.authorOnCanvas,
        editable: context.editableResourceIds.has(node.data.resourceId),
      },
      context.pluginHost,
    ),
  };
}

/** The Reference kind's canvas decoration, from its own part of the context. */
export const referenceDecoration: KindCanvasDecoration<
  ReferenceKindId,
  ReferenceResourceDecorationContext
> = {
  kind: referenceKind.id,
  slice: ({ authorOnCanvas, editableResourceIds, pluginHost }) => ({
    authorOnCanvas,
    editableResourceIds,
    pluginHost,
  }),
  decorate: decorateReferenceResourceNode,
};
