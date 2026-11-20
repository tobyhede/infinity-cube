import { createContext, useContext } from 'react';
import { createObservableState, type ObserverErrorReporter } from '@project/persistence';
import { titleName, type ResourceId } from '@project/core';
import type { ResourceFlowNode } from '@project/react-flow-adapter';
import {
  discoverEmbeddedOpenSpaceResources,
  embedSpacesToRead,
  type EmbeddedOpenSpaceResourceRequest,
  type EmbeddedRoot,
} from '../embedded-open-space-resource';
import type { OpenSpace, SpaceHold } from '../open-spaces';
import { spaceResourceTarget } from '../space-resource-lifecycle';
import type { EmbeddedPublication } from './embedded-publication';
import type { PluginGate } from '../plugin-host/plugin-gate';
import type { DrawingKey } from '../plugin-host/claim-chain';
import type { SpaceResourceFraming } from '../space-resource-framing';
import { framedView } from './embed-view';
import {
  createMapEmbeddings,
  editingMapEmbeds,
  type MapEmbedEntry,
  type MapEmbeddings,
} from './map-embeddings';

/** What a Map embedding asks of Open Spaces: live compositions and one hold per drawn request. */
export interface EmbeddedTargetReader {
  readonly getState: () => { readonly composed: readonly OpenSpace[] };
  readonly subscribe: (listener: () => void) => () => void;
  readonly hold: (spaceId: ResourceId) => Promise<Pick<SpaceHold, 'release'>>;
}

/** A placement whose Space could not be read: its node id, its Title's name, and why. */
export interface EmbeddedFailure {
  readonly id: string;
  readonly title: string;
  readonly message: string;
}

/** What a Map embedding asks of the canvas it is drawn on. */
export interface MapEmbeddingDependencies {
  /** Where each drawn embedding's Space is held and read; `null` off Open Spaces. */
  readonly spaces: EmbeddedTargetReader | null;
  /** Where an authored embedding's Claim is lent while it authors its Map. */
  readonly claims: Pick<PluginGate, 'lend'>;
  /** Selects a Resource on the canvas, as Done and Close leave it. */
  readonly select: (resourceId: ResourceId) => void;
  readonly reportObserverError?: ObserverErrorReporter;
}

/** The Space, Map and Graph one placement's embedding is drawn with. */
export interface MapEmbeddingDrawnRequest {
  readonly parent: { readonly id: string };
  readonly spaceId: ResourceId;
  readonly mapId: string;
  readonly graphId: string;
}

/** What the canvas drew in one commit. */
export interface MapEmbeddingDrawn {
  /** The placements drawn, by node id. */
  readonly placements: readonly string[];
  /** The Map and Graph each embedding is drawn with, which a framing names where its plugin passed no Graph. */
  readonly requests: readonly MapEmbeddingDrawnRequest[];
  /** Whether the canvas has drawn its own Resources yet; no Space is held before it has. */
  readonly ready?: boolean;
}

export interface MapEmbeddingState {
  /** The placements whose embedded Map is authored in place, by node id. */
  readonly editing: ReadonlySet<string>;
  /** The framing being drawn on each placement's embedded Map, by node id, until it lands. */
  readonly drafts: ReadonlyMap<string, SpaceResourceFraming>;
  /** The Spaces composed in Open Spaces, which a drawn embedding draws once its Space is among them. */
  readonly entries: readonly OpenSpace[];
  /** Why each Space a placement asked to read could not be, by that Space. */
  readonly failures: ReadonlyMap<ResourceId, string>;
  /** The measured footer under each placement's embedded Map, by node id. */
  readonly footers: ReadonlyMap<string, number>;
  /** What the canvas drawn inside each placement's embedding publishes, by node id, while its request stands. */
  readonly publications: ReadonlyMap<string, EmbeddedPublication>;
  /** What the canvas says about each placement's embedding, by node id, while it stands. */
  readonly notices: ReadonlyMap<string, string>;
  /** The placements whose embedding's rail is editing, by node id, while it stands. */
  readonly railEditing: ReadonlySet<string>;
}

/**
 * The Map embeddings drawn on one root canvas, nested ones too, and the
 * lifecycle of each: what its plugin publishes, the Claim it is lent while
 * its Map is authored in place, the framing authored on it, and Done
 * (ADR 0142, ADR 0112, ADR 0122).
 */
