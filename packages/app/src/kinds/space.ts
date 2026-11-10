import {
  spaceKind,
  type ResourceId,
  type SpaceKindId,
  type SpaceView,
  type UUID,
} from '@project/core';
import type { Answer } from '@project/resource-api/domain';
import type { ResourceFlowNodeOf } from '@project/react-flow-adapter';
import type { PluginOperations } from '@project/ui';
import { buildSpaceResourceRail } from '../build-space-resource-rail';
import type {
  CanvasResourceDecorationContext,
  KindCanvasDecoration,
  KindDecoration,
  Mutable,
} from '../canvas-resource-decoration';
import type { CommandOutcomes } from '../command-outcomes';
import type { Continuation } from '../continuation';
import type { DeleteConfirmation } from '../delete-confirmation';
import type { KindCreation } from '../kind-creation';
import { ownMapEmbed, type MapEmbedEntry } from '../map-embeddings';
import type { ResourcePlacementCommands } from '../resource-placement';
import type { OpenSpaces } from '../open-spaces';
import { pluginSurfaceOperations, type PluginHost } from '../plugin-host/plugin-commits';
import type { SpaceResourceRailContext } from '../space-resource-context-commands';
import type { SpaceResourceTargets } from '../space-resource-targets';

export type SpaceResourceDecorationContext = Pick<
  CanvasResourceDecorationContext,
  'authorOnCanvas' | 'editableResourceIds'
> & {
  /**
   * Where the plugin's commits go and the gate that withdraws them (ADR 0142).
   * Absent where this canvas offers a plugin no commit.
   */
  readonly pluginHost?: PluginHost | undefined;
  readonly continuation: Continuation;
  readonly containingSpaceId: UUID;
  readonly spaceSelections: ReadonlyMap<ResourceId, SpaceView>;
  readonly spaceResourceTargets: SpaceResourceTargets;
  readonly spaces: OpenSpaces | null;
  readonly commandOutcomes: CommandOutcomes | undefined;
  readonly deleteConfirmation: Pick<DeleteConfirmation, 'arm'> | undefined;
  /** The Map embeddings drawn on this canvas, by placement. */
  readonly mapEmbeds: ReadonlyMap<string, MapEmbedEntry>;
  readonly contextNotices: ReadonlyMap<ResourceId, string>;
  readonly onContextEditingChange: (resourceId: ResourceId, editing: boolean) => void;
  readonly onContextReport: (resourceId: ResourceId, message: string | null) => void;
};

/** What the Map embedding says while the Space it shows has not been read. */
export const READING_SPACE_NOTE = 'Reading the referenced Space…';

/** Whether a settled commit left nothing to say. */
const refusalOf = (answer: Answer): string | null =>
  answer === 'completed' || answer === 'unchanged' ? null : answer.refused;

/**
 * A Space Resource's plugin surface (ADR 0142): its Title, content and Map
 * content commits and its Claim, where the canvas authors it. While its plugin
 * embeds the Map it selects, the host-owned embedding's commands join its rail:
 * the Map and Graph chooser, the shown Space's own Map and Graph authoring and
 * its links. A choice is written through the request's `select`, the plugin's
 * own content commit, so whatever withdraws that commit withdraws the choice.
 */
export function decorateSpaceResourceNode(
  node: ResourceFlowNodeOf<SpaceKindId>,
  context: SpaceResourceDecorationContext,
): KindDecoration<SpaceKindId> {
  const resourceId = node.data.resourceId;
  const editable = context.editableResourceIds.has(resourceId);
  const kindOperations: Mutable<PluginOperations> = pluginSurfaceOperations(
    spaceKind.id,
    resourceId,
    { authorOnCanvas: context.authorOnCanvas, editable },
    context.pluginHost,
  );
  const decoration: Mutable<KindDecoration<SpaceKindId>> = { kindOperations };
  const embed = ownMapEmbed(context.mapEmbeds, resourceId);
  if (embed === undefined || node.data.readOnly || !node.data.authorsContent) return decoration;
  const selection = context.spaceSelections.get(resourceId);
  const target =
    selection === undefined ? undefined : context.spaceResourceTargets.get(selection.spaceId);
  if (selection === undefined || target === undefined) {
    kindOperations.mapNote = READING_SPACE_NOTE;
    return decoration;
  }
  let railContext: SpaceResourceRailContext | undefined;
  if (
    context.spaces !== null &&
    context.commandOutcomes !== undefined &&
    context.deleteConfirmation !== undefined
  ) {
    const entry = context.spaces.entry(selection.spaceId);
    if (entry !== undefined) {
      railContext = {
        entry,
        continuation: context.continuation,
        spaces: context.spaces,
        containingSpaceId: context.containingSpaceId,
        deleteConfirmation: entry.app.deleteConfirmation,
      };
    }
  }
  const { view, select } = embed.request;
  const commit = select?.commit;
  kindOperations.mapRail = buildSpaceResourceRail({
    target,
    selection,
    // Withdrawn authoring still draws the chooser, disabled.
    disabled: commit === undefined || !(editable && context.authorOnCanvas),
    complete: (targetMap, graphId) => {
      if (commit === undefined) return null;
      void commit({ ...view, map: targetMap.id, graph: graphId }).then((answer) =>
        context.onContextReport(resourceId, refusalOf(answer)),
      );
      return null;
    },
    onEditingChange: (editing) => context.onContextEditingChange(resourceId, editing),
    onReport: (message) => context.onContextReport(resourceId, message),
    context: railContext,
  });
  const notice = context.contextNotices.get(resourceId);
  if (notice !== undefined) decoration.contextNotice = notice;
  return decoration;
}

/** The Space kind's canvas decoration, from its own part of the context. */
export const spaceDecoration: KindCanvasDecoration<SpaceKindId, SpaceResourceDecorationContext> = {
  kind: spaceKind.id,
  slice: ({
    authorOnCanvas,
    editableResourceIds,
    pluginHost,
    continuation,
    containingSpaceId,
    spaceSelections,
    spaceResourceTargets,
    spaces,
    commandOutcomes,
    deleteConfirmation,
    mapEmbeds,
    contextNotices,
    onContextEditingChange,
    onContextReport,
  }) => ({
    authorOnCanvas,
    editableResourceIds,
    pluginHost,
    continuation,
    containingSpaceId,
    spaceSelections,
    spaceResourceTargets,
    spaces,
    commandOutcomes,
    deleteConfirmation,
    mapEmbeds,
    contextNotices,
    onContextEditingChange,
    onContextReport,
  }),
  decorate: decorateSpaceResourceNode,
};

export type SpaceCreationContext = Pick<
  ResourcePlacementCommands,
  'createSpaceResource' | 'creatingSpaceResource'
>;

/**
 * Create Space Resource: one press, one Resource, one new Space (ADR 0074).
 * Its coordinated Edit lands one await after the press, so it is withheld
 * for that window rather than swallowing a second press silently.
 */
export const spaceCreation: KindCreation<SpaceCreationContext> = {
  withheld: ({ creatingSpaceResource }) => creatingSpaceResource,
  create: ({ createSpaceResource }) => createSpaceResource(),
};
