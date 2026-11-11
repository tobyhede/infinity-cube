import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { uuidSchema, type ResourceId } from '@project/core';
import { bareKindData, type ResourceFlowNode } from '@project/react-flow-adapter';
import { ResourceRailActions, type MapEmbedRequest } from '@project/ui';
import type { Continuation } from '../src/continuation';
import {
  decorateEmbedCommands,
  READING_SPACE_NOTE,
  type EmbedCommandsContext,
} from '../src/embed-commands';
import type { MapEmbedEntry } from '../src/map-embeddings';
import { RESOURCE_SIZE } from '../src/resource';
import type { SpaceResourceTarget } from '../src/space-resource-lifecycle';
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
const node = (kind: 'markdown' | 'space' | 'ur', readOnly = false): ResourceFlowNode => ({
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

  it('offers no chooser where the plugin passed no commit and no Claim', () => {
    const drawn = node('space');
    expect(
      decorateEmbedCommands(drawn, context({ mapEmbeds: embedded({ select: undefined }) })),
    ).toBe(drawn);
    expect(
      decorateEmbedCommands(
        drawn,
        context({ mapEmbeds: embedded({ select: { value: choosing } }) }),
      ),
    ).toBe(drawn);
  });

  it('offers the chooser wherever a commit is passed, whatever the kind', () => {
    for (const kind of ['space', 'markdown', 'ur'] as const) {
      expect(railOf(decorateEmbedCommands(node(kind), context()))).toBeDefined();
    }
  });

  it('offers nothing under a Claim without a commit to choose through', () => {
    const drawn = node('space');
    expect(
      decorateEmbedCommands(
        drawn,
        context({
          mapEmbeds: embedded({ select: { value: choosing }, claim: { release: () => true } }),
        }),
      ),
    ).toBe(drawn);
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
});
