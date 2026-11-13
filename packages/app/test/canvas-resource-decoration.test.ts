import { describe, expect, it, vi } from 'vitest';
import { uuidSchema, type ResourceId, type SpaceSnapshot } from '@project/core';
import {
  bareKindData,
  projectResourceNodes,
  type ResourceFlowNode,
} from '@project/react-flow-adapter';
import { loadSpaceSnapshot } from '@project/graph';
import {
  decoratePluginSurface,
  decorateSharedResourceNode,
  pluginOperationsFor,
  type CanvasResourceDecorationContext,
  type PluginSurfaceDecorationContext,
} from '../src/canvas-resource-decoration';
import type { PluginHost } from '../src/plugin-host/plugin-commits';
import { createPluginGate } from '../src/plugin-host/plugin-gate';
import { NO_CLAIMS } from '../src/plugin-host/claim-chain';
import type { AuthoringResult } from '../src/space-authoring';
import { RESOURCE_SIZE } from '../src/resource';
import type { PluginKind } from '@project/plugins/testing';
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

const projectionNode = (
  resourceId: ResourceId,
  kind: PluginKind,
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

const spaceDocument = {
  title: 'Architecture',
  kind: 'space' as const,
  content: { spaceId: TARGET_SPACE_ID, map: TARGET_MAP_ID, graph: TARGET_GRAPH_ID },
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

/** Every field a decoration reads: the shared ones and the plugin surface's. */
type DecorationContext = CanvasResourceDecorationContext & PluginSurfaceDecorationContext;

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
 * What a Resource's plugin is offered on the canvas (ADR 0142): one rule for
 * every Resource, read from the node and the surface's context, never from
 * its kind.
 */
describe('pluginOperationsFor', () => {
  const EMPTY_TEXT = '/assets/47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU';
  const NEXT_TEXT = '/assets/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBA';
  const markdown = () => projectionNode(RESOURCE_ID, 'markdown', true);
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

  it('offers the plugin its commits and a Claim where the canvas authors the Resource', () => {
    const pluginHost = hostWith(vi.fn((): AuthoringResult => ({ kind: 'completed' })));
    for (const node of [markdown(), projectionNode(UR_ID, 'ur')]) {
      const operations = pluginOperationsFor(node, context({ pluginHost }));
      expect(operations.kind).toBe(node.data.kind);
      expect(operations.commitContent).toBeTypeOf('function');
      expect(operations.commitTitle).toBeTypeOf('function');
      expect(operations.commitMap).toBeTypeOf('function');
      expect(operations.claim).toBeTypeOf('function');
    }
  });

  it('offers nothing to commit where authoring is off, the Resource is not editable or there is no host', () => {
    const pluginHost = hostWith(vi.fn());
    for (const withheld of [
      context({ pluginHost, authorOnCanvas: false }),
      context({ pluginHost, editableResourceIds: new Set() }),
      context(),
    ]) {
      const operations = pluginOperationsFor(markdown(), withheld);
      expect(operations.commitContent).toBeUndefined();
      expect(operations.commitTitle).toBeUndefined();
      expect(operations.commitMap).toBeUndefined();
      expect(operations.claim).toBeUndefined();
    }
    expect(pluginOperationsFor(markdown(), context())).toEqual({ kind: 'markdown' });
  });

  it('commits content as one changed-content Edit', async () => {
    const complete = vi.fn((): AuthoringResult => ({ kind: 'completed' }));
    const { commitContent } = pluginOperationsFor(
      markdown(),
      context({ pluginHost: hostWith(complete) }),
    );
    await expect(commitContent?.({ url: NEXT_TEXT })).resolves.toBe('completed');
    expect(complete).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledWith(
      { kind: 'changed-content', resourceId: RESOURCE_ID, content: { url: NEXT_TEXT } },
      expect.any(Function),
    );
  });

  it('commits a Title as an Edit of the stored document', async () => {
    const complete = vi.fn((): AuthoringResult => ({ kind: 'completed' }));
    const { commitTitle } = pluginOperationsFor(
      markdown(),
      context({ pluginHost: hostWith(complete) }),
    );
    await expect(commitTitle?.('Renamed')).resolves.toBe('completed');
    expect(complete).toHaveBeenCalledWith(
      {
        kind: 'edited-resource',
        resourceId: RESOURCE_ID,
        document: { title: 'Renamed', kind: 'markdown', content: { url: EMPTY_TEXT } },
      },
      expect.any(Function),
    );
  });

  it('commits Map content as one changed-map-content Edit', async () => {
    const complete = vi.fn((): AuthoringResult => ({ kind: 'completed' }));
    const { commitMap } = pluginOperationsFor(
      projectionNode(UR_ID, 'ur'),
      context({ pluginHost: testPluginHost(complete) }),
    );
    await expect(commitMap?.({ shape: 'ellipse' })).resolves.toBe('completed');
    expect(complete).toHaveBeenCalledWith(
      { kind: 'changed-map-content', resourceId: UR_ID, content: { shape: 'ellipse' } },
      expect.any(Function),
    );
  });

  it('offers no Claim to a Resource embedding a Map where the surface policy withholds it, keeping its commits', () => {
    const pluginHost = testPluginHost(vi.fn());
    const embedding = projectionNode(SPACE_RESOURCE_ID, 'space', true);
    expect(embedding.data.embedsMap).toBe(true);
    expect(pluginOperationsFor(embedding, context({ pluginHost })).claim).toBeTypeOf('function');
    // As inside an embedded Map: authoring stops at the canvas's own Map.
    const withheld = pluginOperationsFor(
      embedding,
      context({ pluginHost, embeddedMapEdit: false }),
    );
    expect(withheld.commitMap).toBeTypeOf('function');
    expect(withheld).not.toHaveProperty('claim');
    // A Resource embedding no Map keeps its Claim on every drawing.
    expect(
      pluginOperationsFor(markdown(), context({ pluginHost, embeddedMapEdit: false })).claim,
    ).toBeTypeOf('function');
  });

  it('offers a Resource whose kind names no plugin its Title commit alone', () => {
    const node = projectionNode(RESOURCE_ID, 'markdown');
    const missing: ResourceFlowNode = {
      ...node,
      data: { ...node.data, ...bareKindData('vnd.example.chart') },
    };
    const operations = pluginOperationsFor(
      missing,
      context({ pluginHost: testPluginHost(vi.fn()) }),
    );
    expect(operations.commitTitle).toBeTypeOf('function');
    expect(operations).not.toHaveProperty('commitContent');
    expect(operations).not.toHaveProperty('commitMap');
    expect(operations).not.toHaveProperty('claim');
  });
});

describe('decoratePluginSurface', () => {
  it('keeps a node offered nothing beyond its bare kind as it is', () => {
    const node = projectionNode(RESOURCE_ID, 'markdown');
    expect(decoratePluginSurface(node, context())).toBe(node);
  });

  it('carries what the plugin is offered on the node', () => {
    const node = projectionNode(UR_ID, 'ur');
    const decorated = decoratePluginSurface(node, context({ pluginHost: testPluginHost(vi.fn()) }));
    expect(decorated.data.kindOperations.commitMap).toBeTypeOf('function');
  });
});
