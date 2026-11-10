import { imageKind, type ImageKindId } from '@project/core';
import type { ResourceFlowNodeOf } from '@project/react-flow-adapter';
import type {
  CanvasResourceDecorationContext,
  KindCanvasDecoration,
  KindDecoration,
} from '../canvas-resource-decoration';
import { pluginSurfaceOperations, type PluginHost } from '../plugin-host/plugin-commits';

export type ImageResourceDecorationContext = Pick<
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
 * The Image kind's canvas decoration: its plugin surface (ADR 0142), whose
 * Title and content commits, asset store, picker and Claim carry Rename and a
 * Replace run exclusively, where the canvas authors it.
 */
export const imageDecoration: KindCanvasDecoration<ImageKindId, PluginResourceDecorationContext> = {
  kind: imageKind.id,
  slice: pluginDecorationSlice,
  decorate: (node, context) => ({
    kindOperations: pluginResourceOperations(imageKind.id, node.data.resourceId, context),
  }),
};