export interface MapEmbedding {
  /** Where the plugins drawn on this canvas publish what they ask of their Map embedding. */
  readonly embeddings: MapEmbeddings;
  readonly getState: () => MapEmbeddingState;
  readonly subscribe: (listener: () => void) => () => void;
  /**
   * The canvas has committed with these placements drawn. An embedding whose
   * Edit ended lands its pending framing, gives back its Claim and, if its
   * placement is still drawn, has its Resource selected; one withdrawn is then
   * forgotten.
   */
  readonly drawn: (drawn: MapEmbeddingDrawn) => void;
  /** Shows `framing` on the placement's Map while a pan draws it. */
  readonly draft: (placement: string, framing: SpaceResourceFraming) => void;
  /** Lands `framing` on the placement now, through its embedding's own commit. */
  readonly frame: (placement: string, framing: SpaceResourceFraming) => void;
  /** Shows `framing`, and lands it once the wheel has been still for {@link ZOOM_QUIET_MS}. */
  readonly zoom: (placement: string, framing: SpaceResourceFraming) => void;
  /** A pan takes over the placement: its pending zoom is dropped, unlanded, and its draft kept. */
  readonly beginPan: (placement: string) => void;
  /** The canvas drawn inside a placement's embedding publishes what it draws, or withdraws it with `null`. */
  readonly publishCanvas: (placement: string, publication: EmbeddedPublication | null) => void;
  /** The footer under a placement's embedded Map measured `height`, or went with `null`. */
  readonly reportFooter: (placement: string, height: number | null) => void;
  /** Reads `spaceId` again for every placement that asked for it and holds nothing, as Resume after Exit does. */
  readonly resume: (spaceId: ResourceId) => Promise<void>;
  /**
   * Says `message` about the placement's embedding, or stops saying anything
   * with `null`. An answer that lands after its embedding has gone says nothing.
   */
  readonly setNotice: (placement: string, message: string | null) => void;
  /** The placement's embedding's rail began or stopped editing. */
  readonly setRailEditing: (placement: string, editing: boolean) => void;
  /** The canvas goes: every pending zoom lands, drafts kept, every Claim is given back and every Space released. */
  readonly dispose: () => void;
}

/** The embeddings one commit draws, and the placements whose Space could not be read. */
export interface DrawnEmbeddings {
  readonly requests: readonly EmbeddedOpenSpaceResourceRequest<OpenSpace>[];
  readonly failed: readonly EmbeddedFailure[];
}

const NO_FAILURES: readonly EmbeddedFailure[] = [];

/**
 * What the canvas draws for its Map embeddings in one render: each standing
 * request, and each placement whose Space could not be read, named by the
 * Title its author gave it.
 *
 * Pure, so the canvas derives it during render. A publication whose request no
 * longer stands is left out here rather than after paint: picked up as live by
 * the next Open of the same Resource on the same Map, it would draw nodes bound
 * to a composition already torn down. A read outlives its request only while
 * the *target* is gone, the Exit case, where the request still stands.
 */
export function drawnEmbeddings(
  state: MapEmbeddingState,
  embeds: ReadonlyMap<string, MapEmbedEntry>,
  drawn: {
    readonly nodes: readonly ResourceFlowNode[];
    readonly dragging: ReadonlySet<string>;
    readonly root: EmbeddedRoot;
  },
): DrawnEmbeddings {
  const targetOf = (space: string) => {
    const entry = state.entries.find((candidate) => candidate.id === space);
    return entry === undefined ? undefined : spaceResourceTarget(entry.app.currentSpace());
  };
  const discover = (publications: ReadonlyMap<string, EmbeddedPublication>) =>
    discoverEmbeddedOpenSpaceResources({
      targetOf,
      root: drawn.root,
      editingPortals: state.editing,
      embeds,
      staleSpaces: new Set(state.failures.keys()),
      nodes: drawn.nodes,
      entries: state.entries,
      publications,
      bodyHeights: state.footers,
      draggingIds: drawn.dragging,
    });
  let requests = discover(state.publications);
  const standing = new Set(requests.map((request) => request.parent.id));
  if ([...state.publications.keys()].some((id) => !standing.has(id))) {
    requests = discover(new Map([...state.publications].filter(([id]) => standing.has(id))));
  }
  if (state.failures.size === 0) return { requests, failed: NO_FAILURES };
  const placements = placementsAsking(requests, embeds);
  const titles = new Map(drawn.nodes.map((node) => [node.id, node.data.title]));
  for (const { parent } of requests) titles.set(parent.id, parent.data.title);
  const failed = [...placements].flatMap(([id, spaceId]) => {
    const message = state.failures.get(spaceId);
    const title = titles.get(id);
    return message === undefined || title === undefined
      ? []
      : [{ id, title: titleName(title), message }];
  });
  return { requests, failed };
}

