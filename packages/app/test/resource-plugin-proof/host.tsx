/**
 * THROWAWAY (issue 01): a partial host for `./api` over the real composed
 * application — `composeApp`, Space Authoring's one `complete` door, the memory
 * session and the Space Resource lifecycle. What it fakes is named where it
 * does so: the asset store (a map in memory) and the translation between a
 * plugin's `/assets/` content and the stored shapes the core schemas still
 * parse (`/images/<id>` and Markdown `{ source }`), which issues 03 to 05 retire.
 */
import { createHash } from 'node:crypto';
import { Component, useSyncExternalStore, type ReactNode } from 'react';
import { COLLAPSED_RESOURCE_SIZE, type SpaceView, type UUID } from '@project/core';
import { createObservableState, type SpaceSession } from '@project/persistence';
import { describeAuthoringRefusal } from '../../src/authoring-refusal';
import type { ComposedApp } from '../../src/compose-app';
import {
  CANVAS,
  type AuthoringCompletion,
  type AuthoringResult,
  type DrawnCompletion,
  type QueuedSettlement,
} from '../../src/space-authoring';
import type { SpaceResourceAuthoring } from '../../src/space-resource-lifecycle';
import type {
  Answer,
  AssetRef,
  Assets,
  Claim,
  EmbedProps,
  Exclusive,
  Kept,
  New,
  OwnClaim,
  PluginView,
  Size,
  Surface,
} from './api';
import { blobBytes, isAssetRef } from './api';

export interface ProofSpace {
  readonly id: UUID;
  readonly session: SpaceSession;
  readonly app: ComposedApp;
}

interface ClaimNode {
  readonly parent: ClaimNode | null;
  child: ClaimNode | null;
  released: boolean;
}

export const REFUSED = {
  exclusive: 'Another change is running.',
  replaced: 'The Space was replaced.',
  unmounted: 'This Resource is no longer shown.',
  settled: 'That work has finished.',
  pressLost: 'The press was lost.',
} as const;

const ZERO = createHash('sha256').update(Buffer.alloc(0)).digest('base64url');

const answerOf = (result: Exclude<AuthoringResult, { kind: 'queued' }>): Answer => {
  switch (result.kind) {
    case 'completed':
      return 'completed';
    case 'unchanged':
      return 'unchanged';
    case 'refused':
      return { refused: describeAuthoringRefusal(result.refusal) };
  }
};
const settledAnswer = (settled: QueuedSettlement): Answer =>
  settled.kind === 'discarded-replaced'
    ? { refused: REFUSED.replaced }
    : settled.kind === 'discarded-failure'
      ? { refused: 'Something went wrong.' }
      : answerOf(settled);

export interface HostOptions {
  readonly spaces: readonly ProofSpace[];
  readonly plugins: readonly PluginView<never, never>[];
  /** The canvas's cap on a size hint: the visible canvas at the current zoom. */
  readonly cap?: Size;
  readonly spaceResources?: SpaceResourceAuthoring;
}

