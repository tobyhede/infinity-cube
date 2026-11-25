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
  reportToConsole,
  type MapEmbedEntry,
  type MapEmbeddings,
} from './map-embeddings';

/** What a Map embedding asks of Open Spaces: live compositions and one hold per drawn request. */
export interface EmbeddedTargetReader {
  readonly getState: () => { readonly composed: readonly OpenSpace[] };
  readonly subscribe: (listener: () => void) => () => void;
  readonly hold: (spaceId: ResourceId) => Promise<Pick<SpaceHold, 'release'>>;
}

/** A node whose Space could not be read: its node id, its Title's name, and why. */
export interface EmbeddedFailure {
  readonly id: string;
  readonly title: string;
  readonly message: string;
}

/**
 * Runs `run` once `delayMs` have passed, and answers how to cancel it. Time is
 * nondeterministic, so the canvas that composes a Map embedding names the
 * timer it schedules on and a test supplies one it advances (ADR 0109).
 */
export type Schedule = (run: () => void, delayMs: number) => () => void;

/** What a Map embedding asks of the canvas it is drawn on. */
export interface MapEmbeddingDependencies {
  /** Where each drawn embedding's Space is held and read; `null` off Open Spaces. */
  readonly spaces: EmbeddedTargetReader | null;
  /** Where an authored embedding's Claim is lent while it authors its Map. */
  readonly claims: Pick<PluginGate, 'lend'>;
  /** Selects a Resource on the canvas, as Done and Close leave it. */
  readonly select: (resourceId: ResourceId) => void;
  /** Where a zoom waits for the wheel to be still before it lands. */
  readonly schedule: Schedule;
  readonly reportObserverError?: ObserverErrorReporter;
}

/** The Space, Map and Graph one node's embedding is drawn with. */
export interface MapEmbeddingDrawnRequest {
  readonly parent: { readonly id: string };
  readonly spaceId: ResourceId;
  readonly mapId: string;
  readonly graphId: string;
}

/** What the canvas drew in one commit. */
export interface MapEmbeddingDrawn {
  /** The nodes drawn, by node id. */
  readonly nodeIds: readonly string[];
  /** The Map and Graph each embedding is drawn with, which a framing names where its plugin passed no Graph. */
  readonly requests: readonly MapEmbeddingDrawnRequest[];
  /** Whether the canvas has drawn its own Resources yet; no Space is held before it has. */
  readonly ready?: boolean;
}

