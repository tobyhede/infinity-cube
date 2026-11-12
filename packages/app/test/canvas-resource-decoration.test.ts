import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  urKind,
  uuidSchema,
  type ResourceId,
  type SpaceSnapshot,
  type UrKindId,
} from '@project/core';
import {
  bareKindData,
  isResourceNodeOf,
  projectResourceNodes,
  type ResourceFlowNode,
  type ResourceFlowNodeOf,
} from '@project/react-flow-adapter';
import { loadSpaceSnapshot } from '@project/graph';
import {
  decorateKinds,
  decorateSharedResourceNode,
  kindDecorationMemo,
  kindDecorator,
  type AgreeingAllOf,
  type CanvasResourceDecorationContext,
  type ClashingFields,
  type KindCanvasDecoration,
  type KindDecorator,
} from '../src/canvas-resource-decoration';
import { imageDecoration } from '../src/kinds/image';
import { decorateMarkdownResourceNode } from '../src/kinds/markdown';
import { decorateSpaceResourceNode } from '../src/kinds/space';
import type { PluginResourceDecorationContext } from '../src/kinds/plugin-decoration';
import { urDecoration } from '../src/kinds/ur';
import type { KindDecorationContext } from '../src/kinds/registry';
import type { PluginHost } from '../src/plugin-host/plugin-commits';
import { createPluginGate } from '../src/plugin-host/plugin-gate';
import { NO_CLAIMS } from '../src/plugin-host/claim-chain';
import type { AuthoringResult } from '../src/space-authoring';
import { RESOURCE_SIZE } from '../src/resource';
import { NO_SPACE_RESOURCE_TARGETS } from '../src/space-resource-targets';
import type { SpaceResourceTarget } from '../src/space-resource-lifecycle';
import type { Continuation } from '../src/continuation';
import type { MapEmbedEntry } from '../src/map-embeddings';
import { fixtureFacts } from './render-adapter-fixtures';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const REFERENCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const SPACE_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const TARGET_SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');
const TARGET_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000009');
const TARGET_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000a');
const MISSING_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const UR_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000b');

const target: SpaceResourceTarget = {
  id: TARGET_SPACE_ID,
  title: 'Architecture',
  maps: [
    {
      id: TARGET_MAP_ID,
      title: 'Collection 1',
      graphs: [{ id: TARGET_GRAPH_ID, title: 'Overview', color: '#1f77b4', headShape: 'arrow' }],
    },
  ],
};

const projectionNode = (
  resourceId: ResourceId,
  kind: 'markdown' | 'reference' | 'space' | 'ur',
  open = false,
  readOnly = false,
): ResourceFlowNode => ({
  id: resourceId,
  type: 'resource',
  position: { x: 0, y: 0 },
  width: open ? 640 : RESOURCE_SIZE.width,
  height: open ? 480 : RESOURCE_SIZE.height,
  data: {
    shape: 'rectangle',
    resourceId,
    title: 'A',
    readOnly,
    ...bareKindData(kind),
    ...fixtureFacts(kind, open),
    selectedForAuthoring: false,
    activeGraphId: null,
    activeGraphColor: '#8a94a6',
    borderColor: null,
    receding: false,
  },
});

/** `node`, narrowed to the kind a kind's decoration takes. */
function ofKind<K extends ResourceFlowNode['data']['kind']>(
  node: ResourceFlowNode,
  kind: K,
): ResourceFlowNodeOf<K> {
  if (!isResourceNodeOf(node, kind)) throw new Error(`${node.id} is not a ${kind} Resource`);
  return node;
}

const spaceDocument = {
  title: 'Architecture',
  kind: 'space' as const,
  content: { spaceId: TARGET_SPACE_ID, map: TARGET_MAP_ID, graph: TARGET_GRAPH_ID },
};

/**
 * Never spent: these contexts hold `spaces: null`, so no Space Resource rail is
 * built and nothing reads the continuation.
 */