export function createProofHost({ spaces, plugins, cap, spaceResources }: HostOptions) {
  const state = createObservableState({ exclusive: false, version: 0 }, (error) => {
    throw error;
  });
  const bump = (exclusive = state.getState().exclusive) =>
    state.publish({ exclusive, version: state.getState().version + 1 });
  let active: ClaimNode | null = null;
  const bytes = new Map<string, Blob>([[ZERO, new Blob([])]]);
  const sources = new Map<string, string>();
  let inPress = false;
  let nextPick: File[] = [];
  const reported: string[] = [];
  const commitLog: { readonly kind: string; readonly answer: Answer }[] = [];

  const hashOf = (buffer: Buffer) => createHash('sha256').update(buffer).digest('base64url');
  /** Synchronous registration of a stored Markdown source as an asset (the fake half). */
  const registerText = (source: string): AssetRef => {
    const hash = hashOf(Buffer.from(source, 'utf8'));
    bytes.set(hash, new Blob([source], { type: 'text/markdown' }));
    sources.set(hash, source);
    return `/assets/${hash}`;
  };
  let storeHold: Promise<void> | null = null;
  const probe = new Map<string, Surface<unknown, unknown>>();
  const store = async (blob: Blob): Promise<AssetRef | { refused: string }> => {
    if (storeHold !== null) await storeHold;
    const buffer = Buffer.from(await blobBytes(blob));
    const hash = hashOf(buffer);
    bytes.set(hash, blob);
    if (blob.type.startsWith('text/')) sources.set(hash, buffer.toString('utf8'));
    return `/assets/${hash}`;
  };
  const assetsBase = {
    url: (ref: string) => ref,
    read: (ref: string): Promise<Blob | { refused: string }> => {
      const blob = isAssetRef(ref) ? bytes.get(ref.slice('/assets/'.length)) : undefined;
      return Promise.resolve(blob ?? { refused: 'That file is not here.' });
    },
  };
  const pick = (accept: string): Promise<File[]> => {
    void accept;
    if (!inPress) return Promise.reject(new Error(REFUSED.pressLost));
    const files = nextPick;
    nextPick = [];
    return Promise.resolve(files);
  };

  const spaceById = (id: string) => {
    const found = spaces.find((space) => space.id === id);
    if (found === undefined) throw new Error(`No proof Space ${id}`);
    return found;
  };
  const pluginFor = (kind: string) => plugins.find((plugin) => plugin.kind === kind);

  // ---- stored shape <-> plugin shape (the fake half; issues 03-05 retire it)
  const toPluginContent = (kind: string, content: unknown): unknown => {
    if (kind === 'markdown') return { text: registerText((content as { source: string }).source) };
    if (kind === 'image') {
      const { url, naturalSize } = content as { url: string; naturalSize?: Size };
      const asset = url.startsWith('/images/') ? `/assets/${url.slice('/images/'.length)}` : url;
      return naturalSize === undefined ? { url: asset } : { url: asset, naturalSize };
    }
    return content;
  };
  const toStoredContent = (kind: string, content: unknown): unknown => {
    if (kind === 'markdown') {
      const ref = (content as { text: string }).text;
      return { source: sources.get(ref.slice('/assets/'.length)) ?? '' };
    }
    if (kind === 'image') {
      const { url, naturalSize } = content as { url: string; naturalSize?: Size };
      const stored = isAssetRef(url) ? `/images/${url.slice('/assets/'.length)}` : url;
      return naturalSize === undefined ? { url: stored } : { url: stored, naturalSize };
    }
    return content;
  };

  /** One door: the real `complete`, settling a queued completion when it drains. */
  const completeVia = (
    space: ProofSpace,
    mapId: string | null,
    completion: AuthoringCompletion,
  ): Promise<Answer> =>
    new Promise((resolve) => {
      const result =
        mapId === null
          ? space.app.authoring.complete(CANVAS, completion, (s) => resolve(settledAnswer(s)))
          : space.app.authoring.complete(
              { kind: 'drawn', mapId: mapId as never, graphId: null },
              completion as DrawnCompletion,
              (s) => resolve(settledAnswer(s)),
            );
      if (result.kind !== 'queued') resolve(answerOf(result));
    }).then((answer) => {
      commitLog.push({ kind: completion.kind, answer: answer as Answer });
      return answer as Answer;
    });

  interface SurfaceOptions {
    readonly space: ProofSpace;
    readonly resourceId: string;
    readonly mapId: string | null;
    readonly parentClaim: ClaimNode | null;
    /** Authoring this surface offers at all (the Stage and an unentered embedding offer none). */
    readonly authoring: boolean;
    /** A Reference's own Title, passed to its Target. */
    readonly title?: Kept<string>;
    /** Whether this surface may author the Resource's content and Map content. */
    readonly ownsResource: boolean;
    readonly epoch: number;
    readonly mounted: () => boolean;
    readonly selected?: boolean;
    readonly held: Set<ClaimNode>;
  }

  const buildSurface = (options: SurfaceOptions, Embed: Surface<unknown, unknown>['Embed']) => {
    const { space, resourceId, mapId, epoch } = options;
    const working = space.session.getState().working;
    const stored = working.resources.find((resource) => resource.id === resourceId);
    if (stored === undefined) return undefined;
    const plugin = pluginFor(stored.document.kind);
    const kind = stored.document.kind;
    const map = working.document.maps?.find((each) => each.id === mapId);
    const entry = map?.positions[resourceId];
    const exclusive = state.getState().exclusive;

    /** Why a retained (not `own`) commit made now is refused, or null. */
    const retainedRefusal = (asOwn: boolean): string | null => {
      if (!options.mounted()) return REFUSED.unmounted;
      if (space.app.authoring.getState().replacementEpoch !== epoch) return REFUSED.replaced;
      if (!asOwn && state.getState().exclusive) return REFUSED.exclusive;
      return null;
    };
    const guarded =
      <T,>(asOwn: boolean, run: (next: T) => Promise<Answer>) =>
      (next: T): Promise<Answer> => {
        const refusal = retainedRefusal(asOwn);
        return refusal === null ? run(next) : Promise.resolve({ refused: refusal });
      };
    const current = () => {
      const now = space.session.getState().working.resources.find((r) => r.id === resourceId);
      if (now === undefined) throw new Error('Resource gone');
      return now.document;
    };
    const titleCommit = (asOwn: boolean) =>
      guarded<string>(asOwn, (next) =>
        completeVia(space, mapId, {
          kind: 'edited-resource',
          resourceId: resourceId as never,
          document: { ...current(), title: next } as never,
        }),
      );
    const contentCommit = (asOwn: boolean) =>
      guarded<unknown>(asOwn, (next) =>
        completeVia(space, mapId, {
          kind: 'edited-resource',
          resourceId: resourceId as never,
          document: { ...current(), content: toStoredContent(kind, next) } as never,
        }),
      );
    const mapCommit =
      (asOwn: boolean) =>
      (next: unknown, hint?: { sizeHint?: Size }): Promise<Answer> => {
        const refusal = retainedRefusal(asOwn);
        if (refusal !== null || mapId === null) {
          return Promise.resolve({ refused: refusal ?? 'No Map here.' });
        }
        const open = (next as { open?: boolean }).open === true;
        if (!open) return completeVia(space, mapId, { kind: 'closed-resource', resourceId: resourceId as never });
        const sizeHint = hint?.sizeHint;
        if (sizeHint === undefined) {
          return completeVia(space, mapId, { kind: 'opened-resource', resourceId: resourceId as never });
        }
        // The canvas caps the hint at the visible canvas; the Edit floors it.
        const limit = cap ?? { width: Infinity, height: Infinity };
        return completeVia(space, mapId, {
          kind: 'opened-resource-to-fit',
          resourceId: resourceId as never,
          size: {
            width: Math.round(Math.min(limit.width, sizeHint.width)),
            height: Math.round(Math.min(limit.height, sizeHint.height)),
          },
        });
      };

    const offers = options.authoring && !exclusive;
    const resource = {
      id: resourceId,
      title: stored.document.title,
      kind,
      content: toPluginContent(kind, stored.document.content),
    };
    const ownTitle: Kept<string> = offers
      ? { value: resource.title, commit: titleCommit(false) }
      : { value: resource.title };
    // A Reference's Title Kept is passed through whole: whatever it offered, as
    // the Reference's own surface re-renders, is what the Target gets.
    const title = options.title ?? ownTitle;
    const content: Kept<unknown> =
      offers && options.ownsResource
        ? { value: resource.content, commit: contentCommit(false) }
        : { value: resource.content };
    const mapDefault = plugin?.mapContent.default ?? {};
    const mapValue =
      mapId === null
        ? (plugin?.mapContent.withoutMap ?? mapDefault)
        : entry?.open === undefined
          ? mapDefault
          : { ...(mapDefault as object), open: entry.open };
    const hasMapState = Object.keys(mapDefault as object).length > 0;
    const mapKept =
      offers && options.ownsResource && mapId !== null && hasMapState
        ? { value: mapValue, commit: mapCommit(false) }
        : { value: mapValue };

    const assets: Assets = offers
      ? { ...assetsBase, pick, store }
      : { ...assetsBase };

    const claim =
      options.authoring && options.ownsResource
        ? (): OwnClaim<unknown, unknown> | undefined => {
            const parent = options.parentClaim;
            if (active !== parent) return undefined;
            const node: ClaimNode = { parent, child: null, released: false };
            if (parent !== null) parent.child = node;
            active = node;
            options.held.add(node);
            bump();
            const release = (): boolean => {
              if (node.released) return true;
              if (node.child !== null && !node.child.released) return false;
              node.released = true;
              options.held.delete(node);
              if (parent !== null) parent.child = null;
              active = parent;
              bump();
              return true;
            };
            const handle: OwnClaim<unknown, unknown> = {
              release,
              exclusively: async <T,>(work: (own: Exclusive<unknown, unknown>) => Promise<T>) => {
                if (state.getState().exclusive) return 'busy' as const;
                bump(true);
                let live = true;
                const whileLive =
                  <A extends unknown[], R>(f: (...args: A) => Promise<R>) =>
                  (...args: A): Promise<R | { refused: string }> =>
                    live ? f(...args) : Promise.resolve({ refused: REFUSED.settled });
                const own: Exclusive<unknown, unknown> = {
                  title: whileLive(titleCommit(true)) as never,
                  content: whileLive(contentCommit(true)) as never,
                  map: hasMapState ? (whileLive(mapCommit(true)) as never) : undefined,
                  store: whileLive(store) as never,
                };
                try {
                  return await work(own);
                } finally {
                  live = false;
                  bump(false);
                }
              },
            };
            claimNodes.set(handle, node);
            return handle;
          }
        : undefined;

    const size =
      mapId === null
        ? COLLAPSED_RESOURCE_SIZE
        : (entry?.size ?? COLLAPSED_RESOURCE_SIZE);
    const surface: Surface<unknown, unknown> = {
      resource,
      title,
      content,
      map: mapKept as Surface<unknown, unknown>['map'],
      size,
      selected: options.selected ?? false,
      assets,
      Embed,
      ...(claim === undefined ? {} : { claim }),
    };
    return { surface, plugin, ownTitle };
  };

  const subscribeAll = (listener: () => void) => {
    const offs = [state.subscribe(listener), ...spaces.map((s) => s.app.authoring.subscribe(listener))];
    return () => offs.forEach((off) => off());
  };
  const versionOf = () =>
    `${state.getState().version}:${spaces.map((s) => `${s.app.authoring.getState().replacementEpoch}/${s.session.getState().working === undefined ? 0 : 1}`).join(',')}:${spaces.map((s) => JSON.stringify(s.session.getState().working).length).join(',')}`;

  class Boundary extends Component<{ children: ReactNode; label: string }, { failed: boolean }> {
    override state = { failed: false };
    static getDerivedStateFromError() {
      return { failed: true };
    }
    override render() {
      return this.state.failed ? <p role="note">{this.props.label} could not be drawn.</p> : this.props.children;
    }
  }

  function ResourceSurface(props: Omit<SurfaceOptions, 'epoch' | 'mounted' | 'held'>) {
    useSyncExternalStore(subscribeAll, versionOf);
    const epoch = props.space.app.authoring.getState().replacementEpoch;
    // Keyed by Replacement epoch: a replaced working Space remounts the plugin.
    return <Mounted key={`${props.resourceId}:${epoch}`} {...props} epoch={epoch} />;
  }

  function Mounted(props: Omit<SurfaceOptions, 'mounted' | 'held'>) {
    useSyncExternalStore(subscribeAll, versionOf);
    const box = useBox();
    const options: SurfaceOptions = { ...props, mounted: () => box.mounted, held: box.held };
    // One Embed per mounted surface: a fresh component type per render would
    // remount (and so release) everything drawn inside it.
    const { space, parentClaim, authoring } = props;
    const Embed = useMemo(
      () =>
        function Embed(embed: EmbedProps) {
          if ('resource' in embed) {
            return (
              <ResourceSurface
                space={space}
                resourceId={embed.resource}
                mapId={null}
                parentClaim={parentClaim}
                authoring={authoring}
                ownsResource={false}
                title={embed.title}
              />
            );
          }
          return <MapSurface view={embed.map} claim={embed.claim ?? null} />;
        },
      [space, parentClaim, authoring],
    );
    const built = buildSurface(options, Embed);
    if (built === undefined) return <p role="note">Deleted.</p>;
    const { surface, plugin } = built;
    probe.set(`${props.resourceId}@${props.mapId ?? 'none'}${props.title === undefined ? '' : ':embedded'}${props.authoring ? '' : ':inert'}`, surface);
    if (plugin === undefined) return <p role="note">No plugin for {surface.resource.kind}.</p>;
    const View = plugin.View as (p: { surface: Surface<unknown, unknown> }) => ReactNode;
    return (
      <Boundary label={surface.resource.title}>
        <View surface={surface} />
      </Boundary>
    );
  }

  type ClaimHandle = Claim;
  /** A Map embedding: authoring offered only inside a Claim the embedder holds. */
  function MapSurface({ view, claim }: { view: SpaceView; claim: ClaimHandle | null }) {
    useSyncExternalStore(subscribeAll, versionOf);
    const space = spaceById(view.spaceId);
    const map = space.session.getState().working.document.maps?.find((m) => m.id === view.map);
    const node = claim === null ? null : (claimNodes.get(claim) ?? null);
    return (
      <div data-testid={`embedded:${view.spaceId}`}>
        {Object.keys(map?.positions ?? {}).map((resourceId) => (
          <ResourceSurface
            key={resourceId}
            space={space}
            resourceId={resourceId}
            mapId={view.map}
            parentClaim={node}
            authoring={node !== null}
            ownsResource
          />
        ))}
      </div>
    );
  }

  // Claims handed out are tied back to their node so an Embed can nest under one.
  const claimNodes = new WeakMap<Claim, ClaimNode>();

  function useBox() {
    const [box] = useStateOnce(() => ({ mounted: true, held: new Set<ClaimNode>() }));
    useEffectOnce(() => {
      box.mounted = true;
      return () => {
        box.mounted = false;
        // Unmount releases, innermost first.
        for (const node of [...box.held].reverse()) {
          node.released = true;
          if (node.parent !== null) node.parent.child = null;
          if (active === node) active = node.parent;
        }
        box.held.clear();
      };
    });
    return box;
  }

  function CanvasMap({ spaceId, mapId, selected }: { spaceId: string; mapId: string; selected?: string }) {
    useSyncExternalStore(subscribeAll, versionOf);
    const space = spaceById(spaceId);
    const map = space.session.getState().working.document.maps?.find((m) => m.id === mapId);
    return (
      <div data-testid={`canvas:${spaceId}`}>
        {Object.keys(map?.positions ?? {}).map((resourceId) => (
          <ResourceSurface
            key={resourceId}
            space={space}
            resourceId={resourceId}
            mapId={mapId}
            parentClaim={null}
            authoring
            ownsResource
            selected={selected === resourceId}
          />
        ))}
      </div>
    );
  }

  /** The Stage: the same plugin, on a surface offering no authoring. */
  function Stage({ spaceId, resourceId }: { spaceId: string; resourceId: string }) {
    return (
      <ResourceSurface
        space={spaceById(spaceId)}
        resourceId={resourceId}
        mapId={null}
        parentClaim={null}
        authoring={false}
        ownsResource
      />
    );
  }

  /** A press: what `run` and rail actions are called inside, so a picker may open. */
  const press = <T,>(gesture: () => T): T => {
    inPress = true;
    try {
      return gesture();
    } finally {
      inPress = false;
    }
  };

  /** Dock creation: the plugin's `run`, called in the press, with the host's `create`. */
  const create = (
    space: ProofSpace,
    mapId: string,
    plugin: PluginView<never, never>,
  ): Promise<void> => {
    const creates = plugin.creates;
    if (creates === undefined) throw new Error('not creatable');
    const host = {
      assets: { ...assetsBase, pick, store } as Assets,
      create: async (items: New<unknown>[]): Promise<Answer> => {
        const answer = await createItems(space, mapId, plugin.kind, items);
        if (typeof answer !== 'string') reported.push(answer.refused);
        return answer;
      },
    };
    return Promise.resolve(press(() => creates.run(host as never, undefined)));
  };

  const createItems = async (
    space: ProofSpace,
    mapId: string,
    kind: string,
    items: New<unknown>[],
  ): Promise<Answer> => {
    if (state.getState().exclusive) return { refused: REFUSED.exclusive };
    if (items.some((item) => item.newSpace === true)) {
      // The new Space's lifetime is the host's (ADR 0074): the coordinated
      // lifecycle creates the Space and the Resource in one Edit across both.
      if (items.length !== 1 || spaceResources === undefined) {
        return { refused: 'Only one new Space at a time.' };
      }
      const [item] = items;
      const result = await spaceResources.create({
        containingSpaceId: space.id,
        mapId: mapId as never,
        title: item?.title ?? 'Space 1',
        position: { x: 0, y: 0 },
      });
      return result.kind === 'completed' ? 'completed' : { refused: result.kind };
    }
    if (kind === 'image') {
      return completeVia(space, mapId, {
        kind: 'created-images',
        images: items.map((item) => ({ url: (toStoredContent('image', item.content) as { url: string }).url })),
        anchor: { x: 0, y: 0 },
        placement: 'avoidingOverlap',
      });
    }
    return { refused: 'not built in the proof' };
  };

  return {
    state,
    CanvasMap,
    Stage,
    press,
    create,
    createItems,
    registerText,
    setNextPick: (files: File[]) => {
      nextPick = files;
    },
    activeClaim: () => active,
    probe,
    holdStores: (hold: Promise<void> | null) => {
      storeHold = hold;
    },
    reported,
    commitLog,
    zeroAsset: `/assets/${ZERO}` as AssetRef,
  };
}

// Small hooks kept local so the harness reads top-down.
import { useEffect, useMemo, useState } from 'react';
function useStateOnce<T>(init: () => T) {
  return useState(init);
}
function useEffectOnce(effect: () => void | (() => void)) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(effect, []);
}
