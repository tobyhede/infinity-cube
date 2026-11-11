import { httpAssetClient, HttpSpaceBackend, productAddress } from '@project/http';
import { loadSpaceSnapshot, type Space } from '@project/graph';
import { newUuid, type AssetRef, type UUID } from '@project/core';
import type { AssetClient, AssetRefusal, SpaceBackend } from '@project/persistence';
import type { Assets } from '@project/resource-api/view';
import { displayImageAsAuthored, type ImageDisplay } from '@project/ui';
import type { HistoryApi } from './browser-location';
import { createBrowserHistory } from './browser-history';
import { describeAssetRefusal } from './authoring-refusal';
import { pickFilesInBrowser } from './browser-file-picker';
import { measurePictureInBrowser } from './browser-picture-measure';
import type { Fullscreen } from './presenting-fullscreen';
import type { PresentationLinks } from './presentation-link';
import type { ApplicationStartupResult } from './startup';
import { createNotesWindow } from './notes-window';
import { createOpenSpaces, type OpenSpaces } from './open-spaces';

export type { OpenSpace } from './open-spaces';

export interface SpaceStartup {
  resolve(pathname: string): Promise<ApplicationStartupResult>;
}

/**
 * The one adapter over the real browser (ADR 0081).
 *
 * The native history adapter lives in `browser-history.ts`; everything above this takes
 * {@link HistoryApi}, which is what makes the rules that decide a history entry
 * testable without a DOM.
 */
const browserHistory = (): HistoryApi => createBrowserHistory(window);

/** What the asset store answers a read or a store: the bytes, their reference, or a refusal. */
type AssetAnswer = Blob | AssetRef | AssetRefusal;
interface AssetRefusal {
  readonly refused: string;
}

const isRefusal = (answer: Blob | AssetRef | AssetRefusal): answer is AssetRefusal =>
  typeof answer === 'object' && 'refused' in answer;

/** A store's answer with its refusal worded, as every refusal a plugin reads is (ADR 0057). */
const worded = <T extends Blob | AssetRef>(answer: T | AssetRefusal): T | WordedRefusal =>
  isRefusal(answer) ? { refused: describeAssetRefusal(answer.refused) } : answer;

/**
 * The asset store as a Resource plugin's surface reaches it (ADR 0142): the
 * client's `url`, `read` and `store`, each refusal worded by
 * `describeAssetRefusal`, the browser's own file picker, and `measure`, the
 * browser loading a picture to size it unless a caller supplies its own
 * (ADR 0109). A host hands on only `url` and `read` where its Resource is not
 * authored.
 */
export const browserPluginAssets = (
  assets: AssetClient,
  measure: NonNullable<Assets['measure']> = measurePictureInBrowser,
): Assets => ({
  url: (ref) => assets.url(ref),
  read: async (ref) => worded(await assets.read(ref)),
  store: async (bytes) => worded(await assets.store(bytes)),
  pick: async (accept) => [...(await pickFilesInBrowser(document, accept))],
  measure,
});

/**
 * Compose browser startup around one fixed persistence backend.
 *
 * `fullscreen` and `presentations` are required with no default: `main.tsx`
 * names `document`, `window` and `BroadcastChannel` and hands each to its one
 * adapter, and a test supplies hosts of its own.
 *
 * The other four seams default together and for one reason: this is the composition
 * root, and it is where the ambient browser, the ambient generator and the real
 * transport — for Spaces and for assets — are named. Everything below takes each of them required.
 *
 * `session.mounted` says the session is Mounting an aggregate (ADR 0130), so
 * every Space it opens marks its Edits as lost on reload (ADR 0131). It is
 * named rather than positional, and defaults to `false`: only a mount
 * composition sets it. `session.assets` is the asset store a Resource plugin
 * reaches, the host's by default and the in-page store in a mount.
 */
export const createSpaceStartup = (
  fullscreen: Fullscreen,
  presentations: PresentationLinks,
  backend: SpaceBackend = new HttpSpaceBackend(),
  newId: () => UUID = newUuid,
  history: HistoryApi = browserHistory(),
  displayImage: ImageDisplay = displayImageAsAuthored,
  {
    mounted = false,
    assets = httpAssetClient(new HttpSpaceBackend()),
  }: { readonly mounted?: boolean; readonly assets?: AssetClient } = {},
): SpaceStartup => {
  const pluginAssets = browserPluginAssets(assets);
  let owner: Promise<OpenSpaces> | undefined;
  const openSpaces = (): Promise<OpenSpaces> => {
    if (owner !== undefined) return owner;
    const opening = backend.loadAggregate().then((result) => {
      if (result.kind === 'uninitialized')
        throw new Error('The Space repository is uninitialized.');
      const { metaSpaceId, spaces } = result.aggregate;
      const meta = spaces.find(({ snapshot }) => snapshot.id === metaSpaceId);
      if (meta === undefined) throw new Error('The loaded aggregate does not hold its Meta Space.');
      return createOpenSpaces({
        backend,
        metaSpaceId,
        metaSpaceTitle: meta.snapshot.document.title,
        newId,
        history,
        fullscreen,
        presentations,
        mounted,
      });
    });
    owner = opening;
    // A failed attempt is not the owner. Retaining the rejected promise would
    // answer every later startup with the first transport error, so the memo
    // holds only an owner that exists.
    void opening.catch(() => {
      if (owner === opening) owner = undefined;
    });
    return opening;
  };
  return {
    resolve: async (pathname) => {
      const address = productAddress(pathname);
      if (address.kind === 'addressed' && address.destination.kind === 'notes') {
        const { spaceId } = address.destination;
        const load = async (): Promise<Space | undefined> => {
          const loaded = await backend.loadSpace(spaceId);
          if (loaded === undefined) return undefined;
          const read = loadSpaceSnapshot(loaded.snapshot);
          if (!read.ok) throw new Error(read.errors.map((error) => error.message).join('; '));
          return read.space;
        };
        const space = await load();
        if (space === undefined) throw new Error('The product URL does not resolve.');
        return {
          kind: 'notes',
          notes: createNotesWindow({
            spaceId,
            space,
            reload: load,
            links: presentations,
            reportObserverError: (error) => console.error('Notes window observer failed', error),
          }),
          now: presentations.now,
          assets: pluginAssets,
        };
      }
      const spaces = await openSpaces();
      const { opened, opening } = await spaces.openPath(pathname);
      return {
        kind: 'opened',
        opened,
        spaces,
        opening,
        assets: pluginAssets,
      };
    },
  };
};
