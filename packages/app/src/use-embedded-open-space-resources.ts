import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { titleName, type ResourceId } from '@project/core';
import type { ResourceFlowNode } from '@project/react-flow-adapter';
import {
  discoverEmbeddedOpenSpaceResources,
  embedSpacesToRead,
  type EmbeddedOpenSpaceResourceRequest,
  type EmbeddedRoot,
} from './embedded-open-space-resource';
import type { EmbeddedPublication } from './embedded-publication';
import { editingMapEmbeds, type MapEmbedEntry } from './map-embeddings';
import type { OpenSpace, SpaceHold } from './open-spaces';
import { spaceResourceTarget } from './space-resource-lifecycle';
import type { SpaceResourceFraming } from './space-resource-framing';

const EMPTY_ENTRIES = [] as const;
const emptySubscription = () => () => undefined;

/**
 * What a drawing asks of Open Spaces: live compositions and one hold per occurrence.
 */
export interface EmbeddedTargetReader {
  readonly getState: () => { readonly composed: readonly OpenSpace[] };
  readonly subscribe: (listener: () => void) => () => void;
  readonly hold: (spaceId: ResourceId) => Promise<Pick<SpaceHold, 'release'>>;
}

/** One drawing's request for its target, holding the target once it is read. */
interface EmbeddedHoldRequest {
  readonly spaceId: ResourceId;
  hold?: Pick<SpaceHold, 'release'>;
}

/** A placement whose Space could not be read: its node id, its Title's name, and why. */
export interface EmbeddedFailure {
  readonly id: string;
  readonly title: string;
  readonly message: string;
}

const NO_FAILURES: readonly EmbeddedFailure[] = [];

export interface EmbeddedOpenSpaceResources {
  readonly embeddedRequests: readonly EmbeddedOpenSpaceResourceRequest<OpenSpace>[];
  readonly embeddedPublications: ReadonlyMap<string, EmbeddedPublication>;
  /** What to announce for each placement whose Space could not be read. */
  readonly failedEmbeddings: readonly EmbeddedFailure[];
  readonly resumeEmbedded: (spaceId: ResourceId) => Promise<void>;
  readonly publishEmbedded: (id: string, value: EmbeddedPublication | null) => void;
  readonly reportBodyHeight: (id: string, height: number | null) => void;
  /** The placements whose embedded Map is authored in place, by node id: each passed its Claim to the embedding. */
  readonly editingPortals: ReadonlySet<string>;
  /** The framing being drawn on each placement's embedded Map, by node id. */
  readonly portalDraft: ReadonlyMap<string, SpaceResourceFraming>;
  readonly setPortalDraft: Dispatch<SetStateAction<ReadonlyMap<string, SpaceResourceFraming>>>;
}

/**
 * Target-read scheduling, embed failures, publication registry, and edit-portal
 * state for nested Open Space Resources. Mounting and clip-path stay with the canvas.
 */
