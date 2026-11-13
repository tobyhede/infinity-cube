import { isOfKind, uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import type { SpaceSession } from '@project/persistence';
import { useCallback, useState, useSyncExternalStore } from 'react';
import { Application } from '#components/Application';
import type { Assets } from '@project/resource-api/view';
import type { AssetRef } from '@project/resource-api/domain';
import { pickFilesInBrowser } from '#src/browser-file-picker';
import { storyOpening, storySpaces } from './application';
import {
  authoredSnapshot,
  commandDockSnapshot,
  deepDiveSnapshot,
  designSystemSnapshot,
  metaSnapshot,
  platformSnapshot,
  spaceResourceDocument,
  traversalSnapshot,
} from './spaces';

const REPLACE_ID_BASE = 0x9a0;

const replaceId = (offset: number): UUID =>
  uuidSchema.parse(
    `00000000-0000-4000-8000-${(REPLACE_ID_BASE + offset).toString(16).padStart(12, '0')}`,
  );

const PICTURES_MAP = replaceId(0);
const PICTURES_GRAPH = replaceId(1);
const FIGURE = replaceId(2);
const MISSING = replaceId(3);
const PICTURES_REFERENCE = replaceId(4);

/** The Figure's picture, which the catalogue test serves. */
export const REPLACE_FIGURE_URL = 'https://example.com/figure.png';
/** A picture under a name that never resolves, so its Resource draws its failed state. */
export const REPLACE_MISSING_URL = 'https://missing.invalid/picture.png';
/** The reference the catalogue's asset store answers every stored picture with. */
export const REPLACE_STORED_URL: AssetRef = '/assets/LXEWQrcmsEQBYnyp-6wy9chTD7GQPMTbAiWHF5IaSIE';

/**
 * An Image Resource at the Closed Size, joined by an Edge to a resized one
 * whose picture will not load.
 */
export const picturesSnapshot: SpaceSnapshot = {
  id: replaceId(0xf),
  document: {
    version: 1,
    title: 'Pictures',
    defaultMap: PICTURES_MAP,
    maps: [
      {
        id: PICTURES_MAP,
        title: 'Pictures',
        kind: 'positioned',
        positions: {
          [FIGURE]: { x: 0, y: 0 },
          [MISSING]: { x: 360, y: 0, size: { width: 460, height: 380 } },
        },
        graphs: [{ id: PICTURES_GRAPH, title: 'Main', edges: [{ from: FIGURE, to: MISSING }] }],
        activeGraph: PICTURES_GRAPH,
      },
    ],
  },
  resources: [
    {
      id: FIGURE,
      document: {
        title: 'Figure',
        kind: 'image',
        content: { url: REPLACE_FIGURE_URL, naturalSize: { width: 400, height: 300 } },
      },
    },
    {
      id: MISSING,
      document: { title: 'Missing', kind: 'image', content: { url: REPLACE_MISSING_URL } },
    },
  ],
};

/**
 * The catalogue has no host, so its asset store answers one reference for any
 * bytes, after a bounded delay that lets the catalogue see a Replace in
 * flight: what Replace does with the answer is production's.
 */
const replaceAssets: Assets = {
  url: (ref) => ref,
  read: () => Promise.resolve({ refused: 'The catalogue reads no asset.' }),
  store: async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return REPLACE_STORED_URL;
  },
  pick: async (accept) => [...(await pickFilesInBrowser(document, accept))],
};

/** Open the Pictures Space through the real session owner. */
async function openReplaceImageStory() {
  const meta = {
    ...metaSnapshot,
    resources: [
      ...metaSnapshot.resources,
      {
        id: PICTURES_REFERENCE,
        document: spaceResourceDocument('Pictures', picturesSnapshot),
      },
    ],
  };
  const spaces = storySpaces(meta.id, [
    meta,
    platformSnapshot,
    designSystemSnapshot,
    commandDockSnapshot,
    authoredSnapshot,
    traversalSnapshot,
    deepDiveSnapshot,
    picturesSnapshot,
  ]);
  return { ...storyOpening(spaces, await spaces.open(picturesSnapshot.id)), assets: replaceAssets };
}

/** Read-only evidence from the production session, outside the application surface. */
function RevisionEvidence({ session }: { readonly session: SpaceSession }) {
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const figure = state.working.resources.find((resource) => resource.id === FIGURE)?.document;
  return (
    <output
      hidden
      data-testid="replacement-revision"
      data-persistence={state.persistence.kind}
      data-url={figure !== undefined && isOfKind(figure, 'image') ? figure.content.url : undefined}
    >
      {state.acknowledgedRevision.toString()}
    </output>
  );
}

/** Fixture setup and observation only; Application owns startup, commands and rendering. */
export function ReplaceImageFixture() {
  const [session, setSession] = useState<SpaceSession | null>(null);
  const resolve = useCallback(async () => {
    const opening = await openReplaceImageStory();
    setSession(opening.opened.session);
    return opening;
  }, []);
  return (
    <>
      <Application resolve={resolve} />
      {session !== null && <RevisionEvidence session={session} />}
    </>
  );
}
