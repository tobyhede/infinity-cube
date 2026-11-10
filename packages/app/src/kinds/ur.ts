import { urKind, type UrKindId } from '@project/core';
import type { ResourceFlowNodeOf } from '@project/react-flow-adapter';
import type {
  CanvasResourceDecorationContext,
  KindCanvasDecoration,
  KindDecoration,
} from '../canvas-resource-decoration';
import type { KindCreation } from '../kind-creation';
import { pluginSurfaceOperations, type PluginHost } from '../plugin-host/plugin-commits';
import type { ResourcePlacementCommands } from '../resource-placement';

export type UrResourceDecorationContext = Pick<
  CanvasResourceDecorationContext,
  'authorOnCanvas' | 'editableResourceIds'
> & {
  /**
   * Where the plugin's commits go and the gate that withdraws them (ADR 0142).
   * Absent where this canvas offers a plugin no commit.
   */
  readonly pluginHost?: PluginHost | undefined;
};

/** An Ur Resource's plugin surface: its Map content commit and a Claim, where the canvas authors it. */
export function decorateUrResourceNode(
  node: ResourceFlowNodeOf<UrKindId>,
  context: UrResourceDecorationContext,
): KindDecoration<UrKindId> {
  return {
    kindOperations: pluginSurfaceOperations(
      urKind.id,
      node.data.resourceId,
      {
        authorOnCanvas: context.authorOnCanvas,
        editable: context.editableResourceIds.has(node.data.resourceId),
      },
      context.pluginHost,
    ),
  };
}

/** The Ur kind's canvas decoration, from its own part of the context. */
export const urDecoration: KindCanvasDecoration<UrKindId, UrResourceDecorationContext> = {
  kind: urKind.id,
  slice: ({ authorOnCanvas, editableResourceIds, pluginHost }) => ({
    authorOnCanvas,
    editableResourceIds,
    pluginHost,
  }),
  decorate: decorateUrResourceNode,
};

export type UrCreationContext = Pick<ResourcePlacementCommands, 'createResource'>;

/** Create Ur Resource: one press, a Title and nothing else, continuing in its Title (ADR 0113). */
export const urCreation: KindCreation<UrCreationContext> = {
  create: ({ createResource }) => createResource(urKind.id),
};