const continuation: Continuation = {
  getState: () => ({ pending: null }),
  subscribe: () => () => undefined,
  request: () => undefined,
  take: () => undefined,
  dispose: () => undefined,
};

/** A plugin host that lands Edits through `complete`, with no document and no assets. */
const testPluginHost = (complete: PluginHost['complete']): PluginHost => ({
  gate: createPluginGate(),
  claims: NO_CLAIMS,
  replacementEpoch: () => 0,
  complete,
  report: () => undefined,
  document: () => undefined,
  assets: {},
});

/** Every field a decoration reads: the shared ones and each kind's own. */
type DecorationContext = CanvasResourceDecorationContext & KindDecorationContext;

const context = (overrides: Partial<DecorationContext> = {}): DecorationContext => ({
  authorOnCanvas: true,
  embeddedMapEdit: true,
  bodyEditing: false,
  editableResourceIds: new Set([RESOURCE_ID, REFERENCE_ID, SPACE_RESOURCE_ID, UR_ID]),
  beginTitleEditing: () => undefined,
  onSelectResource: () => undefined,
  resourceResize: {
    beginResize: () => undefined,
    previewResize: () => undefined,
    finishResize: () => undefined,
    cancelResize: () => undefined,
  },
  editingTitleResourceId: null,
  completeResourceTitle: () => null,
  clearCaret: () => undefined,
  continuation,
  containingSpaceId: SPACE_ID,
  spaceSelections: new Map([
    [
      SPACE_RESOURCE_ID,
      { spaceId: TARGET_SPACE_ID, map: TARGET_MAP_ID, graph: TARGET_GRAPH_ID, framing: undefined },
    ],
  ]),
  spaceResourceTargets: new Map([[TARGET_SPACE_ID, target]]),
  spaces: null,
  commandOutcomes: undefined,
  deleteConfirmation: undefined,
  mapEmbeds: new Map(),
  contextNotices: new Map(),
  onContextEditingChange: () => undefined,
  onContextReport: () => undefined,
  ...overrides,
});

