import { uuidSchema, type ResourceId, type UUID } from '@project/core';
import { refusalOf } from '@project/resource-api/view';
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

/** What the Map embedding says where the Space it shows, once read, has no Map the view resolves to. */
export const NO_SUCH_MAP_NOTE = 'The referenced Space has no such Map.';

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

/**
 * `node` with the commands of the Space it embeds, whatever its kind (ADR 0142),
 * each read from what its plugin passed `Embed`. The Map and Graph chooser is
 * drawn wherever the plugin passed a view, and chooses only through the commit
 * passed with it: with none, as while another drawing holds the Claim, it is
 * drawn disabled, unless the Resource shows content not its own, as a
 * Reference does, which offers no choice to withdraw. The shown Space's links
 * are offered beside the chooser, and its authoring, its Maps and Graphs
 * included, only while the plugin passes a Claim as well as the commit.
 */
export function decorateEmbedCommands(
  node: ResourceFlowNode,
  context: EmbedCommandsContext,
): ResourceFlowNode {
  if (node.data.readOnly) return node;
  const resourceId = node.data.resourceId;
  const embed = ownMapEmbed(context.mapEmbeds, node.id);
  if (embed === undefined) return node;
  const { space, view, select, claim } = embed.request;
  if (select === undefined) return node;
  const commit = select.commit;
  if (commit === undefined && !node.data.authorsContent) return node;
  const spaceId = uuidSchema.safeParse(space);
  const target = spaceId.success ? context.spaceResourceTargets.get(spaceId.data) : undefined;
  const selection = resolveEmbedView(space, view, target);
  if (target === undefined) return withEmbedCommands(node, { mapNote: READING_SPACE_NOTE });
  if (selection === undefined) return withEmbedCommands(node, { mapNote: NO_SUCH_MAP_NOTE });
  const entry = context.spaces?.entry(target.id);
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
  const chooses =
    commit !== undefined && context.authorOnCanvas && context.editableResourceIds.has(resourceId);
  const mapRail = buildSpaceResourceRail({
    target,
    selection,
    disabled: !chooses,
    authorsShownSpace: claim !== undefined,
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
