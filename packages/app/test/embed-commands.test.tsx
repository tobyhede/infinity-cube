import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { newUuid, uuidSchema, type ResourceId, type SpaceSnapshot } from '@project/core';
import { MemorySpaceBackend } from '@project/persistence';
import { bareKindData, type ResourceFlowNode } from '@project/react-flow-adapter';
import { ResourceRailActions, type MapEmbedRequest } from '@project/ui';
import type { Continuation } from '../src/continuation';
import {
  decorateEmbedCommands,
  READING_SPACE_NOTE,
  type EmbedCommandsContext,
} from '../src/embed-commands';
import type { MapEmbedEntry } from '../src/map-embeddings';
import { createOpenSpaces } from '../src/open-spaces';
import { RESOURCE_SIZE } from '../src/resource';
import type { SpaceResourceTarget } from '../src/space-resource-lifecycle';
import { recordingHistory } from './browser-history';
import { refusingFullscreen } from './fullscreen';
import { unlinkedPresentations } from './presentations';
import { fixtureFacts } from './render-adapter-fixtures';

beforeAll(() => {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
});

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const EMBEDDING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const TARGET_SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');
const FIRST_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000009');
const FIRST_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000a');
const SECOND_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000b');
const SECOND_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000c');
const OTHER_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000d');
const OTHER_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000e');

const target: SpaceResourceTarget = {
  id: TARGET_SPACE_ID,
  title: 'Architecture',
  defaultMap: SECOND_MAP_ID,
  maps: [
    {
      id: FIRST_MAP_ID,
      title: 'Collection 1',
      graphs: [{ id: FIRST_GRAPH_ID, title: 'Overview', color: '#1f77b4', headShape: 'arrow' }],
    },
    {
      id: SECOND_MAP_ID,
      title: 'Collection 2',
      graphs: [{ id: SECOND_GRAPH_ID, title: 'Detail', color: '#ff7f0e', headShape: 'dot' }],
    },
  ],
};

/** Never spent: `spaces` is null, so no shown-Space command reads it. */
const continuation: Continuation = {
  getState: () => ({ pending: null }),
  subscribe: () => () => undefined,
  request: () => undefined,
  take: () => undefined,
  dispose: () => undefined,
};

/** A drawn Resource of `kind`, which an embedding's commands never look at. */
const node = (
  kind: 'markdown' | 'reference' | 'space' | 'ur',
  readOnly = false,
): ResourceFlowNode => ({
  id: EMBEDDING_ID,
  type: 'resource',
  position: { x: 0, y: 0 },
  width: RESOURCE_SIZE.width,
  height: RESOURCE_SIZE.height,
  data: {
    shape: 'rectangle',
    resourceId: EMBEDDING_ID,
    title: 'A',
    readOnly,
    ...bareKindData(kind),
    ...fixtureFacts(kind, true),
    selectedForAuthoring: false,
    activeGraphId: null,
    activeGraphColor: '#8a94a6',
    borderColor: null,
    receding: false,
  },
});

const choosing = { map: FIRST_MAP_ID, graph: FIRST_GRAPH_ID };

/** What a plugin passed `<Embed space>`, published for its rect. */
const embedded = (request: Partial<MapEmbedRequest> = {}): ReadonlyMap<string, MapEmbedEntry> =>
  new Map([
    [
      EMBEDDING_ID,
      {
        resourceId: EMBEDDING_ID,
        request: {
          space: TARGET_SPACE_ID,
          view: choosing,
          select: { value: choosing, commit: () => Promise.resolve('completed') },
          claim: undefined,
          ...request,
        },
      },
    ],
  ]);

const context = (overrides: Partial<EmbedCommandsContext> = {}): EmbedCommandsContext => ({
  authorOnCanvas: true,
  editableResourceIds: new Set<ResourceId>([EMBEDDING_ID]),
  continuation,
  containingSpaceId: SPACE_ID,
  spaceResourceTargets: new Map([[TARGET_SPACE_ID, target]]),
  spaces: null,
  commandOutcomes: undefined,
  deleteConfirmation: undefined,
  mapEmbeds: embedded(),
  contextNotices: new Map(),
  onContextEditingChange: () => undefined,
  onContextReport: () => undefined,
  ...overrides,
});

const railOf = (decorated: ResourceFlowNode) => decorated.data.kindOperations.mapRail;

const mountRail = (decorated: ResourceFlowNode) =>
  render(<ResourceRailActions aria-label="Resource rail">{railOf(decorated)}</ResourceRailActions>);