describe('decorateSharedResourceNode', () => {
  it('offers title editing and entity actions on a Resource of the working Space', () => {
    const patch = decorateSharedResourceNode(
      projectionNode(RESOURCE_ID, 'space'),
      context({ resourceEntityActions: () => [] }),
    );
    expect(patch.onBeginTitleEditing).toBeTypeOf('function');
    expect(patch.entityActions).toEqual([]);
  });

  /** The menu carries Connect, so this gate also gates drawing an Edge from the keyboard. */
  it('asks for entity actions only where authoring is on and the Resource is the working Space’s', () => {
    const groups = [[]];
    const resourceEntityActions = vi.fn(() => groups);

    expect(
      decorateSharedResourceNode(
        projectionNode(RESOURCE_ID, 'markdown'),
        context({ resourceEntityActions }),
      ).entityActions,
    ).toBe(groups);
    expect(resourceEntityActions).toHaveBeenCalledWith(RESOURCE_ID);
    expect(
      decorateSharedResourceNode(
        projectionNode(RESOURCE_ID, 'markdown'),
        context({ resourceEntityActions, authorOnCanvas: false }),
      ).entityActions,
    ).toEqual([]);
    expect(
      decorateSharedResourceNode(
        projectionNode(MISSING_RESOURCE_ID, 'markdown'),
        context({ resourceEntityActions }),
      ).entityActions,
    ).toBeUndefined();
    expect(resourceEntityActions).toHaveBeenCalledOnce();
  });

  it('withholds competing title controls while a body caret is live', () => {
    const patch = decorateSharedResourceNode(
      projectionNode(RESOURCE_ID, 'space', true),
      context({ bodyEditing: true }),
    );
    expect(patch.onBeginTitleEditing).toBeUndefined();
  });

  it('withholds every authoring control from a projected Resource absent from the working Space', () => {
    const patch = decorateSharedResourceNode(
      projectionNode(MISSING_RESOURCE_ID, 'markdown', true),
      context(),
    );
    expect(patch.onBeginTitleEditing).toBeUndefined();
    expect(patch.resize).toBeUndefined();
    expect(patch.titleEditor).toBeUndefined();
    expect(patch.entityActions).toBeUndefined();
  });

  it('floors a projected Reference to a Space Resource at the Closed Size, as every kind', () => {
    const loaded = loadSpaceSnapshot({
      id: SPACE_ID,
      document: { version: 1, title: 'Host', maps: [] },
      resources: [
        { id: SPACE_RESOURCE_ID, document: spaceDocument },
        {
          id: REFERENCE_ID,
          document: {
            title: 'Reference',
            kind: 'reference',
            content: { target: SPACE_RESOURCE_ID },
          },
        },
      ],
    } satisfies SpaceSnapshot);
    if (!loaded.ok) throw new Error('Expected a valid reference fixture');
    const node = projectResourceNodes(loaded.space, {
      mapContent: (id) => (id === REFERENCE_ID ? { open: true } : undefined),
    }).find((candidate) => candidate.id === REFERENCE_ID);
    if (node === undefined) throw new Error('Expected the Reference projection');
    const previewResize = vi.fn();
    const patch = decorateSharedResourceNode(
      node,
      context({
        resourceResize: {
          beginResize: () => undefined,
          previewResize,
          finishResize: () => undefined,
          cancelResize: () => undefined,
        },
      }),
    );
    expect(patch.resize?.minWidth).toBe(RESOURCE_SIZE.width);
    expect(patch.resize?.minHeight).toBe(RESOURCE_SIZE.height);
    patch.resize?.onResize({ width: 280, height: 220 });
    expect(previewResize).toHaveBeenCalledWith(REFERENCE_ID, { width: 280, height: 220 });
    patch.resize?.onResize({ width: 100, height: 100 });
    expect(previewResize).toHaveBeenCalledWith(REFERENCE_ID, RESOURCE_SIZE);
  });

  it('offers resize on every kind, Open or Closed, where the Map may be authored', () => {
    for (const [id, kind] of [
      [RESOURCE_ID, 'markdown'],
      [UR_ID, 'ur'],
    ] as const) {
      for (const open of [false, true]) {
        const patch = decorateSharedResourceNode(projectionNode(id, kind, open), context());
        expect(patch.resize?.minWidth).toBe(RESOURCE_SIZE.width);
        expect(patch.resize?.minHeight).toBe(RESOURCE_SIZE.height);
      }
    }
    expect(
      decorateSharedResourceNode(
        projectionNode(RESOURCE_ID, 'markdown'),
        context({ authorOnCanvas: false }),
      ).resize,
    ).toBeUndefined();
  });

  it('attaches the title editor only to the Resource holding the caret', () => {
    const patch = decorateSharedResourceNode(
      projectionNode(RESOURCE_ID, 'space'),
      context({ editingTitleResourceId: RESOURCE_ID }),
    );
    expect(patch.titleEditor).toBeDefined();
    expect(
      decorateSharedResourceNode(
        projectionNode(REFERENCE_ID, 'reference'),
        context({ editingTitleResourceId: RESOURCE_ID }),
      ).titleEditor,
    ).toBeUndefined();
  });
});

/**
 * An Ur Resource has no content (ADR 0113): it takes every shared Resource
 * operation and no content edit from any decorator.
 */
