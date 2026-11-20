import { createObservableState, type ObserverErrorReporter } from '@project/persistence';
import type { ResourceId } from '@project/core';
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

/** What a Map embedding asks of the canvas it is drawn on. */
export interface MapEmbeddingDependencies {
  /** Where an authored embedding's Claim is lent while it authors its Map. */
  readonly claims: Pick<PluginGate, 'lend'>;
  /** Selects a Resource on the canvas, as Done and Close leave it. */
  readonly select: (resourceId: ResourceId) => void;
  readonly reportObserverError?: ObserverErrorReporter;
}

/** The Map and Graph one placement's embedding is drawn with. */
export interface MapEmbeddingDrawnRequest {
  readonly parent: { readonly id: string };
  readonly mapId: string;
  readonly graphId: string;
}

/** What the canvas drew in one commit. */
export interface MapEmbeddingDrawn {
  /** The placements drawn, by node id. */
  readonly placements: readonly string[];
  /** The Map and Graph each embedding is drawn with, which a framing names where its plugin passed no Graph. */
  readonly requests: readonly MapEmbeddingDrawnRequest[];
}

export interface MapEmbeddingState {
  /** The placements whose embedded Map is authored in place, by node id. */
  readonly editing: ReadonlySet<string>;
  /** The framing being drawn on each placement's embedded Map, by node id, until it lands. */
  readonly drafts: ReadonlyMap<string, SpaceResourceFraming>;
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
  /** The canvas goes: every pending zoom lands, drafts kept, and every Claim is given back. */
  readonly dispose: () => void;
}

/** How long the wheel stays still before a zoom lands. */
export const ZOOM_QUIET_MS = 160;

const reportToConsole: ObserverErrorReporter = (error) =>
  console.error('A Map embedding observer failed', error);

const sameMembers = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean =>
  a.size === b.size && [...a].every((id) => b.has(id));

export function createMapEmbedding({
  claims,
  select,
  reportObserverError = reportToConsole,
}: MapEmbeddingDependencies): MapEmbedding {
  const embeddings = createMapEmbeddings(reportObserverError);
  const observable = createObservableState<MapEmbeddingState>(
    { editing: new Set(), drafts: new Map() },
    reportObserverError,
  );
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
  const unsubscribe = embeddings.subscribe(() => {
    const editing = editingMapEmbeds(embeddings.getState());
    const state = observable.getState();
    if (!sameMembers(editing, state.editing)) observable.publish({ ...state, editing });
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

  return {
    embeddings,
    getState: observable.getState,
    subscribe: observable.subscribe,
    drawn: ({ placements, requests }) => {
      drawnRequests = requests;
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
    dispose: () => {
      for (const placement of [...pendingZoom.keys()]) flushZoom(placement, false);
      for (const lend of lent.values()) lend.giveBack();
      lent.clear();
      unsubscribe();
    },
  };
}