/**
 * The Space each placement asks to read, by node id: one drawn from a standing
 * request, or one given no view, or no Graph, whose Map waits on that read and
 * so asks for it before it has a request.
 */
const placementsAsking = (
  requests: readonly Pick<MapEmbeddingDrawnRequest, 'parent' | 'spaceId'>[],
  embeds: ReadonlyMap<string, MapEmbedEntry>,
): ReadonlyMap<string, ResourceId> => {
  const placed = new Map(
    requests.map(({ parent, spaceId }): [string, ResourceId] => [parent.id, spaceId]),
  );
  for (const [nodeId, spaceId] of embedSpacesToRead(embeds))
    if (!placed.has(nodeId)) placed.set(nodeId, spaceId);
  return placed;
};

/** One placement's read of its Space, holding the Space once it is read. */
interface HoldRequest {
  readonly spaceId: ResourceId;
  hold?: Pick<SpaceHold, 'release'>;
}

/** How long the wheel stays still before a zoom lands. */
export const ZOOM_QUIET_MS = 160;

const reportToConsole: ObserverErrorReporter = (error) =>
  console.error('A Map embedding observer failed', error);

const sameMembers = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean =>
  a.size === b.size && [...a].every((id) => b.has(id));

export function createMapEmbedding({
  spaces,
  claims,
  select,
  reportObserverError = reportToConsole,
}: MapEmbeddingDependencies): MapEmbedding {
  const embeddings = createMapEmbeddings(reportObserverError);
  const observable = createObservableState<MapEmbeddingState>(
    {
      editing: new Set(),
      drafts: new Map(),
      entries: spaces?.getState().composed ?? [],
      failures: new Map(),
      footers: new Map(),
      publications: new Map(),
      notices: new Map(),
      railEditing: new Set(),
    },
    reportObserverError,
  );
  const update = (change: (state: MapEmbeddingState) => MapEmbeddingState): void => {
    const state = observable.getState();
    const next = change(state);
    if (next !== state) observable.publish(next);
  };
  /** Each placement's read, keyed by what it asks to read, so a new Map asks again. */
  const requested = new Map<string, HoldRequest>();
  const acquire = async (key: string, spaceId: ResourceId): Promise<void> => {
    if (spaces === null) return;
    const request: HoldRequest = { spaceId };
    requested.set(key, request);
    try {
      const hold = await spaces.hold(spaceId);
      if (requested.get(key) !== request) {
        await hold.release();
        return;
      }
      request.hold = hold;
      update((state) =>
        state.failures.has(spaceId)
          ? { ...state, failures: new Map([...state.failures].filter(([id]) => id !== spaceId)) }
          : state,
      );
    } catch (error) {
      if (requested.get(key) !== request) return;
      const message = error instanceof Error ? error.message : String(error);
      update((state) =>
        state.failures.get(spaceId) === message
          ? state
          : { ...state, failures: new Map(state.failures).set(spaceId, message) },
      );
    }
  };
  const release = (key: string): void => {
    void requested.get(key)?.hold?.release();
    requested.delete(key);
  };
  // Open Spaces outlives the canvas, so the subscription is taken while the
  // canvas draws and given back when it goes, and taken again if it returns.
  let unsubscribeSpaces: (() => void) | undefined;
  const followSpaces = (): void => {
    if (spaces === null || unsubscribeSpaces !== undefined) return;
    unsubscribeSpaces = spaces.subscribe(() => {
      const entries = spaces.getState().composed;
      update((state) => (state.entries === entries ? state : { ...state, entries }));
    });
    const entries = spaces.getState().composed;
    update((state) => (state.entries === entries ? state : { ...state, entries }));
  };
  /** Each authored placement's lent Claim: the drawing lent for, and how to give it back. */
  const lent = new Map<string, { readonly drawing: DrawingKey; readonly giveBack: () => void }>();
  /** The embeddings as the canvas last settled them, which an embedding withdrawn since is still found in. */
  let settled: ReadonlyMap<string, MapEmbedEntry> = embeddings.getState();
  let drawnRequests: readonly MapEmbeddingDrawnRequest[] = [];
  const pendingZoom = new Map<string, SpaceResourceFraming>();
  const zoomTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // Which placements author in place is a fact about what the plugins
  // published, so it follows the registry at once rather than at the next
  // settle: nothing is drawn with authoring offered on a Map that left it.
  // What the canvas says about an embedding, and its rail editing, go with
  // the embedding the same way, whatever took it down.
  embeddings.subscribe(() => {
    const entries = embeddings.getState();
    const editing = editingMapEmbeds(entries);
    update((state) => {
      const notices = [...state.notices.keys()].every((id) => entries.has(id))
        ? state.notices
        : new Map([...state.notices].filter(([id]) => entries.has(id)));
      const railEditing = [...state.railEditing].every((id) => entries.has(id))
        ? state.railEditing
        : new Set([...state.railEditing].filter((id) => entries.has(id)));
      const editingChanged = !sameMembers(editing, state.editing);
      if (!editingChanged && notices === state.notices && railEditing === state.railEditing)
        return state;
      return { ...state, editing: editingChanged ? editing : state.editing, notices, railEditing };
    });
  });

  const setDraft = (placement: string, framing: SpaceResourceFraming | undefined): void => {
    const state = observable.getState();
    if (state.drafts.get(placement) === framing) return;
    if (framing === undefined && !state.drafts.has(placement)) return;
    const drafts = new Map(state.drafts);
    if (framing === undefined) drafts.delete(placement);
    else drafts.set(placement, framing);
    observable.publish({ ...state, drafts });
  };

  /**
   * Writes `framing` through the embedding's own `select` commit, so a
   * withdrawal covers it. An embedding taken down since the last settle is
   * still found there, so a framing pending when it went still lands.
   */
  const write = (placement: string, framing: SpaceResourceFraming): void => {
    const entry = embeddings.getState().get(placement) ?? settled.get(placement);
    const commit = entry?.request.select?.commit;
    if (entry === undefined || commit === undefined) return;
    const drawn = drawnRequests.find((request) => request.parent.id === placement);
    const next = framedView(entry.request.view, drawn, framing);
    if (next !== undefined) void commit(next);
  };

  const cancelZoom = (placement: string): SpaceResourceFraming | undefined => {
    const timer = zoomTimers.get(placement);
    if (timer !== undefined) clearTimeout(timer);
    zoomTimers.delete(placement);
    const pending = pendingZoom.get(placement);
    pendingZoom.delete(placement);
    return pending;
  };

  const flushZoom = (placement: string, dropDraft = true): void => {
    const pending = cancelZoom(placement);
    if (pending === undefined) return;
    if (dropDraft) setDraft(placement, undefined);
    write(placement, pending);
  };

  /**
   * Drops what no longer stands, then holds what each standing request and
   * each placement waiting on a read asks for, releasing the rest.
   */
  const settleReads = (requests: readonly MapEmbeddingDrawnRequest[], ready: boolean): void => {
    const standing = new Set(requests.map((request) => request.parent.id));
    const embeds = embeddings.getState();
    const asked = new Set(placementsAsking(requests, embeds).values());
    update((state) => {
      const publications = [...state.publications.keys()].every((id) => standing.has(id))
        ? state.publications
        : new Map([...state.publications].filter(([id]) => standing.has(id)));
      const failures = [...state.failures.keys()].every((id) => asked.has(id))
        ? state.failures
        : new Map([...state.failures].filter(([id]) => asked.has(id)));
      return publications === state.publications && failures === state.failures
        ? state
        : { ...state, publications, failures };
    });
    if (!ready) return;
    const visible = new Map<string, ResourceId>([
      ...requests.map((request): [string, ResourceId] => [
        `${request.parent.id}:${request.spaceId}:${request.mapId}:${request.graphId}`,
        request.spaceId,
      ]),
      ...[...embedSpacesToRead(embeds)].map(([nodeId, spaceId]): [string, ResourceId] => [
        `${nodeId}:${spaceId}:read`,
        spaceId,
      ]),
    ]);
    for (const key of [...requested.keys()]) if (!visible.has(key)) release(key);
    for (const [key, spaceId] of visible) if (!requested.has(key)) void acquire(key, spaceId);
  };

  return {
    embeddings,
    getState: observable.getState,
    subscribe: observable.subscribe,
    drawn: ({ placements, requests, ready = true }) => {
      drawnRequests = requests;
      followSpaces();
      settleReads(requests, ready);
      const entries = embeddings.getState();
      const editing = editingMapEmbeds(entries);
      const drawnNow = new Set(placements);
      for (const [nodeId, lend] of lent) {
        if (editing.has(nodeId) && entries.get(nodeId)?.drawing === lend.drawing) continue;
        if (!editing.has(nodeId)) {
          // Done lands what the author framed before another Claim can
          // withdraw the commit (ADR 0142).
          flushZoom(nodeId);
        }
        lend.giveBack();
        lent.delete(nodeId);
        if (editing.has(nodeId)) continue;
        // Done and Close leave the Resource drawn, and it is selected; an Edit
        // that ended because the placement went selects nothing.
        const left = settled.get(nodeId);
        if (left !== undefined && drawnNow.has(nodeId)) select(left.resourceId);
      }
      for (const nodeId of editing) {
        const drawing = entries.get(nodeId)?.drawing;
        if (drawing === undefined || lent.has(nodeId)) continue;
        lent.set(nodeId, { drawing, giveBack: claims.lend(drawing) });
      }
      // Only now that any framing it had pending has landed is a withdrawn
      // embedding's commit no longer kept.
      for (const nodeId of settled.keys()) if (!entries.has(nodeId)) embeddings.forget(nodeId);
      settled = entries;
    },
    draft: setDraft,
    frame: (placement, framing) => {
      setDraft(placement, undefined);
      write(placement, framing);
    },
    zoom: (placement, framing) => {
      pendingZoom.set(placement, framing);
      setDraft(placement, framing);
      const timer = zoomTimers.get(placement);
      if (timer !== undefined) clearTimeout(timer);
      zoomTimers.set(
        placement,
        setTimeout(() => {
          flushZoom(placement);
        }, ZOOM_QUIET_MS),
      );
    },
    beginPan: (placement) => {
      cancelZoom(placement);
    },
    publishCanvas: (placement, publication) => {
      update((state) => {
        const current = state.publications.get(placement);
        if (current === publication || (publication === null && current === undefined))
          return state;
        const publications = new Map(state.publications);
        if (publication === null) publications.delete(placement);
        else publications.set(placement, publication);
        return { ...state, publications };
      });
    },
    reportFooter: (placement, height) => {
      // A non-positive height is not a measured footer.
      if (height !== null && height <= 0) return;
      update((state) => {
        if (
          height === null ? !state.footers.has(placement) : state.footers.get(placement) === height
        )
          return state;
        const footers = new Map(state.footers);
        if (height === null) footers.delete(placement);
        else footers.set(placement, height);
        return { ...state, footers };
      });
    },
    setNotice: (placement, message) => {
      if (message !== null && !embeddings.getState().has(placement)) return;
      update((state) => {
        if ((state.notices.get(placement) ?? null) === message) return state;
        const notices = new Map(state.notices);
        if (message === null) notices.delete(placement);
        else notices.set(placement, message);
        return { ...state, notices };
      });
    },
    setRailEditing: (placement, editing) => {
      update((state) => {
        if (state.railEditing.has(placement) === editing) return state;
        const railEditing = new Set(state.railEditing);
        if (editing) railEditing.add(placement);
        else railEditing.delete(placement);
        return { ...state, railEditing };
      });
    },
    resume: async (spaceId) => {
      await Promise.all(
        [...requested]
          .filter(([, request]) => request.spaceId === spaceId && request.hold === undefined)
          .map(([key]) => acquire(key, spaceId)),
      );
    },
    dispose: () => {
      for (const placement of [...pendingZoom.keys()]) flushZoom(placement, false);
      for (const lend of lent.values()) lend.giveBack();
      lent.clear();
      for (const key of [...requested.keys()]) release(key);
      unsubscribeSpaces?.();
      unsubscribeSpaces = undefined;
    },
  };
}

const MapEmbeddingContext = createContext<MapEmbedding | null>(null);

/** Where the Map embedding of the canvas drawing this composition is provided. */
export const MapEmbeddingProvider = MapEmbeddingContext.Provider;

/** The Map embedding of the canvas this is drawn on, or `null` off one. */
export const useMapEmbedding = (): MapEmbedding | null => useContext(MapEmbeddingContext);