describe('an Ur Resource’s decoration', () => {
  it('offers title editing and entity actions', () => {
    const patch = decorateSharedResourceNode(
      projectionNode(UR_ID, 'ur'),
      context({ resourceEntityActions: () => [] }),
    );
    expect(patch.onBeginTitleEditing).toBeTypeOf('function');
    expect(patch.entityActions).toEqual([]);
  });

  /** An Ur Resource's plugin surface commits its Map content where the Map may be authored (ADR 0142). */
  it('offers the plugin its Map content commit where the Map may be authored', async () => {
    const complete = vi.fn((): AuthoringResult => ({ kind: 'completed' }));
    const pluginHost = testPluginHost(complete);
    const ur = () => ofKind(projectionNode(UR_ID, 'ur'), 'ur');
    const commit = urDecoration.decorate(ur(), context({ pluginHost })).kindOperations.commitMap;
    await expect(commit?.({ shape: 'ellipse' })).resolves.toBe('completed');
    expect(complete).toHaveBeenCalledWith(
      { kind: 'changed-map-content', resourceId: UR_ID, content: { shape: 'ellipse' } },
      expect.any(Function),
    );

    expect(
      urDecoration.decorate(ur(), context({ pluginHost, authorOnCanvas: false })).kindOperations
        .commitMap,
    ).toBeUndefined();
    expect(
      urDecoration.decorate(ur(), context({ pluginHost, editableResourceIds: new Set() }))
        .kindOperations.commitMap,
    ).toBeUndefined();
    expect(urDecoration.decorate(ur(), context()).kindOperations.commitMap).toBeUndefined();
  });
});

describe('decorateMarkdownResourceNode', () => {
  const EMPTY_TEXT = '/assets/47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU';
  const NEXT_TEXT = '/assets/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBA';
  const markdown = () => ofKind(projectionNode(RESOURCE_ID, 'markdown', true), 'markdown');
  const hostWith = (complete: PluginHost['complete']): PluginHost => ({
    gate: createPluginGate(),
    claims: NO_CLAIMS,
    replacementEpoch: () => 0,
    complete,
    report: () => undefined,
    document: (resourceId) =>
      resourceId === RESOURCE_ID
        ? { title: 'Notes', kind: 'markdown', content: { url: EMPTY_TEXT } }
        : undefined,
  });

  /**
   * The canvas holds no editing state for a Markdown Resource (ADR 0142): its
   * decoration is the plugin's commits and Claim, and never a display.
   */
  it('offers the plugin its commits and a Claim where the canvas is authored, and no display', () => {
    const pluginHost = hostWith(vi.fn((): AuthoringResult => ({ kind: 'completed' })));
    const patch = decorateMarkdownResourceNode(markdown(), context({ pluginHost }));
    expect(patch).not.toHaveProperty('display');
    expect(patch.kindOperations.commitContent).toBeTypeOf('function');
    expect(patch.kindOperations.commitTitle).toBeTypeOf('function');
    expect(patch.kindOperations.commitMap).toBeTypeOf('function');
    expect(patch.kindOperations.claim).toBeTypeOf('function');
    for (const withheld of [
      context({ pluginHost, authorOnCanvas: false }),
      context({ pluginHost, editableResourceIds: new Set() }),
      context(),
    ]) {
      const withheldOperations = decorateMarkdownResourceNode(markdown(), withheld).kindOperations;
      expect(withheldOperations.commitContent).toBeUndefined();
      expect(withheldOperations.commitTitle).toBeUndefined();
      expect(withheldOperations.commitMap).toBeUndefined();
      expect(withheldOperations.claim).toBeUndefined();
    }
  });

  it('commits content as one changed-content Edit carrying its URL', async () => {
    const complete = vi.fn((): AuthoringResult => ({ kind: 'completed' }));
    const { commitContent } = decorateMarkdownResourceNode(
      markdown(),
      context({ pluginHost: hostWith(complete) }),
    ).kindOperations;
    await expect(commitContent?.({ url: NEXT_TEXT })).resolves.toBe('completed');
    expect(complete).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledWith(
      { kind: 'changed-content', resourceId: RESOURCE_ID, content: { url: NEXT_TEXT } },
      expect.any(Function),
    );
  });

  it('commits a Title as an Edit of the stored document', async () => {
    const complete = vi.fn((): AuthoringResult => ({ kind: 'completed' }));
    const { commitTitle } = decorateMarkdownResourceNode(
      markdown(),
      context({ pluginHost: hostWith(complete) }),
    ).kindOperations;
    await expect(commitTitle?.('Renamed')).resolves.toBe('completed');
    expect(complete).toHaveBeenCalledWith(
      {
        kind: 'edited-resource',
        resourceId: RESOURCE_ID,
        document: { title: 'Renamed', kind: 'markdown', content: { url: EMPTY_TEXT } },
      },
      expect.any(Function),
    );
    expect(complete).toHaveBeenCalledOnce();
  });
});

