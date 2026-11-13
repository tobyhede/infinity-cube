import { uuidSchema, type SpaceFraming, type SpaceView } from '@project/core';
import type { EmbedView } from '@project/resource-api/view';
import type { SpaceResourceTarget } from './space-resource-lifecycle';

/**
 * The Map and Graph a Space embedding draws (ADR 0142): the view a plugin
 * passed where it names both, otherwise read off the shown Space. No view is
 * that Space's `defaultMap`, and a view or a Map with no Graph is the Map's own
 * opening Graph: its authored Active Graph, or its first Graph where it has
 * none (ADR 0040).
 *
 * `undefined` while the Space it needs is unread, and for a view the Space
 * cannot resolve: a Map it does not have, or no `defaultMap`, which draws
 * nothing rather than guessing at another Map.
 */
export function resolveEmbedView(
  space: string,
  view: EmbedView | undefined,
  target: SpaceResourceTarget | undefined,
): SpaceView | undefined {
  const spaceId = uuidSchema.safeParse(space);
  if (!spaceId.success) return undefined;
  if (view?.graph !== undefined) {
    const mapId = uuidSchema.safeParse(view.map);
    const graph = uuidSchema.safeParse(view.graph);
    return mapId.success && graph.success
      ? { spaceId: spaceId.data, map: mapId.data, graph: graph.data, framing: view.framing }
      : undefined;
  }
  if (target === undefined) return undefined;
  const mapId = view?.map ?? target.defaultMap;
  const shown = target.maps.find((candidate) => candidate.id === mapId);
  if (shown === undefined) return undefined;
  const graph = shown.graphs.find(({ id }) => id === shown.activeGraph) ?? shown.graphs[0];
  if (graph === undefined) return undefined;
  return { spaceId: spaceId.data, map: shown.id, graph: graph.id, framing: view?.framing };
}

/**
 * The view a framing is written with (ADR 0142): the plugin's own where it
 * names a Graph, since that is what the embedding draws; otherwise the Map and
 * Graph its placement drew from the shown Space, or the view's Map alone.
 * `undefined` where neither names a Map.
 */
export function framedView(
  view: EmbedView | undefined,
  drawn: { readonly mapId: string; readonly graphId: string } | undefined,
  framing: SpaceFraming,
): EmbedView | undefined {
  if (view?.graph !== undefined) return { map: view.map, graph: view.graph, framing };
  if (drawn !== undefined) return { map: drawn.mapId, graph: drawn.graphId, framing };
  return view === undefined ? undefined : { map: view.map, graph: undefined, framing };
}