export interface MapEmbeddingState {
  /** What the plugins drawn on this canvas published, by node id: {@link MapEmbedding.embeddings}' state. */
  readonly embeds: ReadonlyMap<string, MapEmbedEntry>;
  /** The nodes whose embedded Map is authored in place, by node id. */
  readonly editing: ReadonlySet<string>;
  /** The framing being drawn on each node's embedded Map, by node id, until it lands. */
  readonly drafts: ReadonlyMap<string, SpaceResourceFraming>;
  /** The Spaces composed in Open Spaces, which a drawn embedding draws once its Space is among them. */
  readonly entries: readonly OpenSpace[];
  /** Why each Space a node asked to read could not be, by that Space. */
  readonly failures: ReadonlyMap<ResourceId, string>;
  /** The measured footer under each node's embedded Map, by node id. */
  readonly footers: ReadonlyMap<string, number>;
  /** What the canvas drawn inside each node's embedding publishes, by node id, while its request stands. */
  readonly publications: ReadonlyMap<string, EmbeddedPublication>;
  /** What the canvas says about each node's embedding, by node id, while it stands. */
  readonly notices: ReadonlyMap<string, string>;
  /** The nodes whose embedding's rail is editing, by node id, while it stands. */
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
   * The canvas has committed with these nodes drawn. An embedding whose
   * Edit ended lands its pending framing, gives back its Claim and, if its
   * node is still drawn, has its Resource selected; one withdrawn is then
   * forgotten.
   */
  readonly drawn: (drawn: MapEmbeddingDrawn) => void;
  /** Shows `framing` on the node's Map while a pan draws it, unless that pan no longer frames where it began. */
  readonly draft: (nodeId: string, framing: SpaceResourceFraming) => void;
  /**
   * Lands `framing` on the node now, through its embedding's own commit, and
   * ends its pan; a pan that no longer frames the Map and Graph it began on,
   * through the embedding it began in, lands nothing.
   */
  readonly frame: (nodeId: string, framing: SpaceResourceFraming) => void;
  /** Shows `framing`, and lands it once the wheel has been still for {@link ZOOM_QUIET_MS}. */
  readonly zoom: (nodeId: string, framing: SpaceResourceFraming) => void;
  /**
   * A pan takes over the node: its pending zoom is dropped, unlanded, and its
   * draft kept, and the pan frames the Map and Graph drawn now, through the
   * embedding standing now.
   */
  readonly beginPan: (nodeId: string) => void;
  /** The canvas drawn inside a node's embedding publishes what it draws, or withdraws it with `null`. */
  readonly publishCanvas: (nodeId: string, publication: EmbeddedPublication | null) => void;
  /** The footer under a node's embedded Map measured `height`, or went with `null`. */
  readonly reportFooter: (nodeId: string, height: number | null) => void;
  /** Reads `spaceId` again for every node that asked for it and holds nothing, as Resume after Exit does. */
  readonly resume: (spaceId: ResourceId) => Promise<void>;
  /**
   * Says `message` about the node's embedding of `lifetime`, the embedding
   * it was asked in, or stops saying anything with `null`. An answer that
   * lands after that embedding has gone says nothing, even to another standing
   * at the node, as when a Space Resource is Closed and Opened again.
   */
  readonly setNotice: (nodeId: string, message: string | null, lifetime: symbol) => void;
  /** The node's embedding's rail began or stopped editing; a node that embeds nothing edits nothing. */
  readonly setRailEditing: (nodeId: string, editing: boolean) => void;
  /**
   * The canvas draws with these Open Spaces, gate and selection now. A Claim
   * lent through another gate is given back to it and lent through this one,
   * and every Space read from other Open Spaces is released and read from these.
   * The embeddings and what is said about them are kept.
   */
  readonly follow: (
    dependencies: Pick<MapEmbeddingDependencies, 'spaces' | 'claims' | 'select'>,
  ) => void;
  /**
   * The canvas goes: every pending zoom lands, drafts kept, every Claim is
   * given back, every Space released, and what the plugins publish is not
   * followed until it draws again.
   */
  readonly dispose: () => void;
}

/** The embeddings one commit draws, and the nodes whose Space could not be read. */
export interface DrawnEmbeddings {
  readonly requests: readonly EmbeddedOpenSpaceResourceRequest<OpenSpace>[];
  readonly failed: readonly EmbeddedFailure[];
}

const NO_FAILURES: readonly EmbeddedFailure[] = [];

/**
 * What the canvas draws for its Map embeddings in one render: each standing
 * request, and each node whose Space could not be read, named by the
 * Title its author gave it.
 *
 * Pure, so the canvas derives it during render. A publication whose request no
 * longer stands is left out here rather than after paint: picked up as live by
 * the next Open of the same Resource on the same Map, it would draw nodes bound
 * to a composition already torn down. A read outlives its request only while
 * the *target* is gone, the Exit case, where the request still stands.
 */
export function drawnEmbeddings(
  state: Pick<MapEmbeddingState, 'editing' | 'entries' | 'failures' | 'footers' | 'publications'>,
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
      editingEmbeds: state.editing,
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
  const asking = nodesAsking(requests, embeds);
  const titles = new Map(drawn.nodes.map((node) => [node.id, node.data.title]));
  for (const { parent } of requests) titles.set(parent.id, parent.data.title);
  const failed = [...asking].flatMap(([id, spaceId]) => {
    const message = state.failures.get(spaceId);
    const title = titles.get(id);
    return message === undefined || title === undefined
      ? []
      : [{ id, title: titleName(title), message }];
  });
  return { requests, failed };
}