describe('the Image kind’s decoration', () => {
  const imageNode = (): ResourceFlowNodeOf<'image'> => {
    const node = projectionNode(RESOURCE_ID, 'markdown', false);
    return ofKind(
      {
        ...node,
        data: { ...node.data, ...bareKindData('image'), ...fixtureFacts('image') },
      },
      'image',
    );
  };

  it('offers the plugin its commits and a Claim where the canvas authors the Resource', async () => {
    const complete = vi.fn((): AuthoringResult => ({ kind: 'completed' }));
    const operations = imageDecoration.decorate(
      imageNode(),
      context({ pluginHost: testPluginHost(complete) }),
    ).kindOperations;
    expect(operations.claim).toBeTypeOf('function');
    await expect(operations.commitContent?.({ url: 'https://example.com/b.png' })).resolves.toBe(
      'completed',
    );
    expect(complete).toHaveBeenCalledWith(
      {
        kind: 'changed-content',
        resourceId: RESOURCE_ID,
        content: { url: 'https://example.com/b.png' },
      },
      expect.any(Function),
    );
  });

  it('offers nothing where the Resource is not editable or there is no host', () => {
    const pluginHost = testPluginHost(vi.fn());
    expect(
      imageDecoration.decorate(imageNode(), context({ pluginHost, editableResourceIds: new Set() }))
        .kindOperations,
    ).toEqual(expect.objectContaining({ kind: 'image' }));
    expect(
      imageDecoration.decorate(imageNode(), context({ pluginHost, editableResourceIds: new Set() }))
        .kindOperations,
    ).not.toHaveProperty('commitContent');
    expect(imageDecoration.decorate(imageNode(), context()).kindOperations).toEqual({
      kind: 'image',
    });
  });
});

/** The Map embedding a drawn Space Resource's plugin publishes, choosing through `select` when given. */
const embedding = (
  select: MapEmbedEntry['request']['select'] = {
    value: { spaceId: TARGET_SPACE_ID, map: TARGET_MAP_ID, graph: TARGET_GRAPH_ID },
    commit: () => Promise.resolve('completed'),
  },
): ReadonlyMap<string, MapEmbedEntry> =>
  new Map([
    [
      SPACE_RESOURCE_ID,
      {
        resourceId: SPACE_RESOURCE_ID,
        drawing: Symbol('space drawing'),
        request: {
          view: { spaceId: TARGET_SPACE_ID, map: TARGET_MAP_ID, graph: TARGET_GRAPH_ID },
          select,
          claim: undefined,
        },
      },
    ],
  ]);

