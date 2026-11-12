import { imageKind, type ImageKindId } from '@project/core';
import type { KindCanvasDecoration } from '../canvas-resource-decoration';
import type { KindCreation } from '../kind-creation';
import type { ResourcePlacementCommands } from '../resource-placement';
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

export type ImageCreationContext = Pick<ResourcePlacementCommands, 'createImagesFromFiles'> & {
  /** Open the browser's file picker for images, within the press that asked for it. */
  readonly pickImages: () => Promise<readonly File[]>;
};

/**
 * Create Image Resource: the press opens the browser's file picker, and the
 * files chosen there are created at the visible centre; a cancelled picker
 * creates nothing (ADR 0106).
 */
export const imageCreation: KindCreation<ImageCreationContext> = {
  create: async ({ pickImages }, later) => {
    // Opened before any `await`: a browser opens a picker only within the press.
    const files = await pickImages();
    // Placed by the Dock as it stands when the picker answers, not as it was
    // pressed, and not at all once Create is withheld.
    later()?.createImagesFromFiles(files);
  },
};
