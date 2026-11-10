import { isMissingKind, type MissingKind, type ResourceId } from '@project/core';
import type { ResourceFlowNode, ResourceFlowNodeOf } from '@project/react-flow-adapter';
import type { PluginOperations } from '@project/ui';
import type {
  CanvasResourceDecorationContext,
  EveryField,
  KindDecorator,
} from '../canvas-resource-decoration';
import { applyKindDecoration } from '../canvas-resource-decoration';
import { pluginSurfaceOperations, type PluginHost } from '../plugin-host/plugin-commits';

export type DefaultResourceDecorationContext = Pick<
  CanvasResourceDecorationContext,
  'authorOnCanvas' | 'editableResourceIds'
> & {
  /** Where the surface's commits go and the gate that withdraws them (ADR 0142). */
  readonly pluginHost?: PluginHost | undefined;
};

/**
 * The surface of a Resource whose kind names no plugin in this build, which
 * the default plugin draws (ADR 0142): the Title's commit, withdrawn as every
 * surface's is, and nothing that authors its content, its Map content or its
 * assets, so the host carries the Resource as it was stored.
 */
export function defaultSurfaceOperations(
  kind: PluginOperations['kind'],
  resourceId: ResourceId,
  context: DefaultResourceDecorationContext,
): PluginOperations {
  const { epoch, claimed, onFailure, withdrawn, commitTitle } = pluginSurfaceOperations(
    kind,
    resourceId,
    {
      authorOnCanvas: context.authorOnCanvas,
      editable: context.editableResourceIds.has(resourceId),
    },
    context.pluginHost,
  );
  return { kind, epoch, claimed, onFailure, withdrawn, commitTitle };
}

/** Whether a node draws a Resource whose kind names no plugin in this build. */
const isDefaultNode = (node: ResourceFlowNode): node is ResourceFlowNodeOf<MissingKind> =>
  isMissingKind(node.data.kind);

const slice = ({
  authorOnCanvas,
  editableResourceIds,
  pluginHost,
}: DefaultResourceDecorationContext): EveryField<DefaultResourceDecorationContext> => ({
  authorOnCanvas,
  editableResourceIds,
  pluginHost,
});

/**
 * How the canvas decorates every Resource whose kind no plugin in this build
 * draws. It is no kind's module: the default plugin matches no kind, so it
 * decorates the nodes no registered kind's decoration takes.
 */
export const defaultDecorator: KindDecorator<DefaultResourceDecorationContext> = {
  bind: (context) => {
    const part = slice(context);
    return {
      read: Object.values(part),
      decorate: (node) =>
        isDefaultNode(node)
          ? applyKindDecoration(node, {
              kindOperations: defaultSurfaceOperations(node.data.kind, node.data.resourceId, part),
            })
          : undefined,
    };
  },
};
