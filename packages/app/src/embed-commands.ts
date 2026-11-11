import { uuidSchema, type ResourceId, type UUID } from '@project/core';
import type { Answer } from '@project/resource-api/domain';
import type { ResourceFlowNode } from '@project/react-flow-adapter';
import { buildSpaceResourceRail } from './build-space-resource-rail';
import type { CommandOutcomes } from './command-outcomes';
import type { Continuation } from './continuation';
import type { DeleteConfirmation } from './delete-confirmation';
import { resolveEmbedView } from './embed-view';
import { ownMapEmbed, type MapEmbedEntry } from './map-embeddings';
import type { OpenSpaces } from './open-spaces';
import type { SpaceResourceRailContext } from './space-resource-context-commands';
import type { SpaceResourceTargets } from './space-resource-targets';

/** What the Map embedding says while the Space it shows has not been read. */
export const READING_SPACE_NOTE = 'Reading the referenced Space…';

/** What the host reads to offer a Space embedding's commands on the canvas. */
export interface EmbedCommandsContext {
  readonly authorOnCanvas: boolean;
  readonly editableResourceIds: ReadonlySet<string>;
  readonly continuation: Continuation;
  readonly containingSpaceId: UUID;
  readonly spaceResourceTargets: SpaceResourceTargets;
  readonly spaces: OpenSpaces | null;
  readonly commandOutcomes: CommandOutcomes | undefined;
  readonly deleteConfirmation: Pick<DeleteConfirmation, 'arm'> | undefined;
  /** The Map embeddings drawn on this canvas, by placement. */
  readonly mapEmbeds: ReadonlyMap<string, MapEmbedEntry>;
  readonly contextNotices: ReadonlyMap<ResourceId, string>;
  readonly onContextEditingChange: (resourceId: ResourceId, editing: boolean) => void;
  readonly onContextReport: (resourceId: ResourceId, message: string | null) => void;
}

/** What a settled commit was refused with, or `null` where it was not. */
const refusalOf = (answer: Answer): string | null =>
  answer === 'completed' || answer === 'unchanged' ? null : answer.refused;

/**
 * `node` with the commands of the Space it embeds, whatever its kind (ADR 0142):
 * each read from what its plugin passed `Embed`, never from the kind. The Map
 * and Graph chooser is offered only where the plugin passed a commit for the
 * view, and writes only through it, so whatever withdraws the commit withdraws
 * the choice. Authoring the shown Space, its Maps and Graphs included, is
 * offered on the chooser's lists only while the plugin also passes a Claim. A
 * Resource that embeds no Space, or passed no commit, is left as it is.
 */
export function decorateEmbedCommands(
  node: ResourceFlowNode,
  context: EmbedCommandsContext,
): ResourceFlowNode {
  if (node.data.readOnly) return node;
  const resourceId = node.data.resourceId;
  const embed = ownMapEmbed(context.mapEmbeds, resourceId);
  if (embed === undefined) return node;
  const { space, view, select, claim } = embed.request;
  const commit = select?.commit;
  // No commit, no chooser; and the shown Space's authoring is drawn on the
  // chooser's lists, so a Claim offers it only beside one.
  if (commit === undefined) return node;
  const spaceId = uuidSchema.safeParse(space);
  const target = spaceId.success ? context.spaceResourceTargets.get(spaceId.data) : undefined;
  const selection = resolveEmbedView(space, view, target);
  if (target === undefined || selection === undefined) {
    return withEmbedCommands(node, { mapNote: READING_SPACE_NOTE });
  }
  const entry = claim === undefined ? undefined : context.spaces?.entry(target.id);
  const railContext: SpaceResourceRailContext | undefined =
    entry === undefined ||
    context.spaces === null ||
    context.commandOutcomes === undefined ||
    context.deleteConfirmation === undefined
      ? undefined
      : {
          entry,
          continuation: context.continuation,
          spaces: context.spaces,
          containingSpaceId: context.containingSpaceId,
          deleteConfirmation: entry.app.deleteConfirmation,
        };
  const authoring = context.authorOnCanvas && context.editableResourceIds.has(resourceId);
  const mapRail = buildSpaceResourceRail({
    target,
    selection,
    disabled: !authoring,
    complete: (targetMap, graphId) => {
      void commit({ ...view, map: targetMap.id, graph: graphId }).then((answer) =>
        context.onContextReport(resourceId, refusalOf(answer)),
      );
      return null;
    },
    onEditingChange: (editing) => context.onContextEditingChange(resourceId, editing),
    onReport: (message) => context.onContextReport(resourceId, message),
    context: railContext,
  });
  return withEmbedCommands(node, {
    mapRail,
    contextNotice: context.contextNotices.get(resourceId),
  });
}

function withEmbedCommands(
  node: ResourceFlowNode,
  added: {
    readonly mapRail?: ReturnType<typeof buildSpaceResourceRail>;
    readonly mapNote?: string;
    readonly contextNotice?: string | undefined;
  },
): ResourceFlowNode {
  const kindOperations = { ...node.data.kindOperations };
  if (added.mapRail !== undefined) kindOperations.mapRail = added.mapRail;
  if (added.mapNote !== undefined) kindOperations.mapNote = added.mapNote;
  const data = { ...node.data, kindOperations };
  if (added.contextNotice !== undefined) data.contextNotice = added.contextNotice;
  return { ...node, data };
}
