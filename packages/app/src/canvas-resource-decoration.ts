import { isMissingKind, type ResourceId } from '@project/core';
import type { ResourceFlowNode, ResourceNodeData } from '@project/react-flow-adapter';
import type { EntityActionGroup, PluginOperations } from '@project/ui';
import { pluginSurfaceOperations, type PluginHost } from './plugin-host/plugin-commits';
import type { ResourceResize } from './render-adapter';
import { RESOURCE_SIZE } from './resource';

/** A value built by assigning what a gate allows. */
export type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** What the shared decoration adds to a Resource of any kind. */
export type CanvasResourceDataPatch = Partial<
  Pick<ResourceNodeData, 'onBeginTitleEditing' | 'resize' | 'titleEditor' | 'entityActions'>
>;

/**
 * Completions and canvas facts the decoration reads. The hook owns caret,
 * session subscription, and the completion functions passed in here.
 */
export interface CanvasResourceDecorationContext {
  readonly authorOnCanvas: boolean;
  readonly bodyEditing: boolean;
  readonly editableResourceIds: ReadonlySet<string>;
  readonly beginTitleEditing: (resourceId: string) => void;
  readonly onSelectResource: (resourceId: ResourceId) => void;
  readonly resourceResize: ResourceResize;
  readonly editingTitleResourceId: string | null;
  readonly completeResourceTitle: (resourceId: string, title: string) => string | null;
  readonly clearCaret: () => void;
  readonly resourceEntityActions?:
    ((resourceId: ResourceId) => readonly EntityActionGroup[]) | undefined;
}

export function applyResourceDataPatch(
  node: ResourceFlowNode,
  patch: CanvasResourceDataPatch,
): ResourceFlowNode {
  if (Object.keys(patch).length === 0) return node;
  return { ...node, data: { ...node.data, ...patch } };
}

/** What the plugin surface decoration reads, the same for every Resource whatever its kind. */
export type PluginSurfaceDecorationContext = Pick<
  CanvasResourceDecorationContext,
  'authorOnCanvas' | 'editableResourceIds'
> & {
  /**
   * Whether this drawing may offer a Claim to a Resource whose content embeds
   * a Map: the Map surface policy's answer, which withholds it on every
   * drawing but the canvas's own Map, so authoring stops at the depth
   * `mapSurfacePolicy` allows.
   */
  readonly embeddedMapEdit: boolean;
  /**
   * Where the plugin's commits go and the gate that withdraws them (ADR 0142).
   * Absent where this canvas offers a plugin no commit.
   */
  readonly pluginHost?: PluginHost | undefined;
};

/**
 * What a Resource's plugin is offered on this canvas (ADR 0142), the same rule
 * for every Resource and no kind's: its Title, content and Map content
 * commits, the asset store and picker, and a Claim, where the canvas authors
 * it. A Resource whose content embeds a Map is offered no Claim below the
 * canvas's own Map, which keeps authoring to the depth the surface policy
 * allows. A Resource whose kind names no plugin in this build, which the
 * default plugin draws, is offered its Title's commit alone, so the host
 * carries it as it was stored.
 */
export function pluginOperationsFor(
  node: ResourceFlowNode,
  context: PluginSurfaceDecorationContext,
): PluginOperations {
  const { kind, resourceId } = node.data;
  const offered: Mutable<PluginOperations> = pluginSurfaceOperations(
    kind,
    resourceId,
    {
      authorOnCanvas: context.authorOnCanvas,
      editable: context.editableResourceIds.has(resourceId),
    },
    context.pluginHost,
  );
  if (isMissingKind(kind)) {
    const { epoch, claimHolder, onFailure, withdrawn, commitTitle } = offered;
    return { kind, epoch, claimHolder, onFailure, withdrawn, commitTitle };
  }
  if (node.data.embedsMap && !context.embeddedMapEdit) delete offered.claim;
  return offered;
}

/**
 * `node` with what its plugin is offered. A node offered nothing beyond its
 * bare kind, as the projection already carries it, is left as it is, so a
 * Resource whose operations did not change keeps its identity.
 */
export function decoratePluginSurface(
  node: ResourceFlowNode,
  context: PluginSurfaceDecorationContext,
): ResourceFlowNode {
  const kindOperations = pluginOperationsFor(node, context);
  if (Object.keys(kindOperations).length === 1) return node;
  return { ...node, data: { ...node.data, kindOperations } };
}

type SharedResourceDecorationContext = Pick<
  CanvasResourceDecorationContext,
  | 'authorOnCanvas'
  | 'bodyEditing'
  | 'editableResourceIds'
  | 'beginTitleEditing'
  | 'onSelectResource'
  | 'resourceResize'
  | 'editingTitleResourceId'
  | 'completeResourceTitle'
  | 'clearCaret'
  | 'resourceEntityActions'
>;

export function decorateSharedResourceNode(
  node: ResourceFlowNode,
  context: SharedResourceDecorationContext,
): CanvasResourceDataPatch {
  const resourceBelongsToWorkingSpace = context.editableResourceIds.has(node.data.resourceId);
  const patch: Mutable<
    Pick<ResourceNodeData, 'onBeginTitleEditing' | 'resize' | 'titleEditor' | 'entityActions'>
  > = {};
  if (resourceBelongsToWorkingSpace && context.authorOnCanvas && !context.bodyEditing) {
    patch.onBeginTitleEditing = () => context.beginTitleEditing(node.id);
  }
  if (resourceBelongsToWorkingSpace && context.authorOnCanvas) {
    // Every kind resizes (ADR 0122); `ResourceNode` draws the
    // control only while the Resource is selected. The Closed Size is the one
    // floor, and the control's own minimum keeps a proposal at or above it.
    patch.resize = {
      minWidth: RESOURCE_SIZE.width,
      minHeight: RESOURCE_SIZE.height,
      onResizeStart: () => {
        context.onSelectResource(node.data.resourceId);
        context.resourceResize.beginResize(node.data.resourceId);
      },
      onResize: (size) => {
        context.resourceResize.previewResize(node.data.resourceId, {
          width: Math.max(RESOURCE_SIZE.width, size.width),
          height: Math.max(RESOURCE_SIZE.height, size.height),
        });
      },
      onResizeEnd: () => context.resourceResize.finishResize(node.data.resourceId),
      onResizeCancel: () => context.resourceResize.cancelResize(node.data.resourceId),
    };
  }
  if (
    resourceBelongsToWorkingSpace &&
    context.authorOnCanvas &&
    node.id === context.editingTitleResourceId
  ) {
    patch.titleEditor = {
      onComplete: (title) => {
        const error = context.completeResourceTitle(node.id, title);
        if (error === null) context.clearCaret();
        return error;
      },
      onCancel: () => context.clearCaret(),
    };
  }
  if (context.resourceEntityActions !== undefined && resourceBelongsToWorkingSpace) {
    // The same gate every other control on the rail takes: these commands are
    // drawn in that rail, so a canvas that has withdrawn authoring would
    // otherwise reinstate the one cluster that survived it. Withdrawn is `[]`,
    // never `undefined`: `PluginResource` keeps its `EntityActions` wrapper
    // mounted for any defined list, so withdrawing authoring does not remount
    // the Resource. `[]` is held by `canvas-resource-decoration.test.ts` ('asks
    // for entity actions only where authoring is on…'), and the plugin kept
    // mounted by `packages/ui/test/PluginResource.test.tsx` ('keeps a drawing
    // plugin and its state mounted when its Actions are withdrawn…').
    patch.entityActions = context.authorOnCanvas
      ? context.resourceEntityActions(node.data.resourceId)
      : [];
  }
  return patch;
}
