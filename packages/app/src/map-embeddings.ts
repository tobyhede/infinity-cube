import { createContext, useContext } from 'react';
import type { ResourceId } from '@project/core';
import type { MapEmbedRequest } from '@project/ui';

/**
 * The Map embeddings drawn on one canvas (ADR 0142): what each asks for, by
 * the placement whose rect it is drawn in. A plugin's `<Embed map>` publishes
 * here while it is drawn, and nothing else does, so a Closed Space Resource
 * requests nothing. The canvas draws each request's Map over its rect, the
 * Resource whose Claim is passed authors it in place, and the host's chooser
 * writes a choice through the request's `select`.
 */

/** One drawn Map embedding: the Resource whose rect it is drawn in, and what it asks for. */
export interface MapEmbedEntry {
  readonly resourceId: ResourceId;
  readonly request: MapEmbedRequest;
}

export interface MapEmbeddings {
  readonly getState: () => ReadonlyMap<string, MapEmbedEntry>;
  readonly subscribe: (listener: () => void) => () => void;
  /** The embedding in placement `nodeId`'s rect asks for `request`, or is gone (`null`). */
  readonly publish: (
    nodeId: string,
    resourceId: ResourceId,
    request: MapEmbedRequest | null,
  ) => void;
}

const NONE: ReadonlyMap<string, MapEmbedEntry> = new Map();

export function createMapEmbeddings(): MapEmbeddings {
  let state = NONE;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    publish: (nodeId, resourceId, request) => {
      const current = state.get(nodeId);
      if (request === null ? current === undefined : current?.request === request) return;
      const next = new Map(state);
      if (request === null) next.delete(nodeId);
      else next.set(nodeId, { resourceId, request });
      state = next;
      for (const listener of [...listeners]) listener();
    },
  };
}

/** The entry drawn for a Resource's own rect, where its plugin embeds a Map it may choose for. */
export const ownMapEmbed = (
  embeds: ReadonlyMap<string, MapEmbedEntry>,
  resourceId: ResourceId,
): MapEmbedEntry | undefined => {
  for (const entry of embeds.values()) if (entry.resourceId === resourceId) return entry;
  return undefined;
};

/** The Resources whose embedded Map is authored in place: each passed its Claim to the embedding. */
export const editingMapEmbeds = (
  embeds: ReadonlyMap<string, MapEmbedEntry>,
): ReadonlySet<ResourceId> =>
  new Set(
    [...embeds.values()]
      .filter((entry) => entry.request.claim !== undefined)
      .map((entry) => entry.resourceId),
  );

const MapEmbeddingsContext = createContext<MapEmbeddings | null>(null);

/** Where the Map embeddings of the canvas drawing this composition are published. */
export const MapEmbeddingsProvider = MapEmbeddingsContext.Provider;

/** The Map embeddings of the canvas this is drawn on, or `null` off one. */
export const useMapEmbeddings = (): MapEmbeddings | null => useContext(MapEmbeddingsContext);