describe('decorateEmbedCommands', () => {
  it('leaves a Resource that embeds no Space as it is', () => {
    const drawn = node('space');
    expect(decorateEmbedCommands(drawn, context({ mapEmbeds: new Map() }))).toBe(drawn);
  });

  it('leaves a read-only Resource as it is', () => {
    const drawn = node('space', true);
    expect(decorateEmbedCommands(drawn, context())).toBe(drawn);
  });

  it('offers no chooser where the plugin passed no view to choose from', () => {
    const drawn = node('space');
    expect(
      decorateEmbedCommands(drawn, context({ mapEmbeds: embedded({ select: undefined }) })),
    ).toBe(drawn);
  });

  it('offers the chooser wherever a commit is passed, whatever the kind', () => {
    for (const kind of ['space', 'markdown', 'ur'] as const) {
      expect(railOf(decorateEmbedCommands(node(kind), context()))).toBeDefined();
    }
  });

  it("chooses on the view's Map, its Graph the Map's opening one where the view names none", () => {
    mountRail(
      decorateEmbedCommands(
        node('space'),
        context({
          mapEmbeds: embedded({
            view: { map: SECOND_MAP_ID },
            select: { value: { map: SECOND_MAP_ID }, commit: () => Promise.resolve('completed') },
          }),
        }),
      ),
    );
    expect(screen.getByRole('button', { name: 'Map: Collection 2' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Graph: Detail' })).toBeEnabled();
  });

  it('says the Space is being read in place of the chooser while it is unread', () => {
    const decorated = decorateEmbedCommands(
      node('space'),
      context({ spaceResourceTargets: new Map() }),
    );
    expect(railOf(decorated)).toBeUndefined();
    expect(decorated.data.kindOperations.mapNote).toBe(READING_SPACE_NOTE);
  });

  it('carries a context notice once the chooser is drawn', () => {
    const decorated = decorateEmbedCommands(
      node('space'),
      context({ contextNotices: new Map([[EMBEDDING_ID, 'Link copied.']]) }),
    );
    expect(decorated.data.contextNotice).toBe('Link copied.');
  });

  it('draws the chooser disabled while the plugin passes no commit, so the choice is withdrawn, not gone', () => {
    const decorated = decorateEmbedCommands(
      node('space'),
      context({ mapEmbeds: embedded({ select: { value: choosing } }) }),
    );
    const { unmount } = mountRail(decorated);
    expect(screen.getByRole('button', { name: 'Map: Collection 1' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Graph: Overview' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    unmount();
  });

  it('offers nothing to author under a Claim without a commit to choose through', () => {
    mountRail(
      decorateEmbedCommands(
        node('space'),
        context({
          mapEmbeds: embedded({ select: { value: choosing }, claim: { release: () => true } }),
        }),
      ),
    );
    expect(screen.getByRole('button', { name: 'Map: Collection 1' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('leaves a Resource showing content not its own as it is where no commit is passed', () => {
    // As a Reference to a Space Resource, whose embedded surface authors nothing.
    const drawn = node('reference');
    expect(drawn.data.authorsContent).toBe(false);
    expect(
      decorateEmbedCommands(
        drawn,
        context({ mapEmbeds: embedded({ select: { value: choosing } }) }),
      ),
    ).toBe(drawn);
  });
});

/** The shown Space, read into a composition, as a Claim's authoring reaches it. */
const shownSpace: SpaceSnapshot = {
  id: TARGET_SPACE_ID,
  document: {
    version: 1,
    title: 'Architecture',
    defaultMap: SECOND_MAP_ID,
    maps: [
      {
        id: FIRST_MAP_ID,
        title: 'Collection 1',
        kind: 'positioned',
        positions: {},
        graphs: [{ id: FIRST_GRAPH_ID, title: 'Overview', edges: [] }],
      },
      {
        id: SECOND_MAP_ID,
        title: 'Collection 2',
        kind: 'positioned',
        positions: {},
        graphs: [{ id: SECOND_GRAPH_ID, title: 'Detail', edges: [] }],
      },
    ],
  },
  resources: [],
};
const containing: SpaceSnapshot = {
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Talk',
    defaultMap: OTHER_MAP_ID,
    maps: [
      {
        id: OTHER_MAP_ID,
        title: 'Talk Map',
        kind: 'positioned',
        positions: {},
        graphs: [{ id: OTHER_GRAPH_ID, title: 'Talk Graph', edges: [] }],
      },
    ],
  },
  resources: [],
};

/** A context whose shown Space is composed, so its authoring and links can be offered. */
async function composedContext(
  overrides: Partial<EmbedCommandsContext> = {},
): Promise<EmbedCommandsContext> {
  const backend = new MemorySpaceBackend(
    SPACE_ID,
    [containing, shownSpace].map((snapshot) => ({
      snapshot,
      revision: 0n,
      exportedRevision: null,
    })),
  );
  const spaces = createOpenSpaces({
    fullscreen: refusingFullscreen,
    presentations: unlinkedPresentations,
    backend,
    metaSpaceId: SPACE_ID,
    metaSpaceTitle: containing.document.title,
    newId: newUuid,
    history: recordingHistory(),
  });
  const source = await spaces.open(SPACE_ID);
  await spaces.hold(TARGET_SPACE_ID);
  return context({
    spaces,
    continuation: source.app.continuation,
    commandOutcomes: source.app.commandOutcomes,
    deleteConfirmation: source.app.deleteConfirmation,
    ...overrides,
  });
}

const openMapMenu = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Map: Collection 1' }));
  return screen.getByRole('menu');
};

describe("the shown Space's commands on the chooser", () => {
  it("offers the shown Map's link without a Claim, and none of its authoring", async () => {
    mountRail(decorateEmbedCommands(node('space'), await composedContext()));
    const menu = openMapMenu();
    expect(within(menu).getByRole('menuitem', { name: 'Copy link to Map' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(within(menu).getByRole('menuitem', { name: 'New Map' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(within(menu).getByRole('menuitem', { name: 'Rename' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('offers the shown Space’s authoring under a Claim beside a commit', async () => {
    mountRail(
      decorateEmbedCommands(
        node('space'),
        await composedContext({
          mapEmbeds: embedded({ claim: { release: () => true } }),
        }),
      ),
    );
    const menu = openMapMenu();
    expect(within(menu).getByRole('menuitem', { name: 'New Map' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(within(menu).getByRole('menuitem', { name: 'Rename' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});
