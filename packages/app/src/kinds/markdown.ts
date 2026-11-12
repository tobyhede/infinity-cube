import { markdownKind, type MarkdownKindId } from '@project/core';
import type { ResourceFlowNodeOf } from '@project/react-flow-adapter';
import type {
  CanvasResourceDecorationContext,
  KindCanvasDecoration,
  KindDecoration,
} from '../canvas-resource-decoration';
import type { KindCreation } from '../kind-creation';
import { pluginSurfaceOperations, type PluginHost } from '../plugin-host/plugin-commits';
import type { ResourcePlacementCommands } from '../resource-placement';

export type MarkdownResourceDecorationContext = Pick<
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
 * A Markdown Resource's plugin surface: its Title, content and Map content
 * commits and a Claim, where the canvas authors it. Open, Close and editing
 * are the plugin's own, so the canvas holds no editing state for one.
 */
export function decorateMarkdownResourceNode(
  node: ResourceFlowNodeOf<MarkdownKindId>,
  context: MarkdownResourceDecorationContext,
): KindDecoration<MarkdownKindId> {
  return {
    kindOperations: pluginSurfaceOperations(
      markdownKind.id,
      node.data.resourceId,
      {
        authorOnCanvas: context.authorOnCanvas,
        editable: context.editableResourceIds.has(node.data.resourceId),
      },
      context.pluginHost,
    ),
  };
}

/** The Markdown kind's canvas decoration, from its own part of the context. */
export const markdownDecoration: KindCanvasDecoration<
  MarkdownKindId,
  MarkdownResourceDecorationContext
> = {
  kind: markdownKind.id,
  slice: ({ authorOnCanvas, editableResourceIds, pluginHost }) => ({
    authorOnCanvas,
    editableResourceIds,
    pluginHost,
  }),
  decorate: decorateMarkdownResourceNode,
};

export type MarkdownCreationContext = Pick<ResourcePlacementCommands, 'createResource'>;

/** Create Markdown Resource: one press, the empty text, continuing in its Title. */
export const markdownCreation: KindCreation<MarkdownCreationContext> = {
  create: ({ createResource }) => createResource(markdownKind.id),
};
