import { createContext, useContext } from 'react';
import type { ResourceId } from '@project/core';
import { createObservableState, type ObserverErrorReporter } from '@project/persistence';
import type { MapEmbedRequest } from '@project/ui';

/**
 * The Map embeddings drawn on one canvas (ADR 0142): what each asks for, by
 * the placement whose rect it is drawn in. A plugin's `<Embed space>` publishes
 * here while it is drawn, and nothing else does, so a Closed Space Resource
 * requests nothing. The canvas draws each request's Map over its rect, the
 * drawing whose Claim is passed authors it in place, and the host's chooser,
 * offered where the request passes a commit, writes a choice through it.
 *
 * A placement is one drawing on this canvas: a Resource drawn twice, as two
 * embeddings of one Map draw it, is two placements, each with its own entry
 * and its own drawing key, so nothing here is looked up by Resource.
 */

/**
 * One drawn Map embedding: the Resource whose rect it is drawn in, the key of
 * the drawing that rect is (whose Claim the embedding is passed), and what it
 * asks for.
 */
export interface MapEmbedEntry {
  readonly resourceId: ResourceId;
  readonly drawing: symbol;
  readonly request: MapEmbedRequest;
}

export interface MapEmbeddings {
  readonly getState: () => ReadonlyMap<string, MapEmbedEntry>;
  readonly subscribe: (listener: () => void) => () => void;
  /**
   * The embedding in placement `nodeId`'s rect, drawn by `drawing`, asks for
   * `request`, or is gone (`null`).
   */
  readonly publish: (
    nodeId: string,
    resourceId: ResourceId,
    request: MapEmbedRequest | null,
    drawing: symbol,
  ) => void;
  /**
   * Placement `nodeId`'s withdrawn embedding needs its latest commit no
   * longer, as once a framing pending when it was taken down has landed. A
   * placement still drawing an embedding keeps it.
   */
  readonly forget: (nodeId: string) => void;
}

const NONE: ReadonlyMap<string, MapEmbedEntry> = new Map();

/** Whether two requests ask for the same Space and view, a choice where the other offers one, and the same Claim. */
const sameAsk = (a: MapEmbedRequest, b: MapEmbedRequest): boolean =>
  a.space === b.space &&
  a.view?.map === b.view?.map &&
  a.view?.graph === b.view?.graph &&
  a.view?.framing?.centreX === b.view?.framing?.centreX &&
  a.view?.framing?.centreY === b.view?.framing?.centreY &&
  a.view?.framing?.zoom === b.view?.framing?.zoom &&
  (a.select?.commit === undefined) === (b.select?.commit === undefined) &&
  a.claim === b.claim;

const reportToConsole: ObserverErrorReporter = (error) =>
  console.error('A Map embedding observer failed', error);

export function createMapEmbeddings(
  reportObserverError: ObserverErrorReporter = reportToConsole,
): MapEmbeddings {
  const observable = createObservableState(NONE, reportObserverError);
  /** The request each placement last published, whose `select` the stored one forwards to. */
  const latest = new Map<string, MapEmbedRequest>();
  /**
   * The request as it is stored: its choice forwards to the latest one
   * published. A host mints a plugin's commits afresh as it redraws, and the
   * plugin's request with them, so a request asking for the same thing is
   * kept rather than republished: a choice still reaches the commit offered
   * now, and the canvas is not redrawn for it.
   */
  const stored = (nodeId: string, request: MapEmbedRequest): MapEmbedRequest => {
    const select = request.select;
    if (select?.commit === undefined) return request;
    return {
      ...request,
      select: {
        value: select.value,
        commit: (next) => {
          const commit = latest.get(nodeId)?.select?.commit;
          return commit === undefined
            ? Promise.resolve({ refused: 'This choice is no longer offered.' })
            : commit(next);
        },
      },
    };
  };
  return {
    getState: observable.getState,
    subscribe: (listener) => {
      const unsubscribe = observable.subscribe(listener);
      return () => {
        unsubscribe();
      };
    },
    publish: (nodeId, resourceId, request, drawing) => {
      const state = observable.getState();
      const current = state.get(nodeId);
      // A withdrawn request keeps its latest commit reachable, so a framing
      // pending when its embedding is taken down still lands; `forget` drops it.
      if (request === null) {
        if (current === undefined) return;
      } else {
        latest.set(nodeId, request);
        if (
          current?.resourceId === resourceId &&
          current.drawing === drawing &&
          sameAsk(current.request, request)
        )
          return;
      }
      const next = new Map(state);
      if (request === null) next.delete(nodeId);
      else next.set(nodeId, { resourceId, drawing, request: stored(nodeId, request) });
      observable.publish(next);
    },
    forget: (nodeId) => {
      if (!observable.getState().has(nodeId)) latest.delete(nodeId);
    },
  };
}

/** The entry drawn for placement `nodeId`'s own rect, where its plugin embeds a Map it may choose for. */
export const ownMapEmbed = (
  embeds: ReadonlyMap<string, MapEmbedEntry>,
  nodeId: string,
): MapEmbedEntry | undefined => embeds.get(nodeId);

/** The placements whose embedded Map is authored in place: each drawing passed its Claim to the embedding. */
export const editingMapEmbeds = (embeds: ReadonlyMap<string, MapEmbedEntry>): ReadonlySet<string> =>
  new Set(
    [...embeds].flatMap(([nodeId, entry]) => (entry.request.claim === undefined ? [] : [nodeId])),
  );

const MapEmbeddingsContext = createContext<MapEmbeddings | null>(null);

/** Where the Map embeddings of the canvas drawing this composition are published. */
export const MapEmbeddingsProvider = MapEmbeddingsContext.Provider;

/** The Map embeddings of the canvas this is drawn on, or `null` off one. */
export const useMapEmbeddings = (): MapEmbeddings | null => useContext(MapEmbeddingsContext);
