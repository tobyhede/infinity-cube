import { imageKind, type ImageKindId } from '@project/core';
import type { ResourceFlowNodeOf } from '@project/react-flow-adapter';
import type {
  CanvasResourceDecorationContext,
  KindCanvasDecoration,
  KindDecoration,
} from '../canvas-resource-decoration';
import type { KindCreation } from '../kind-creation';
import { pluginSurfaceOperations, type PluginHost } from '../plugin-host/plugin-commits';
import type { ResourcePlacementCommands } from '../resource-placement';

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
 * An Image Resource's plugin surface (ADR 0142): its Title and content commits,
 * the asset store and picker, and a Claim through which its Replace runs
 * exclusively, where the canvas authors it.
 */
export function decorateImageResourceNode(
  node: ResourceFlowNodeOf<ImageKindId>,
  context: ImageResourceDecorationContext,
): KindDecoration<ImageKindId> {
  return {
    kindOperations: pluginSurfaceOperations(
      imageKind.id,
      node.data.resourceId,
      {
        authorOnCanvas: context.authorOnCanvas,
        editable: context.editableResourceIds.has(node.data.resourceId),
      },
      context.pluginHost,
    ),
  };
}

/** The Image kind's canvas decoration, from its own part of the context. */
export const imageDecoration: KindCanvasDecoration<ImageKindId, ImageResourceDecorationContext> = {
  kind: imageKind.id,
  slice: ({ authorOnCanvas, editableResourceIds, pluginHost }) => ({
    authorOnCanvas,
    editableResourceIds,
    pluginHost,
  }),
  decorate: decorateImageResourceNode,
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
