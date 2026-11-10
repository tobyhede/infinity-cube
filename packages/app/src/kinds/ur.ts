import { urKind, type UrKindId } from '@project/core';
import type { ResourceFlowNodeOf } from '@project/react-flow-adapter';
import type {
  CanvasResourceDecorationContext,
  KindCanvasDecoration,
  KindDecoration,
} from '../canvas-resource-decoration';
import { pluginSurfaceOperations, type PluginHost } from '../plugin-host/plugin-commits';

/** The Ur kind's canvas decoration: its plugin surface's Map content commit and a Claim, where the canvas authors it. */
export const urDecoration: KindCanvasDecoration<UrKindId, PluginResourceDecorationContext> = {
  kind: urKind.id,
  slice: pluginDecorationSlice,
  decorate: (node, context) => ({
    kindOperations: pluginResourceOperations(urKind.id, node.data.resourceId, context),
  }),
};