describe('decorateSpaceResourceNode', () => {
  const openSpaceNode = (readOnly = false) =>
    ofKind(projectionNode(SPACE_RESOURCE_ID, 'space', true, readOnly), 'space');

  it('draws no Map embedding commands while its plugin embeds no Map, as while Closed', () => {
    const operations = decorateSpaceResourceNode(
      ofKind(projectionNode(SPACE_RESOURCE_ID, 'space'), 'space'),
      context(),
    ).kindOperations;
    expect(operations.mapRail).toBeUndefined();
    expect(operations.mapNote).toBeUndefined();
  });

  it('says the Space is being read in place of the chooser while its target is unread', () => {
    const operations = decorateSpaceResourceNode(
      openSpaceNode(),
      context({ mapEmbeds: embedding(), spaceResourceTargets: NO_SPACE_RESOURCE_TARGETS }),
    ).kindOperations;
    expect(operations.mapRail).toBeUndefined();
    expect(operations.mapNote).toBe('Reading the referenced Space…');
  });

  it('draws no Map embedding commands on a read-only Resource', () => {
    expect(
      decorateSpaceResourceNode(openSpaceNode(true), context({ mapEmbeds: embedding() }))
        .kindOperations.mapRail,
    ).toBeUndefined();
  });

  it('builds the chooser for an embedded Map whose target is read, and still when authoring is withdrawn', () => {
    expect(
      decorateSpaceResourceNode(openSpaceNode(), context({ mapEmbeds: embedding() })).kindOperations
        .mapRail,
    ).toBeDefined();
    expect(
      decorateSpaceResourceNode(
        openSpaceNode(),
        context({ mapEmbeds: embedding(), authorOnCanvas: false }),
      ).kindOperations.mapRail,
    ).toBeDefined();
    // With no `select`, as while the plugin's content commit is withdrawn, the
    // chooser is drawn and disabled rather than taken away.
    expect(
      decorateSpaceResourceNode(openSpaceNode(), context({ mapEmbeds: embedding(undefined) }))
        .kindOperations.mapRail,
    ).toBeDefined();
  });

  it('withholds a context notice while the chooser is absent, and carries it once present', () => {
    const notices = new Map([[SPACE_RESOURCE_ID, 'Link copied.']]);
    expect(
      decorateSpaceResourceNode(
        ofKind(projectionNode(SPACE_RESOURCE_ID, 'space'), 'space'),
        context({ contextNotices: notices }),
      ).contextNotice,
    ).toBeUndefined();
    expect(
      decorateSpaceResourceNode(
        openSpaceNode(),
        context({ contextNotices: notices, mapEmbeds: embedding() }),
      ).contextNotice,
    ).toBe('Link copied.');
  });

  it("offers the plugin's commits and Claim where the canvas authors it", () => {
    const pluginHost = testPluginHost(vi.fn());
    const operations = decorateSpaceResourceNode(
      openSpaceNode(),
      context({ pluginHost }),
    ).kindOperations;
    expect(operations.kind).toBe('space');
    expect(operations.commitContent).toBeTypeOf('function');
    expect(operations.commitMap).toBeTypeOf('function');
    expect(operations.claim).toBeTypeOf('function');
    expect(
      decorateSpaceResourceNode(
        openSpaceNode(),
        context({ pluginHost, editableResourceIds: new Set() }),
      ).kindOperations,
    ).not.toHaveProperty('commitContent');
  });

  it('offers no Claim where the Map surface policy withholds a Space Resource its Edit, keeping its commits', () => {
    // As inside an embedded Map: authoring stops at the canvas's own Map.
    const operations = decorateSpaceResourceNode(
      openSpaceNode(),
      context({ pluginHost: testPluginHost(vi.fn()), embeddedMapEdit: false }),
    ).kindOperations;
    expect(operations.commitMap).toBeTypeOf('function');
    expect(operations).not.toHaveProperty('claim');
  });
});