/**
 * The Space each node asks to read, by node id: one drawn from a standing
 * request, or one given no view, or no Graph, whose Map waits on that read and
 * so asks for it before it has a request.
 */
const nodesAsking = (
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

/** One node's read of its Space, holding the Space once it is read. */
interface HoldRequest {
  readonly spaceId: ResourceId;
  hold?: Pick<SpaceHold, 'release'>;
}

/** How long the wheel stays still before a zoom lands. */
export const ZOOM_QUIET_MS = 160;

/** Where a framing was begun: the Map and Graph it frames, and the lifetime of the embedding it was made in. */
interface FramedOn {
  readonly target: string | undefined;
  readonly lifetime: symbol | undefined;
}

interface PendingZoom extends FramedOn {
  readonly framing: SpaceResourceFraming;
}

const sameMembers = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean =>
  a.size === b.size && [...a].every((id) => b.has(id));

export function createMapEmbedding({
  spaces: initialSpaces,
  claims: initialClaims,
  select: initialSelect,
  schedule,
  reportObserverError = reportToConsole,
}: MapEmbeddingDependencies): MapEmbedding {
  let spaces = initialSpaces;
  let claims = initialClaims;
  let select = initialSelect;
  const embeddings = createMapEmbeddings(reportObserverError);
  const observable = createObservableState<MapEmbeddingState>(
    {
      embeds: embeddings.getState(),
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
  /** Each node's read, keyed by what it asks to read, so a new Map asks again. */
  const requested = new Map<string, HoldRequest>();
  const acquire = async (key: string, spaceId: ResourceId): Promise<void> => {
    const from = spaces;
    if (from === null) return;
    const request: HoldRequest = { spaceId };
    requested.set(key, request);
    try {
      const hold = await from.hold(spaceId);
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
  // Taken while the canvas draws and given back on dispose, and taken again
  // if the canvas draws again.
  let unsubscribeSpaces: (() => void) | undefined;
  const followSpaces = (): void => {
    const from = spaces;
    if (from === null || unsubscribeSpaces !== undefined) return;
    unsubscribeSpaces = from.subscribe(() => {
      const entries = from.getState().composed;
      update((state) => (state.entries === entries ? state : { ...state, entries }));
    });
    const entries = from.getState().composed;
    update((state) => (state.entries === entries ? state : { ...state, entries }));
  };
  /** Each authored node's lent Claim: the drawing lent for, and how to give it back. */
  const lent = new Map<string, { readonly drawing: DrawingKey; readonly giveBack: () => void }>();
  /** The embeddings as the canvas last settled them, which an embedding withdrawn since is still found in. */
  let settled: ReadonlyMap<string, MapEmbedEntry> = embeddings.getState();
  let drawnRequests: readonly MapEmbeddingDrawnRequest[] = [];
  /** Whether the canvas, as it last drew, drew its own Resources. */
  let drawnReady = false;
  /**
   * Each node's zoom waiting for the wheel to be still, the Map and Graph it
   * framed, and the lifetime of the embedding it was made in.
   */
  const pendingZoom = new Map<string, PendingZoom>();
  /**
   * Where each node's pan in progress began, or `null` once that no longer
   * stands, so nothing more it draws is drafted or landed.
   */
  const pans = new Map<string, FramedOn | null>();
  /** How to cancel each node's scheduled landing of its pending zoom. */
  const zoomTimers = new Map<string, () => void>();

  // Which nodes author in place is a fact about what the plugins
  // published, so it follows the registry at once rather than at the next
  // settle: nothing is drawn with authoring offered on a Map that left it.
  // What the canvas says about an embedding, and its rail editing, go with
  // the embedding the same way, whatever took it down.
  /** The lifetime each node's notice and rail editing were said under. */
  const saidUnder = new Map<string, symbol>();
  const stands = (id: string, entries: ReadonlyMap<string, MapEmbedEntry>): boolean => {
    const lifetime = entries.get(id)?.lifetime;
    return lifetime !== undefined && saidUnder.get(id) === lifetime;
  };
  /** The lifetime of the embedding each node's framing draft was drawn on. */
  const draftedUnder = new Map<string, symbol>();
  // A framing draft goes with its embedding too: drawn at the next Open of
  // the Resource, or by a drawing that replaced the embedding, it would frame
  // it with a pan the author never finished.
  const followed = (): void => {
    dropStaleFraming();
    const entries = embeddings.getState();
    for (const id of [...saidUnder.keys()]) if (!stands(id, entries)) saidUnder.delete(id);
    const editing = editingMapEmbeds(entries);
    update((state) => {
      const notices = [...state.notices.keys()].every((id) => saidUnder.has(id))
        ? state.notices
        : new Map([...state.notices].filter(([id]) => saidUnder.has(id)));
      const railEditing = [...state.railEditing].every((id) => saidUnder.has(id))
        ? state.railEditing
        : new Set([...state.railEditing].filter((id) => saidUnder.has(id)));
      const drawnUnder = (id: string): boolean => {
        const lifetime = entries.get(id)?.lifetime;
        return lifetime !== undefined && draftedUnder.get(id) === lifetime;
      };
      const drafts = [...state.drafts.keys()].every(drawnUnder)
        ? state.drafts
        : new Map([...state.drafts].filter(([id]) => drawnUnder(id)));
      for (const id of [...draftedUnder.keys()]) if (!drafts.has(id)) draftedUnder.delete(id);
      const editingChanged = !sameMembers(editing, state.editing);
      if (
        state.embeds === entries &&
        !editingChanged &&
        notices === state.notices &&
        railEditing === state.railEditing &&
        drafts === state.drafts
      )
        return state;
      return {
        ...state,
        embeds: entries,
        editing: editingChanged ? editing : state.editing,
        notices,
        railEditing,
        drafts,
      };
    });
  };
  // Followed from creation, and again whenever the canvas draws after a dispose.
  let unsubscribeEmbeddings: (() => void) | undefined;
  const followEmbeddings = (): void => {
    if (unsubscribeEmbeddings !== undefined) return;
    unsubscribeEmbeddings = embeddings.subscribe(followed);
    followed();
  };

  const setDraft = (nodeId: string, framing: SpaceResourceFraming | undefined): void => {
    const state = observable.getState();
    if (state.drafts.get(nodeId) === framing) return;
    if (framing === undefined && !state.drafts.has(nodeId)) return;
    const drafts = new Map(state.drafts);
    const lifetime = embeddings.getState().get(nodeId)?.lifetime;
    if (framing === undefined) {
      drafts.delete(nodeId);
      draftedUnder.delete(nodeId);
    } else {
      drafts.set(nodeId, framing);
      if (lifetime === undefined) draftedUnder.delete(nodeId);
      else draftedUnder.set(nodeId, lifetime);
    }
    observable.publish({ ...state, drafts });
  };

  /**
   * Writes `framing` through the embedding's own `select` commit, so a
   * withdrawal covers it. An embedding taken down since the last settle is
   * still found there, so a framing pending when it went still lands.
   */
  const write = (nodeId: string, framing: SpaceResourceFraming): void => {
    const entry = embeddings.getState().get(nodeId) ?? settled.get(nodeId);
    const commit = entry?.request.select?.commit;
    if (entry === undefined || commit === undefined) return;
    const next = framedView(entry.request.view, drawnRequestOf(nodeId), framing);
    if (next !== undefined) void commit(next);
  };

  const drawnRequestOf = (nodeId: string): MapEmbeddingDrawnRequest | undefined =>
    drawnRequests.find((request) => request.parent.id === nodeId);

  /** The lifetime of the embedding a framing written now for `nodeId` would land through. */
  const lifetimeOf = (nodeId: string): symbol | undefined =>
    (embeddings.getState().get(nodeId) ?? settled.get(nodeId))?.lifetime;

  /** The Map and Graph a framing written now for `nodeId` would land on. */
  const targetOf = (nodeId: string): string | undefined => {
    const entry = embeddings.getState().get(nodeId) ?? settled.get(nodeId);
    const view = framedView(entry?.request.view, drawnRequestOf(nodeId), {
      centreX: 0,
      centreY: 0,
      zoom: 1,
    });
    return view === undefined ? undefined : `${view.map}:${view.graph ?? ''}`;
  };

  const cancelZoom = (nodeId: string): PendingZoom | undefined => {
    zoomTimers.get(nodeId)?.();
    zoomTimers.delete(nodeId);
    const pending = pendingZoom.get(nodeId);
    pendingZoom.delete(nodeId);
    return pending;
  };

  /** Where a framing begun now for `nodeId` is made. */
  const framedOn = (nodeId: string): FramedOn => ({
    target: targetOf(nodeId),
    lifetime: lifetimeOf(nodeId),
  });

  /**
   * Whether a framing begun `on` for `nodeId` would land on the Map and Graph
   * it framed, through the embedding it was made in.
   */
  const stillFrames = (nodeId: string, on: FramedOn): boolean =>
    lifetimeOf(nodeId) === on.lifetime && targetOf(nodeId) === on.target;

  /**
   * Drops, draft and all, each pending zoom and pan in progress that would
   * no longer land where it was made, the moment that changes: a choice made
   * and taken back before the wheel is still or the pointer is up has still
   * left the Map it framed. A pan dropped stays over until its release.
   */
  const dropStaleFraming = (): void => {
    for (const [nodeId, pending] of [...pendingZoom]) {
      if (stillFrames(nodeId, pending)) continue;
      cancelZoom(nodeId);
      setDraft(nodeId, undefined);
    }
    for (const [nodeId, on] of [...pans]) {
      if (on === null || stillFrames(nodeId, on)) continue;
      pans.set(nodeId, null);
      setDraft(nodeId, undefined);
    }
  };

  const flushZoom = (nodeId: string, dropDraft = true): void => {
    const pending = cancelZoom(nodeId);
    if (pending === undefined) return;
    // A framing lands only on the Map and Graph it framed, through the
    // embedding it was made in: the commit writes them with it, so on a Map
    // chosen since it would frame the wrong Map or switch back, and through a
    // drawing that replaced the embedding it would frame what the author never
    // zoomed. It is dropped, draft and all.
    const kept = stillFrames(nodeId, pending);
    if (dropDraft || !kept) setDraft(nodeId, undefined);
    if (kept) write(nodeId, pending.framing);
  };

  /**
   * Drops what no longer stands, then holds what each standing request and
   * each node waiting on a read asks for, releasing the rest.
   */
  const settleReads = (requests: readonly MapEmbeddingDrawnRequest[], ready: boolean): void => {
    const standing = new Set(requests.map((request) => request.parent.id));
    const embeds = embeddings.getState();
    const asked = new Set(nodesAsking(requests, embeds).values());
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

  followEmbeddings();

  return {
    embeddings,
    getState: observable.getState,
    subscribe: observable.subscribe,
    drawn: ({ nodeIds, requests, ready = true }) => {
      followEmbeddings();
      followSpaces();
      drawnReady = ready;
      settleReads(requests, ready);
      const entries = embeddings.getState();
      const editing = editingMapEmbeds(entries);
      const drawnNow = new Set(nodeIds);
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
        // that ended because the node went selects nothing.
        const left = settled.get(nodeId);
        if (left !== undefined && drawnNow.has(nodeId)) select(left.resourceId);
      }
      // Only after the flushes above, which land a withdrawn embedding's
      // framing on the Map and Graph it last drew.
      drawnRequests = requests;
      dropStaleFraming();
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
    draft: (nodeId, framing) => {
      // A pan that no longer frames where it began draws nothing more.
      if (pans.get(nodeId) === null) return;
      setDraft(nodeId, framing);
    },
    frame: (nodeId, framing) => {
      const pan = pans.get(nodeId);
      pans.delete(nodeId);
      setDraft(nodeId, undefined);
      // A pan lands only where it began, as a pending zoom does.
      if (pan === null || (pan !== undefined && !stillFrames(nodeId, pan))) return;
      write(nodeId, framing);
    },
    zoom: (nodeId, framing) => {
      pendingZoom.set(nodeId, { framing, ...framedOn(nodeId) });
      setDraft(nodeId, framing);
      zoomTimers.get(nodeId)?.();
      zoomTimers.set(
        nodeId,
        schedule(() => {
          flushZoom(nodeId);
        }, ZOOM_QUIET_MS),
      );
    },
    beginPan: (nodeId) => {
      cancelZoom(nodeId);
      pans.set(nodeId, framedOn(nodeId));
    },
    publishCanvas: (nodeId, publication) => {
      update((state) => {
        const current = state.publications.get(nodeId);
        if (current === publication || (publication === null && current === undefined))
          return state;
        const publications = new Map(state.publications);
        if (publication === null) publications.delete(nodeId);
        else publications.set(nodeId, publication);
        return { ...state, publications };
      });
    },
    reportFooter: (nodeId, height) => {
      // A non-positive height is not a measured footer.
      if (height !== null && height <= 0) return;
      update((state) => {
        if (height === null ? !state.footers.has(nodeId) : state.footers.get(nodeId) === height)
          return state;
        const footers = new Map(state.footers);
        if (height === null) footers.delete(nodeId);
        else footers.set(nodeId, height);
        return { ...state, footers };
      });
    },
    setNotice: (nodeId, message, lifetime) => {
      const entry = embeddings.getState().get(nodeId);
      // An answer about an embedding since withdrawn or replaced says nothing
      // to the one drawn now.
      if (entry?.lifetime !== lifetime) return;
      saidUnder.set(nodeId, entry.lifetime);
      update((state) => {
        if ((state.notices.get(nodeId) ?? null) === message) return state;
        const notices = new Map(state.notices);
        if (message === null) notices.delete(nodeId);
        else notices.set(nodeId, message);
        return { ...state, notices };
      });
    },
    setRailEditing: (nodeId, editing) => {
      const entry = embeddings.getState().get(nodeId);
      if (editing && entry === undefined) return;
      if (entry !== undefined) saidUnder.set(nodeId, entry.lifetime);
      update((state) => {
        if (state.railEditing.has(nodeId) === editing) return state;
        const railEditing = new Set(state.railEditing);
        if (editing) railEditing.add(nodeId);
        else railEditing.delete(nodeId);
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
    follow: (next) => {
      select = next.select;
      if (next.claims !== claims) {
        claims = next.claims;
        for (const [nodeId, lend] of lent) {
          lend.giveBack();
          lent.set(nodeId, { drawing: lend.drawing, giveBack: claims.lend(lend.drawing) });
        }
      }
      if (next.spaces !== spaces) {
        const drawing = unsubscribeSpaces !== undefined;
        unsubscribeSpaces?.();
        unsubscribeSpaces = undefined;
        for (const key of [...requested.keys()]) release(key);
        spaces = next.spaces;
        const entries = spaces?.getState().composed ?? [];
        update((state) =>
          state.entries === entries && state.failures.size === 0
            ? state
            : { ...state, entries, failures: new Map() },
        );
        if (drawing) {
          followSpaces();
          settleReads(drawnRequests, drawnReady);
        }
      }
    },
    dispose: () => {
      for (const nodeId of [...pendingZoom.keys()]) flushZoom(nodeId, false);
      pans.clear();
      for (const lend of lent.values()) lend.giveBack();
      lent.clear();
      for (const key of [...requested.keys()]) release(key);
      unsubscribeSpaces?.();
      unsubscribeSpaces = undefined;
      unsubscribeEmbeddings?.();
      unsubscribeEmbeddings = undefined;
    },
  };
}