export function useEmbeddedOpenSpaceResources(
  nodes: readonly ResourceFlowNode[],
  embeds: ReadonlyMap<string, MapEmbedEntry>,
  spaces: EmbeddedTargetReader | null,
  draggingIds: ReadonlySet<string>,
  root: EmbeddedRoot,
  projectionReady = true,
): EmbeddedOpenSpaceResources {
  const getEntries = useCallback(() => spaces?.getState().composed ?? EMPTY_ENTRIES, [spaces]);
  const entries = useSyncExternalStore(spaces?.subscribe ?? emptySubscription, getEntries);
  const [embeddedPublications, setEmbeddedPublications] = useState<
    ReadonlyMap<string, EmbeddedPublication>
  >(new Map());
  /**
   * What each target could not be read with, kept apart from the others'.
   *
   * Not one string for the whole canvas: every embedding would then answer for
   * every other — any target that opened would clear a sentence raised by a
   * different Space Resource, and the one on screen would never say which
   * target it was about. Keyed by the Space the read was aimed at, because that is what
   * `spaces.hold` is asked for — two Resources reaching the same missing Space
   * are reporting one failure, and each names itself where it is drawn.
   */
  const [embeddedFailures, setEmbeddedFailures] = useState<ReadonlyMap<ResourceId, string>>(
    new Map(),
  );
  const [bodyHeights, setBodyHeights] = useState<ReadonlyMap<string, number>>(new Map());
  const editingKey = [...editingMapEmbeds(embeds)].sort().join();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- membership key, not snapshot identity
  const editingPortals = useMemo(() => editingMapEmbeds(embeds), [editingKey]);
  const [portalDraft, setPortalDraft] = useState<ReadonlyMap<string, SpaceResourceFraming>>(
    () => new Map(),
  );
  const reportBodyHeight = useCallback((id: string, height: number | null) => {
    setBodyHeights((previous) => {
      // A non-positive height is not a measured footer.
      if (height !== null && height <= 0) return previous;
      if (height === null ? !previous.has(id) : previous.get(id) === height) return previous;
      const next = new Map(previous);
      if (height === null) next.delete(id);
      else next.set(id, height);
      return next;
    });
  }, []);
  // What an embedding given no view, or no Graph, is resolved against: its
  // Space once it is composed here (ADR 0142). Open Spaces publishes a new
  // `composed` on every commit of a composed Space, so this is rebuilt when
  // the Space it reads changes ("draws an embedding given no view on its
  // Space's defaultMap as it is now").
  const targetOf = useCallback(
    (space: string) => {
      const entry = entries.find((candidate) => candidate.id === space);
      return entry === undefined ? undefined : spaceResourceTarget(entry.app.currentSpace());
    },
    [entries],
  );
  const toRead = useMemo(() => embedSpacesToRead(embeds), [embeds]);
  const embeddedRequests = useMemo(
    () =>
      discoverEmbeddedOpenSpaceResources({
        targetOf,
        root,
        editingPortals,
        embeds,
        staleSpaces: new Set(embeddedFailures.keys()),
        nodes,
        entries,
        publications: embeddedPublications,
        bodyHeights,
        draggingIds,
      }),
    [
      nodes,
      embeds,
      entries,
      embeddedPublications,
      bodyHeights,
      draggingIds,
      root,
      editingPortals,
      embeddedFailures,
      targetOf,
    ],
  );
  /**
   * A read outlives its embedding only while the *target* is gone.
   *
   * That is the Exit case: the request still stands, `request.entry` is
   * `undefined`, and the last read is what the retained read-only drawing is
   * made of. A Space Resource that is simply **Closed** makes no request at all, so
   * its read ends with it — a publication left in the map would be picked up as
   * *live* by the next Open of that same Resource at that same Map, one commit
   * of nodes whose `changeNodes` and `removeResource` are bound to a composition
   * whose `observe()` was torn down, and it would seed the nested traversal
   * from a Map nobody is reading any more.
   *
   * Adjusted during render: React discards this pass, so neither the DOM nor
   * the load effect ever sees the requests the dead publication produced.
   */
  if (embeddedPublications.size > 0) {
    const standing = new Set(embeddedRequests.map((request) => request.parent.id));
    if ([...embeddedPublications.keys()].some((id) => !standing.has(id))) {
      setEmbeddedPublications(
        new Map([...embeddedPublications].filter(([id]) => standing.has(id))),
      );
    }
  }
  /**
   * The Space each placement asks to read, by node id: one drawn from a
   * standing request, or one given no view, or no Graph, whose Map waits on
   * that read and so asks for it before it has a request.
   */
  const placements = useMemo(() => {
    const placed = new Map(
      embeddedRequests.map(({ parent, spaceId }): [string, ResourceId] => [parent.id, spaceId]),
    );
    for (const [nodeId, spaceId] of toRead) if (!placed.has(nodeId)) placed.set(nodeId, spaceId);
    return placed;
  }, [embeddedRequests, toRead]);
  // A refusal belongs to the placement that asked for the read, so it goes the
  // same way: no placement asking means nothing left to announce it on.
  // `use-embedded-open-space-resources.test.ts` ('drops a failure whose embedding
  // is no longer standing') holds that prune.
  if (embeddedFailures.size > 0) {
    const asked = new Set(placements.values());
    if ([...embeddedFailures.keys()].some((spaceId) => !asked.has(spaceId))) {
      setEmbeddedFailures(new Map([...embeddedFailures].filter(([id]) => asked.has(id))));
    }
  }
  /** Each placement whose Space could not be read, named by the Title its author gave it. */
  const failedEmbeddings = useMemo((): readonly EmbeddedFailure[] => {
    if (embeddedFailures.size === 0) return NO_FAILURES;
    const titles = new Map(nodes.map((node) => [node.id, node.data.title]));
    for (const { parent } of embeddedRequests) titles.set(parent.id, parent.data.title);
    return [...placements].flatMap(([id, spaceId]) => {
      const message = embeddedFailures.get(spaceId);
      const title = titles.get(id);
      return message === undefined || title === undefined
        ? []
        : [{ id, title: titleName(title), message }];
    });
  }, [embeddedFailures, embeddedRequests, placements, nodes]);
  const requested = useRef(new Map<string, EmbeddedHoldRequest>());
  const acquire = useCallback(
    async (id: string, spaceId: ResourceId) => {
      if (spaces === null) return;
      const request: EmbeddedHoldRequest = { spaceId };
      requested.current.set(id, request);
      try {
        const hold = await spaces.hold(spaceId);
        if (requested.current.get(id) !== request) {
          await hold.release();
          return;
        }
        request.hold = hold;
        setEmbeddedFailures((previous) =>
          previous.has(spaceId)
            ? new Map([...previous].filter(([key]) => key !== spaceId))
            : previous,
        );
      } catch (error) {
        if (requested.current.get(id) !== request) return;
        const message = error instanceof Error ? error.message : String(error);
        setEmbeddedFailures((previous) =>
          previous.get(spaceId) === message ? previous : new Map(previous).set(spaceId, message),
        );
      }
    },
    [spaces],
  );
  const resumeEmbedded = useCallback(
    async (spaceId: ResourceId) => {
      await Promise.all(
        [...requested.current]
          .filter(([, request]) => request.spaceId === spaceId)
          .map(async ([id, request]) => {
            if (request.hold !== undefined) return;
            await acquire(id, spaceId);
          }),
      );
    },
    [acquire],
  );
  useEffect(() => {
    const claims = requested.current;
    return () => {
      for (const request of claims.values()) {
        void request.hold?.release();
      }
      claims.clear();
    };
  }, [spaces]);
  useEffect(() => {
    if (!projectionReady) return;
    const visible = new Map<string, ResourceId>([
      ...embeddedRequests.map((request): [string, ResourceId] => [
        `${request.parent.id}:${request.spaceId}:${request.mapId}:${request.graphId}`,
        request.spaceId,
      ]),
      // A Space an embedding draws from what is read of it is held as well.
      ...[...toRead].map(([nodeId, spaceId]): [string, ResourceId] => [
        `${nodeId}:${spaceId}:read`,
        spaceId,
      ]),
    ]);
    for (const [id, request] of requested.current) {
      if (visible.has(id)) continue;
      void request.hold?.release();
      requested.current.delete(id);
    }
    for (const [id, spaceId] of visible) {
      if (!requested.current.has(id)) void acquire(id, spaceId);
    }
  }, [embeddedRequests, toRead, acquire, projectionReady]);
  const publishEmbedded = useCallback((id: string, value: EmbeddedPublication | null) => {
    setEmbeddedPublications((previous) => {
      if (previous.get(id) === value || (value === null && !previous.has(id))) return previous;
      const next = new Map(previous);
      if (value === null) next.delete(id);
      else next.set(id, value);
      return next;
    });
  }, []);
  return {
    embeddedRequests,
    embeddedPublications,
    failedEmbeddings,
    resumeEmbedded,
    publishEmbedded,
    reportBodyHeight,
    editingPortals,
    portalDraft,
    setPortalDraft,
  };
}