describe('decorating each kind from its own part of the context', () => {
  interface Labels {
    readonly markdownLabel: string;
    readonly urLabel: string;
  }
  /** Decorations that mark each node of their kind with the label they read, counting each node decorated. */
  const labelling = (reads: () => void = () => undefined): KindDecorator<Labels>[] => [
    kindDecorator<'markdown', Pick<Labels, 'markdownLabel'>>({
      kind: 'markdown',
      slice: ({ markdownLabel }) => ({ markdownLabel }),
      decorate: (_node, { markdownLabel }) => {
        reads();
        return { kindOperations: { kind: 'markdown' }, contextNotice: markdownLabel };
      },
    }),
    kindDecorator<'ur', Pick<Labels, 'urLabel'>>({
      kind: 'ur',
      slice: ({ urLabel }) => ({ urLabel }),
      decorate: (_node, { urLabel }) => {
        reads();
        return { kindOperations: { kind: 'ur' }, contextNotice: urLabel };
      },
    }),
  ];
  const nodes = [projectionNode(RESOURCE_ID, 'markdown'), projectionNode(UR_ID, 'ur')];
  const labels = { markdownLabel: 'm', urLabel: 'u' };

  it('keeps every kind’s nodes, and answers what it kept, while no kind’s part changes', () => {
    const decorators = labelling();
    const first = decorateKinds(decorators, nodes, labels, undefined);
    expect(first.nodes.map((node) => node.data.contextNotice)).toEqual(['m', 'u']);
    expect(decorateKinds(decorators, nodes, { ...labels }, first)).toBe(first);
  });

  it('decorates again only the kind whose part changed', () => {
    const reads = vi.fn();
    const decorate = kindDecorationMemo(labelling(reads));
    const first = decorate(nodes, labels);
    const second = decorate(nodes, { ...labels, urLabel: 'v' });
    expect(second[0]).toBe(first[0]);
    expect(second[1]).not.toBe(first[1]);
    expect(second[1]?.data.contextNotice).toBe('v');
    expect(reads).toHaveBeenCalledTimes(3);
  });

  it('decorates every kind again over other nodes', () => {
    const reads = vi.fn();
    const decorate = kindDecorationMemo(labelling(reads));
    const first = decorate(nodes, labels);
    const second = decorate([...nodes], labels);
    expect(second[0]).not.toBe(first[0]);
    expect(second[1]).not.toBe(first[1]);
    expect(reads).toHaveBeenCalledTimes(4);
  });

  it('decorates an Ur Resource again when only its optional plugin host is replaced', async () => {
    const decorate = kindDecorationMemo([kindDecorator(urDecoration)]);
    const urNodes = [projectionNode(UR_ID, 'ur')];
    const host = testPluginHost;
    const first = vi.fn((): AuthoringResult => ({ kind: 'completed' }));
    const second = vi.fn((): AuthoringResult => ({ kind: 'completed' }));
    decorate(urNodes, context({ pluginHost: host(first) }));
    const [node] = decorate(urNodes, context({ pluginHost: host(second) }));
    if (node === undefined || !isResourceNodeOf(node, 'ur')) throw new Error('no Ur Resource');
    await node.data.kindOperations.commitMap?.({ shape: 'ellipse' });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('names every field of a kind’s context in the part it reads', () => {
    const dropsOptional: KindCanvasDecoration<UrKindId, PluginResourceDecorationContext> = {
      kind: urKind.id,
      // @ts-expect-error A part read field by field names every field, the optional ones too.
      slice: ({ authorOnCanvas, editableResourceIds }) => ({ authorOnCanvas, editableResourceIds }),
      decorate: urDecoration.decorate,
    };
    expect(dropsOptional.kind).toBe(urKind.id);
  });

  it('refuses a context two kinds read under one field name with different types', () => {
    interface Shared {
      readonly shared: boolean;
    }
    expectTypeOf<
      ClashingFields<(Shared & { a: string }) | (Shared & { a: number })>
    >().toEqualTypeOf<'a'>();
    expectTypeOf<
      AgreeingAllOf<(Shared & { a: string }) | (Shared & { a: number })>
    >().toEqualTypeOf<{
      readonly fieldsDeclaredWithDifferentTypes: 'a';
    }>();
    expectTypeOf<
      AgreeingAllOf<(Shared & { a: string }) | (Shared & { b: number })>
    >().toEqualTypeOf<Shared & { a: string } & { b: number }>();
  });
});
