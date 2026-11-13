import { urKind, type UrKindId } from '@project/core';
import type { KindCanvasDecoration } from '../canvas-resource-decoration';
import {
  pluginDecorationSlice,
  pluginResourceOperations,
  type PluginResourceDecorationContext,
} from './plugin-decoration';

/** The Ur kind's canvas decoration: its plugin surface's Map content commit and a Claim, where the canvas authors it. */
export const urDecoration: KindCanvasDecoration<UrKindId, PluginResourceDecorationContext> = {
  kind: urKind.id,
  slice: pluginDecorationSlice,
  decorate: (node, context) => ({
    kindOperations: pluginResourceOperations(urKind.id, node.data.resourceId, context),
  }),
};
