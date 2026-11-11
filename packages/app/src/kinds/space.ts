import { spaceKind, type SpaceKindId } from '@project/core';
import type { ResourceFlowNodeOf } from '@project/react-flow-adapter';
import type { PluginOperations } from '@project/ui';
import type {
  CanvasResourceDecorationContext,
  KindCanvasDecoration,
  KindDecoration,
  Mutable,
} from '../canvas-resource-decoration';
import { pluginSurfaceOperations, type PluginHost } from '../plugin-host/plugin-commits';

export type SpaceResourceDecorationContext = Pick<
  CanvasResourceDecorationContext,
  'authorOnCanvas' | 'editableResourceIds'
> & {
  /**
   * Whether this drawing may offer a Space Resource its Edit: the Map surface
   * policy's answer, which withholds it on every drawing but the canvas's own
   * Map, so authoring stops at the depth `mapSurfacePolicy` allows.
   */
  readonly embeddedMapEdit: boolean;
  /**
   * Where the plugin's commits go and the gate that withdraws them (ADR 0142).
   * Absent where this canvas offers a plugin no commit.
   */
  readonly pluginHost?: PluginHost | undefined;
};

/**
 * A Space Resource's plugin surface (ADR 0142): its Title, content and Map
 * content commits and its Claim, where the canvas authors it. The commands of
 * the Space it embeds are the embedding's, which `embed-commands.ts` offers
 * from what the plugin passes `Embed` (`embed-commands.test.tsx`).
 */
export function decorateSpaceResourceNode(
  node: ResourceFlowNodeOf<SpaceKindId>,
  context: SpaceResourceDecorationContext,
): KindDecoration<SpaceKindId> {
  const resourceId = node.data.resourceId;
  const kindOperations: Mutable<PluginOperations> = pluginSurfaceOperations(
    spaceKind.id,
    resourceId,
    {
      authorOnCanvas: context.authorOnCanvas,
      editable: context.editableResourceIds.has(resourceId),
    },
    context.pluginHost,
  );
  if (!context.embeddedMapEdit) delete kindOperations.claim;
  return { kindOperations };
}

/** The Space kind's canvas decoration, from its own part of the context. */
export const spaceDecoration: KindCanvasDecoration<SpaceKindId, SpaceResourceDecorationContext> = {
  kind: spaceKind.id,
  slice: ({ authorOnCanvas, embeddedMapEdit, editableResourceIds, pluginHost }) => ({
    authorOnCanvas,
    embeddedMapEdit,
    editableResourceIds,
    pluginHost,
  }),
  decorate: decorateSpaceResourceNode,
};
