import { imageKind, type ImageKindId } from '@project/core';
import type { KindCanvasDecoration } from '../canvas-resource-decoration';
import {
  pluginDecorationSlice,
  pluginResourceOperations,
  type PluginResourceDecorationContext,
} from './plugin-decoration';

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
