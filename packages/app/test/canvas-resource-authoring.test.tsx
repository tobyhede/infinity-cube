import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { spaceSnapshotSchema, uuidSchema, type ResourceId } from '@project/core';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import { bareKindData, type ResourceFlowNode } from '@project/react-flow-adapter';
import { RESOURCE_SIZE } from '../src/resource';
import { authoringAvailability } from '../src/authoring-availability';
import { useCanvasResourceAuthoring } from '../src/canvas-resource-authoring';
import { composeApp } from '../src/compose-app';
import type { SpaceResourceTarget } from '../src/space-resource-lifecycle';
import {
  NO_SPACE_RESOURCE_TARGETS,
  type SpaceResourceTargets,
} from '../src/space-resource-targets';
import { fixtureFacts } from './render-adapter-fixtures';
import { PluginAssetsProvider, ResourceRailActions, type MapEmbedRequest } from '@project/ui';
import type { Claim } from '@project/resource-api/view';
import { createMapEmbeddings, type MapEmbeddings } from '../src/map-embeddings';
import { CANVAS } from '../src/space-authoring';
import { canvasAuthoring } from './canvas-authoring';
import { textAsset } from './markdown-texts';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const MISSING_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const REFERENCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const SPACE_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const TARGET_SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');
const UR_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000b');
/**
 * What the Space Resource selects of its target (ADR 0079). The target Space is not
 * in this fixture — these tests mount one canvas and never read a second Space —
 * so the pair is required by the shape and resolved by nothing here.
 */
const TARGET_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000009');
const TARGET_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000a');

const snapshot = spaceSnapshotSchema.parse({
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Space',
    maps: [
      {
        id: MAP_ID,
        title: 'Map',
        kind: 'positioned',
        positions: {
          [RESOURCE_ID]: { x: 0, y: 0 },
          [REFERENCE_ID]: { x: 300, y: 0 },
          [SPACE_RESOURCE_ID]: { x: 600, y: 0 },
          [UR_ID]: { x: 900, y: 0 },
        },
        graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [] }],
      },
    ],
    defaultMap: MAP_ID,
  },
  resources: [
    {
      id: RESOURCE_ID,
      document: { title: 'A', kind: 'markdown', content: { url: textAsset('A source') } },
    },
    {
      id: REFERENCE_ID,
      document: { title: 'Return', kind: 'reference', content: { target: RESOURCE_ID } },
    },
    {
      id: SPACE_RESOURCE_ID,
      document: {
        title: 'Architecture',
        kind: 'space',
        content: { spaceId: TARGET_SPACE_ID, map: TARGET_MAP_ID, graph: TARGET_GRAPH_ID },
      },
    },
    { id: UR_ID, document: { title: 'Gateway', kind: 'ur', content: {} } },
  ],
});

const snapshotWithoutResource = spaceSnapshotSchema.parse({
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Space',
    maps: [
      {
        id: MAP_ID,
        title: 'Map',
        kind: 'positioned',
        positions: {},
        graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [] }],
      },
    ],
    defaultMap: MAP_ID,
  },
  resources: [],
});

const node = (
  open: boolean,
  resourceId = RESOURCE_ID,
  kind: 'markdown' | 'reference' | 'space' | 'ur' = 'markdown',
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
    readOnly: false,
    ...bareKindData(kind),
    ...fixtureFacts(kind, open, 'A source'),
    selectedForAuthoring: false,
    activeGraphId: GRAPH_ID,
    activeGraphColor: '#8a94a6',
    borderColor: null,
    receding: false,
  },
});

interface HookProps {
  readonly open: boolean;
  readonly enabled: boolean;
  readonly presenting: boolean;
  readonly nameOnCreation: string | null;
  readonly resourceId: ResourceId;
}

const mountAuthoring = (
  onBodyEditingChange?: (editing: boolean) => void,
  projectedKind: 'markdown' | 'reference' | 'space' | 'ur' = 'markdown',
  reportsOutcomes = false,
) => {
  const loaded = { snapshot, revision: 0n, exportedRevision: null };
  const spaceSession = openSpaceSession(MemorySpaceBackend.asMeta(loaded), loaded);
  const { authoring, adapter, commandOutcomes, continuation, pluginGate } = composeApp({
    spaceSession,
  });
  const initialProps: HookProps = {
    open: false,
    enabled: true,
    presenting: false,
    nameOnCreation: null,
    resourceId: RESOURCE_ID,
  };
  const hook = renderHook(
    ({ open, enabled, presenting, nameOnCreation, resourceId }: HookProps) =>
      useCanvasResourceAuthoring({
        continuation,
        nodes: [node(open, resourceId, projectedKind)],
        // The two facts this hook's rules turn on, stated as facts and turned
        // into answers by the one module that owns them. A live chrome rename is
        // what `enabled: false` means here — it is the fact that takes canvas
        // authoring away, and it is deliberately not the fact that ends a live
        // content edit.
        availability: authoringAvailability({
          editable: true,
          replacingImage: false,
          presenting,
          editingResourceBody: false,
          editingResourceTitle: false,
          editingChromeTitle: !enabled,
          spaceOnCanvas: true,
          editingEmbeddedMap: false,
        }),
        nameOnCreation,
        authoring: canvasAuthoring(authoring),
        spaceSession,
        resourceResize: adapter.getState().resourceResize,
        onSelectResource: () => undefined,
        onBodyEditingChange,
        commandOutcomes: reportsOutcomes ? commandOutcomes : undefined,
      }),
    {
      initialProps,
    },
  );
  return { ...hook, spaceSession, authoring, adapter, commandOutcomes, pluginGate };
};

/** An Ur Resource's Map content commit, where its plugin surface is offered one. */
const mapCommitOf = (node: ResourceFlowNode) =>
  node.data.kindOperations.kind === 'ur' ? node.data.kindOperations.commitMap : undefined;

/** A Space Resource's own operations, or nothing for another kind. */
const spaceOperationsOf = (data: ResourceFlowNode['data']) =>
  data.kindOperations.kind === 'space' ? data.kindOperations : undefined;

/** What an Open Space Resource's plugin asks its Map embedding for. */
/** The key of the drawing the Space Resource's plugin embeds its Map from. */
const SPACE_DRAWING = Symbol('space drawing');

const spaceEmbed = (claim?: Claim): MapEmbedRequest => ({
  space: TARGET_SPACE_ID,
  view: { map: TARGET_MAP_ID, graph: TARGET_GRAPH_ID },
  select: {
    value: { map: TARGET_MAP_ID, graph: TARGET_GRAPH_ID },
    commit: () => Promise.resolve('completed'),
  },
  claim,
});

const onlyNode = (nodes: readonly ResourceFlowNode[]): ResourceFlowNode => {
  const decorated = nodes[0];
  if (decorated === undefined) throw new Error('The Resource was not decorated.');
  return decorated;
};

describe('canvas Resource authoring', () => {
  /**
   * The host holds no `editing` state for a Markdown Resource (ADR 0142): its
   * plugin owns the edit, so the host offers commits and a Claim and never a
   * body editor of its own, whatever the Resource's Map content says.
   */
  it('holds no editing state for a Markdown Resource, offering its plugin commits and a Claim', () => {
    const { result, rerender } = mountAuthoring();
    for (const open of [false, true]) {
      rerender({
        open,
        enabled: true,
        presenting: false,
        nameOnCreation: null,
        resourceId: RESOURCE_ID,
      });
      const markdown = onlyNode(result.current.nodes);
      const operations = markdown.data.kindOperations;
      if (operations.kind !== 'markdown') throw new Error('Expected Markdown operations');
      expect(operations.commitContent).toBeDefined();
      expect(operations.commitMap).toBeDefined();
      expect(operations.claim).toBeDefined();
    }
  });

  /**
   * A Reference Resource's Open is its plugin's Map content (ADR 0142): the
   * host offers its plugin the Map content commit, through which Open and
   * Close are its rail commands.
   */
  it('offers a Reference Resource’s plugin the Map content commit', () => {
    const { result, rerender } = mountAuthoring(undefined, 'reference');
    rerender({
      open: false,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      resourceId: REFERENCE_ID,
    });
    const reference = onlyNode(result.current.nodes);
    expect(reference.data.onBeginTitleEditing).toBeDefined();
    const operations = reference.data.kindOperations;
    if (operations.kind !== 'reference') throw new Error('Expected Reference operations');
    expect(operations.commitMap).toBeDefined();
    expect(operations.commitTitle).toBeDefined();
  });

  /**
   * An Ur Resource has no content (ADR 0113): it keeps its Title, and nothing
   * hands it a caret or an editor.
   */
  it('offers an Ur Resource its Title and no content edit', () => {
    const { result, rerender } = mountAuthoring(undefined, 'ur');
    rerender({
      open: false,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      resourceId: UR_ID,
    });
    const ur = onlyNode(result.current.nodes);
    expect(ur.data.onBeginTitleEditing).toBeDefined();
    expect(ur.data.titleEditor).toBeUndefined();
  });

  /**
   * An Ur Resource's plugin commits its Map content (ADR 0142): one Edit on the
   * Map, answering how it settled, and withdrawn while presenting.
   */
  it('commits an Ur Resource’s Map content on its Map, answering how it settled', async () => {
    const mapContentOf = (spaceSession: ReturnType<typeof mountAuthoring>['spaceSession']) =>
      spaceSession.getState().working.document.maps?.[0]?.positions[UR_ID]?.content;
    const props = {
      open: false,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      resourceId: UR_ID,
    };

    const { result, rerender, spaceSession } = mountAuthoring(undefined, 'ur');
    rerender(props);
    const commit = mapCommitOf(onlyNode(result.current.nodes));
    expect(commit).toBeDefined();
    await act(async () => {
      await expect(commit?.({ shape: 'diamond' })).resolves.toBe('completed');
    });
    expect(mapContentOf(spaceSession)).toEqual({ shape: 'diamond' });
    await act(async () => {
      await expect(commit?.({ shape: 'diamond' })).resolves.toBe('unchanged');
    });
    await act(async () => {
      const answer = await commit?.({ shape: 'hexagon' });
      expect(answer === 'completed' || answer === 'unchanged' ? '' : answer?.refused).toMatch(
        /\S/u,
      );
    });
    expect(mapContentOf(spaceSession)).toEqual({ shape: 'diamond' });

    rerender({ ...props, presenting: true });
    expect(mapCommitOf(onlyNode(result.current.nodes))).toBeUndefined();
  });

  it('forgets a title caret when canvas authoring is withdrawn', () => {
    const { result, rerender } = mountAuthoring();
    act(() => result.current.beginTitleEditing(RESOURCE_ID));
    expect(onlyNode(result.current.nodes).data.titleEditor).toBeDefined();

    rerender({
      open: false,
      enabled: false,
      presenting: false,
      nameOnCreation: null,
      resourceId: RESOURCE_ID,
    });
    expect(onlyNode(result.current.nodes).data.titleEditor).toBeUndefined();

    rerender({
      open: false,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      resourceId: RESOURCE_ID,
    });
    expect(onlyNode(result.current.nodes).data.titleEditor).toBeUndefined();
    act(() => result.current.beginTitleEditing(RESOURCE_ID));
    expect(onlyNode(result.current.nodes).data.titleEditor).toBeDefined();
  });

  /**
   * The Closed Size is the one floor for every kind, a Space Resource's
   * embedded Map included: its content fits the rect it is given.
   */
  it('floors a Space Resource resize at the Closed Size and keeps it Open there', () => {
    const { result, rerender, authoring, adapter, spaceSession } = mountAuthoring(
      undefined,
      'space',
    );
    act(() => {
      // A Space Resource is Open by its Map content, which its plugin commits (ADR 0142).
      authoring.complete(CANVAS, {
        kind: 'changed-map-content',
        resourceId: SPACE_RESOURCE_ID,
        content: { open: true },
      });
    });
    rerender({
      open: true,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      resourceId: SPACE_RESOURCE_ID,
    });

    const space = onlyNode(result.current.nodes);
    expect(space.data.resize?.minWidth).toBe(RESOURCE_SIZE.width);
    expect(space.data.resize?.minHeight).toBe(RESOURCE_SIZE.height);
    act(() => {
      space.data.resize?.onResizeStart();
      space.data.resize?.onResize({ width: 280, height: 220 });
    });
    expect(adapter.getState().resizeDraft?.size).toEqual({ width: 280, height: 220 });
    act(() => space.data.resize?.onResizeEnd());
    expect(
      spaceSession.getState().working.document.maps?.[0]?.positions[SPACE_RESOURCE_ID],
    ).toMatchObject({ content: { open: true }, size: { width: 280, height: 220 } });
    act(() => {
      space.data.resize?.onResizeStart();
      space.data.resize?.onResize({ width: 100, height: 100 });
      space.data.resize?.onResizeEnd();
    });
    expect(
      spaceSession.getState().working.document.maps?.[0]?.positions[SPACE_RESOURCE_ID],
    ).toMatchObject({ content: { open: true }, size: RESOURCE_SIZE });
  });

  it.each(['markdown', 'reference'] as const)(
    'floors an Open %s Resource resize at the collapsed size',
    (kind) => {
      const { result, rerender } = mountAuthoring(undefined, kind);
      rerender({
        open: true,
        enabled: true,
        presenting: false,
        nameOnCreation: null,
        resourceId: kind === 'reference' ? REFERENCE_ID : RESOURCE_ID,
      });

      const resource = onlyNode(result.current.nodes);
      expect(resource.data.resize?.minWidth).toBe(RESOURCE_SIZE.width);
      expect(resource.data.resize?.minHeight).toBe(RESOURCE_SIZE.height);
    },
  );

  it.each(['markdown', 'reference'] as const)(
    'withholds every authoring control from a projected %s Resource absent from the working Space',
    (kind) => {
      const { result, rerender } = mountAuthoring(undefined, kind);
      rerender({
        open: true,
        enabled: true,
        presenting: false,
        nameOnCreation: null,
        resourceId: MISSING_RESOURCE_ID,
      });
      act(() => result.current.beginTitleEditing(MISSING_RESOURCE_ID));

      const missing = onlyNode(result.current.nodes);
      expect(missing.data.onBeginTitleEditing).toBeUndefined();
      expect(missing.data.resize).toBeUndefined();
      expect(missing.data.titleEditor).toBeUndefined();
    },
  );

  it('withdraws authoring when the working Space changes without a projection render', () => {
    const { result, spaceSession } = mountAuthoring();
    expect(onlyNode(result.current.nodes).data.onBeginTitleEditing).toBeDefined();

    act(() => spaceSession.submit(snapshotWithoutResource));

    const staleProjection = onlyNode(result.current.nodes);
    expect(staleProjection.data.onBeginTitleEditing).toBeUndefined();
  });

  it('opens title editing only when a newly created Resource identity changes', () => {
    const { result, rerender } = mountAuthoring();
    rerender({
      open: false,
      enabled: true,
      presenting: false,
      nameOnCreation: RESOURCE_ID,
      resourceId: RESOURCE_ID,
    });
    expect(onlyNode(result.current.nodes).data.titleEditor).toBeDefined();

    act(() => onlyNode(result.current.nodes).data.titleEditor?.onCancel());
    rerender({
      open: false,
      enabled: true,
      presenting: false,
      nameOnCreation: RESOURCE_ID,
      resourceId: RESOURCE_ID,
    });
    expect(onlyNode(result.current.nodes).data.titleEditor).toBeUndefined();
  });
});

describe('canvas Resource authoring Space rail', () => {
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

  const spaceNode = (open: boolean, readOnly = false): ResourceFlowNode => ({
    ...node(open, SPACE_RESOURCE_ID, 'space'),
    data: { ...node(open, SPACE_RESOURCE_ID, 'space').data, readOnly },
  });

  const mountRail = (open: boolean, withTarget: boolean, readOnly = false, enabled = true) => {
    // What the drawn plugin publishes: an Open Space Resource embeds its Map.
    const mapEmbeddings = createMapEmbeddings();
    if (open)
      mapEmbeddings.publish(SPACE_RESOURCE_ID, SPACE_RESOURCE_ID, spaceEmbed(), SPACE_DRAWING);
    const loaded = { snapshot, revision: 0n, exportedRevision: null };
    const spaceSession = openSpaceSession(MemorySpaceBackend.asMeta(loaded), loaded);
    const { authoring, adapter, continuation } = composeApp({
      spaceSession,
    });
    return renderHook(() =>
      useCanvasResourceAuthoring({
        continuation,
        nodes: [spaceNode(open, readOnly)],
        availability: authoringAvailability({
          editable: true,
          replacingImage: false,
          presenting: false,
          editingResourceBody: false,
          editingResourceTitle: false,
          editingChromeTitle: !enabled,
          spaceOnCanvas: true,
          editingEmbeddedMap: false,
        }),
        nameOnCreation: null,
        authoring: canvasAuthoring(authoring),
        spaceSession,
        resourceResize: adapter.getState().resourceResize,
        onSelectResource: () => undefined,
        spaceResourceTargets: withTarget ? new Map([[TARGET_SPACE_ID, target]]) : undefined,
        mapEmbeddings,
      }),
    );
  };

  it('omits the rail while closed even when the target is read', () => {
    const { result } = mountRail(false, true);
    expect(spaceOperationsOf(onlyNode(result.current.nodes).data)?.mapRail).toBeUndefined();
  });

  it('omits the rail while the target is unread', () => {
    const { result } = mountRail(true, false);
    expect(spaceOperationsOf(onlyNode(result.current.nodes).data)?.mapRail).toBeUndefined();
  });

  it('omits the rail on a read-only Resource', () => {
    const { result } = mountRail(true, true, true);
    expect(spaceOperationsOf(onlyNode(result.current.nodes).data)?.mapRail).toBeUndefined();
  });

  it('builds the rail for an Open Space Resource whose target is read', () => {
    const { result } = mountRail(true, true);
    expect(spaceOperationsOf(onlyNode(result.current.nodes).data)?.mapRail).toBeDefined();
  });

  it('still draws a disabled rail when canvas authoring is withdrawn', () => {
    const { result } = mountRail(true, true, false, false);
    expect(spaceOperationsOf(onlyNode(result.current.nodes).data)?.mapRail).toBeDefined();
  });
});

describe('canvas Resource authoring decoration identity', () => {
  const markdownNode = node(false, RESOURCE_ID, 'markdown');
  const referenceNode = node(false, REFERENCE_ID, 'reference');
  const space = node(true, SPACE_RESOURCE_ID, 'space');
  const projection = [markdownNode, referenceNode, space];
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

  interface IdentityProps {
    readonly spaceResourceTargets: SpaceResourceTargets;
    readonly portalEditing: ReadonlySet<ResourceId>;
  }

  /** The Space Resource's plugin embeds its Map, passing its Claim while it is authored in place. */
  const publishSpaceEmbed = (embeddings: MapEmbeddings, editing: boolean) =>
    embeddings.publish(
      SPACE_RESOURCE_ID,
      SPACE_RESOURCE_ID,
      spaceEmbed(editing ? { release: () => undefined } : undefined),
      SPACE_DRAWING,
    );

  const dataOf = (nodes: readonly ResourceFlowNode[], resourceId: ResourceId) => {
    const found = nodes.find((candidate) => candidate.data.resourceId === resourceId);
    if (found === undefined) throw new Error('The Resource was not decorated.');
    return found.data;
  };

  const editedBodySnapshot = () =>
    spaceSnapshotSchema.parse({
      id: snapshot.id,
      document: snapshot.document,
      resources: [
        {
          id: RESOURCE_ID,
          document: { title: 'A', kind: 'markdown', content: { url: textAsset('Edited source') } },
        },
        {
          id: REFERENCE_ID,
          document: { title: 'Return', kind: 'reference', content: { target: RESOURCE_ID } },
        },
        {
          id: SPACE_RESOURCE_ID,
          document: {
            title: 'Architecture',
            kind: 'space',
            content: { spaceId: TARGET_SPACE_ID, map: TARGET_MAP_ID, graph: TARGET_GRAPH_ID },
          },
        },
        { id: UR_ID, document: { title: 'Gateway', kind: 'ur', content: {} } },
      ],
    });

  const mountIdentity = () => {
    const loaded = { snapshot, revision: 0n, exportedRevision: null };
    const spaceSession = openSpaceSession(MemorySpaceBackend.asMeta(loaded), loaded);
    const { authoring, adapter, continuation } = composeApp({
      spaceSession,
    });
    const surfaceAuthoring = canvasAuthoring(authoring);
    const onSelectResource = () => undefined;
    const resourceResize = adapter.getState().resourceResize;
    const mapEmbeddings = createMapEmbeddings();
    publishSpaceEmbed(mapEmbeddings, false);
    const hook = renderHook(
      ({ spaceResourceTargets, portalEditing }: IdentityProps) => {
        // A rerender naming new editing publishes it, as the plugin passing its Claim does.
        if (
          (mapEmbeddings.getState().get(SPACE_RESOURCE_ID)?.request.claim !== undefined) !==
          portalEditing.has(SPACE_RESOURCE_ID)
        )
          publishSpaceEmbed(mapEmbeddings, portalEditing.has(SPACE_RESOURCE_ID));
        return useCanvasResourceAuthoring({
          continuation,
          nodes: projection,
          availability: authoringAvailability({
            editable: true,
            replacingImage: false,
            presenting: false,
            editingResourceBody: false,
            editingResourceTitle: false,
            editingChromeTitle: false,
            spaceOnCanvas: true,
            editingEmbeddedMap: false,
          }),
          nameOnCreation: null,
          authoring: surfaceAuthoring,
          spaceSession,
          resourceResize,
          onSelectResource,
          spaceResourceTargets,
          mapEmbeddings,
        });
      },
      {
        initialProps: {
          spaceResourceTargets: NO_SPACE_RESOURCE_TARGETS,
          portalEditing: new Set<ResourceId>(),
        },
      },
    );
    return { ...hook, spaceSession, mapEmbeddings };
  };

  /** The Space Resource's chooser, as the canvas hands it to the plugin's rail. */
  const chooserOf = (nodes: readonly ResourceFlowNode[]): SpaceResourceSelectorsProps => {
    const rail = spaceOperationsOf(dataOf(nodes, SPACE_RESOURCE_ID))?.mapRail;
    if (!isValidElement<SpaceResourceSelectorsProps>(rail)) throw new Error('No chooser drawn.');
    return rail.props;
  };

  /** The canvas with its Space Resource's chooser drawn, saying something and mid-rename. */
  const mountSpeakingChooser = () => {
    const mounted = mountIdentity();
    mounted.rerender({
      spaceResourceTargets: new Map([[TARGET_SPACE_ID, target]]),
      portalEditing: new Set<ResourceId>(),
    });
    const chooser = chooserOf(mounted.result.current.nodes);
    act(() => {
      chooser.onReport('Link copied.');
      chooser.onEditingChange?.(true);
    });
    expect(dataOf(mounted.result.current.nodes, SPACE_RESOURCE_ID).contextNotice).toBe(
      'Link copied.',
    );
    expect(mounted.result.current.titleEditing).toBe(true);
    return mounted;
  };

  /** Whether the Space Resource, Opened again, draws its chooser afresh: no notice, no editing. */
  const expectAfreshOnReopen = ({ result, mapEmbeddings }: ReturnType<typeof mountIdentity>) => {
    expect(result.current.titleEditing).toBe(false);
    act(() => publishSpaceEmbed(mapEmbeddings, false));
    expect(
      spaceOperationsOf(dataOf(result.current.nodes, SPACE_RESOURCE_ID))?.mapRail,
    ).toBeDefined();
    expect(dataOf(result.current.nodes, SPACE_RESOURCE_ID).contextNotice).toBeUndefined();
    expect(result.current.titleEditing).toBe(false);
  };

  it("drops its chooser's notice and editing when its plugin Closes it, so neither returns on reopen", async () => {
    const mounted = mountSpeakingChooser();
    const commitMap = (next: { open: boolean }) =>
      spaceOperationsOf(dataOf(mounted.result.current.nodes, SPACE_RESOURCE_ID))?.commitMap?.(next);
    // The fixture stores it Closed: its plugin Opens it, then Closes it.
    await act(async () => {
      await expect(commitMap({ open: true })).resolves.toBe('completed');
    });
    await act(async () => {
      await expect(commitMap({ open: false })).resolves.toBe('completed');
    });
    // The plugin's own Close leaves what its chooser said in place until the
    // embedding goes.
    expect(dataOf(mounted.result.current.nodes, SPACE_RESOURCE_ID).contextNotice).toBe(
      'Link copied.',
    );
    // Closed, the plugin draws no `<Embed>`, which takes the embedding down.
    act(() =>
      mounted.mapEmbeddings.publish(SPACE_RESOURCE_ID, SPACE_RESOURCE_ID, null, SPACE_DRAWING),
    );
    expectAfreshOnReopen(mounted);
  });

  it("drops its chooser's notice and editing when a Close arrives from outside, as another author's Edit", () => {
    const mounted = mountSpeakingChooser();
    // No commit of this canvas's: the Resource Closed under it, as another
    // author's Edit or a replacement Closes it, and its plugin took the
    // embedding down.
    act(() =>
      mounted.mapEmbeddings.publish(SPACE_RESOURCE_ID, SPACE_RESOURCE_ID, null, SPACE_DRAWING),
    );
    expectAfreshOnReopen(mounted);
  });

  it('keeps markdown and Reference Resource node.data when only Space Resource targets change', () => {
    const { result, rerender } = mountIdentity();
    const markdownData = dataOf(result.current.nodes, RESOURCE_ID);
    const referenceData = dataOf(result.current.nodes, REFERENCE_ID);

    rerender({
      spaceResourceTargets: new Map([[TARGET_SPACE_ID, target]]),
      portalEditing: new Set<ResourceId>(),
    });

    expect(dataOf(result.current.nodes, RESOURCE_ID)).toBe(markdownData);
    expect(dataOf(result.current.nodes, REFERENCE_ID)).toBe(referenceData);
    expect(
      spaceOperationsOf(dataOf(result.current.nodes, SPACE_RESOURCE_ID))?.mapRail,
    ).toBeDefined();
  });

  it('keeps markdown node.data when only portal editing changes, and the Space Resource keeps its chooser', () => {
    const { result, rerender } = mountIdentity();
    rerender({
      spaceResourceTargets: new Map([[TARGET_SPACE_ID, target]]),
      portalEditing: new Set<ResourceId>(),
    });
    const markdownData = dataOf(result.current.nodes, RESOURCE_ID);

    rerender({
      spaceResourceTargets: new Map([[TARGET_SPACE_ID, target]]),
      portalEditing: new Set([SPACE_RESOURCE_ID]),
    });

    expect(dataOf(result.current.nodes, RESOURCE_ID)).toBe(markdownData);
    expect(
      spaceOperationsOf(dataOf(result.current.nodes, SPACE_RESOURCE_ID))?.mapRail,
    ).toBeDefined();
  });

  it('keeps markdown and Reference Resource node.data when a body save does not change Resource membership', () => {
    const { result, spaceSession } = mountIdentity();
    const markdownData = dataOf(result.current.nodes, RESOURCE_ID);
    const referenceData = dataOf(result.current.nodes, REFERENCE_ID);

    act(() => spaceSession.submit(editedBodySnapshot()));

    expect(dataOf(result.current.nodes, RESOURCE_ID)).toBe(markdownData);
    expect(dataOf(result.current.nodes, REFERENCE_ID)).toBe(referenceData);
  });

  it('keeps an Open Space Resource node.data when a markdown body save does not change its document', () => {
    const { result, rerender, spaceSession } = mountIdentity();
    rerender({
      spaceResourceTargets: new Map([[TARGET_SPACE_ID, target]]),
      portalEditing: new Set<ResourceId>(),
    });
    const markdownData = dataOf(result.current.nodes, RESOURCE_ID);
    const spaceData = dataOf(result.current.nodes, SPACE_RESOURCE_ID);
    expect(spaceOperationsOf(spaceData)?.mapRail).toBeDefined();

    act(() => spaceSession.submit(editedBodySnapshot()));

    expect(dataOf(result.current.nodes, RESOURCE_ID)).toBe(markdownData);
    expect(dataOf(result.current.nodes, SPACE_RESOURCE_ID)).toBe(spaceData);
  });
});

describe('canvas Resource authoring, an Image Resource’s plugin surface', () => {
  const IMAGE_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000b');
  const OLD_URL = 'https://example.com/old.png';
  const NEW_URL = 'https://example.com/new.png';
  const withImage = spaceSnapshotSchema.parse({
    id: SPACE_ID,
    document: {
      version: 1,
      title: 'Space',
      maps: [
        {
          id: MAP_ID,
          title: 'Map',
          kind: 'positioned',
          positions: {
            [IMAGE_ID]: { x: 0, y: 0, size: { width: 640, height: 480 } },
          },
          graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [] }],
        },
      ],
      defaultMap: MAP_ID,
    },
    resources: [
      { id: IMAGE_ID, document: { title: 'Figure', kind: 'image', content: { url: OLD_URL } } },
    ],
  });
  const imageNode: ResourceFlowNode = {
    id: IMAGE_ID,
    type: 'resource',
    position: { x: 0, y: 0 },
    width: 640,
    height: 480,
    data: {
      shape: 'rectangle',
      resourceId: IMAGE_ID,
      title: 'Figure',
      readOnly: false,
      ...bareKindData('image'),
      ...fixtureFacts('image'),
      selectedForAuthoring: false,
      ownContent: { url: OLD_URL },
      mapContent: {},
      activeGraphId: GRAPH_ID,
      activeGraphColor: '#8a94a6',
      borderColor: null,
      receding: false,
    },
  };
  /** The operations the Image Resource's plugin surface is handed. */
  const operationsOf = (drawn: ResourceFlowNode) =>
    drawn.data.kindOperations.kind === 'image' ? drawn.data.kindOperations : undefined;

  const STORED = `/assets/${'B'.repeat(43)}` as const;
  const store = vi.fn((bytes: Blob) =>
    Promise.resolve(bytes.size > 0 ? STORED : { refused: 'Empty.' }),
  );
  const pick = vi.fn(() => Promise.resolve([]));

  /** The hook over a composed Space holding one Image Resource, with an asset store supplied. */
  const mountImage = (editable = true) => {
    const loaded = { snapshot: withImage, revision: 0n, exportedRevision: null };
    const spaceSession = openSpaceSession(MemorySpaceBackend.asMeta(loaded), loaded);
    const { authoring, adapter, continuation } = composeApp({
      spaceSession,
      reportObserverError: vi.fn(),
    });
    const hook = renderHook(
      () =>
        useCanvasResourceAuthoring({
          continuation,
          nodes: [imageNode],
          availability: authoringAvailability({
            editable,
            replacingImage: false,
            presenting: false,
            editingResourceBody: false,
            editingResourceTitle: false,
            editingChromeTitle: false,
            spaceOnCanvas: true,
            editingEmbeddedMap: false,
          }),
          nameOnCreation: null,
          authoring: canvasAuthoring(authoring),
          spaceSession,
          resourceResize: adapter.getState().resourceResize,
          onSelectResource: () => undefined,
        }),
      {
        wrapper: ({ children }) => (
          <PluginAssetsProvider value={{ url: (ref) => ref, read: vi.fn(), store, pick }}>
            {children}
          </PluginAssetsProvider>
        ),
      },
    );
    return { ...hook, spaceSession };
  };

  it('hands the plugin its Title and content commits, the asset store, the picker and a Claim', () => {
    const { result } = mountImage();
    const operations = operationsOf(onlyNode(result.current.nodes));
    expect(operations?.commitTitle).toBeDefined();
    expect(operations?.commitContent).toBeDefined();
    expect(operations?.commitStore).toBeDefined();
    expect(operations?.pick).toBeDefined();
    expect(operations?.claim).toBeDefined();
    expect(operations?.commitMap).toBeDefined();
  });

  it('hands a canvas that authors nothing no commit, store, picker or Claim', () => {
    const { result } = mountImage(false);
    const operations = operationsOf(onlyNode(result.current.nodes));
    expect(operations?.kind).toBe('image');
    for (const offered of [
      'commitTitle',
      'commitContent',
      'commitMap',
      'commitStore',
      'pick',
      'claim',
    ]) {
      expect(operations).not.toHaveProperty(offered);
    }
  });

  it('replaces the picture by one content commit, keeping the Resource’s identity, Title and placement', async () => {
    const { result, spaceSession } = mountImage();
    const before = spaceSession.getState().working;
    await act(async () => {
      await expect(
        operationsOf(onlyNode(result.current.nodes))?.commitContent?.({ url: NEW_URL }),
      ).resolves.toBe('completed');
    });
    const after = spaceSession.getState().working;
    expect(after.resources).toEqual([
      { id: IMAGE_ID, document: { title: 'Figure', kind: 'image', content: { url: NEW_URL } } },
    ]);
    expect(after.document.maps?.[0]?.positions).toEqual(before.document.maps?.[0]?.positions);
  });

  it('answers unchanged for the content it already holds', async () => {
    const { result, spaceSession } = mountImage();
    const before = spaceSession.getState().working;
    await act(async () => {
      await expect(
        operationsOf(onlyNode(result.current.nodes))?.commitContent?.({ url: OLD_URL }),
      ).resolves.toBe('unchanged');
    });
    expect(spaceSession.getState().working).toBe(before);
  });

  it('refuses content the Image Resource cannot hold, in the application’s words', async () => {
    const { result, spaceSession } = mountImage();
    const before = spaceSession.getState().working;
    let answer: unknown;
    await act(async () => {
      answer = await operationsOf(onlyNode(result.current.nodes))?.commitContent?.({
        url: 'data:image/png;base64,AAAA',
      });
    });
    expect(answer).toEqual({ refused: 'This Resource cannot hold that content.' });
    expect(spaceSession.getState().working).toBe(before);
  });

  it('renames by a Title commit', async () => {
    const { result, spaceSession } = mountImage();
    await act(async () => {
      await expect(
        operationsOf(onlyNode(result.current.nodes))?.commitTitle?.('Harbour'),
      ).resolves.toBe('completed');
    });
    expect(spaceSession.getState().working.resources[0]?.document.title).toBe('Harbour');
  });

  it('stores through the application’s asset store while no exclusive work runs', async () => {
    const { result } = mountImage();
    await expect(
      operationsOf(onlyNode(result.current.nodes))?.commitStore?.(new Blob(['png'])),
    ).resolves.toBe(STORED);
    expect(store).toHaveBeenCalledTimes(1);
  });
});

describe("canvas Resource authoring: an embedding's notice", () => {
  beforeAll(() => {
    HTMLElement.prototype.hasPointerCapture = () => false;
    HTMLElement.prototype.setPointerCapture = () => undefined;
    HTMLElement.prototype.releasePointerCapture = () => undefined;
  });

  const OTHER_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000c');
  const OTHER_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000d');
  const target: SpaceResourceTarget = {
    id: TARGET_SPACE_ID,
    title: 'Architecture',
    maps: [
      {
        id: TARGET_MAP_ID,
        title: 'Collection 1',
        graphs: [{ id: TARGET_GRAPH_ID, title: 'Overview', color: '#1f77b4', headShape: 'arrow' }],
      },
      {
        id: OTHER_MAP_ID,
        title: 'Collection 2',
        graphs: [{ id: OTHER_GRAPH_ID, title: 'Detail', color: '#ff7f0e', headShape: 'dot' }],
      },
    ],
  };
  const UR_DRAWING = Symbol('ur drawing');
  const refusingEmbed: MapEmbedRequest = {
    ...spaceEmbed(),
    select: {
      value: { map: TARGET_MAP_ID, graph: TARGET_GRAPH_ID },
      commit: () => Promise.resolve({ refused: 'That Map is not offered.' }),
    },
  };

  const mountEmbedding = (request: MapEmbedRequest) => {
    const mapEmbeddings = createMapEmbeddings();
    mapEmbeddings.publish(UR_ID, UR_ID, request, UR_DRAWING);
    const loaded = { snapshot, revision: 0n, exportedRevision: null };
    const spaceSession = openSpaceSession(MemorySpaceBackend.asMeta(loaded), loaded);
    const { authoring, adapter, continuation } = composeApp({ spaceSession });
    const { result } = renderHook(() =>
      useCanvasResourceAuthoring({
        continuation,
        nodes: [node(false, UR_ID, 'ur')],
        availability: authoringAvailability({
          editable: true,
          replacingImage: false,
          presenting: false,
          editingResourceBody: false,
          editingResourceTitle: false,
          editingChromeTitle: false,
          spaceOnCanvas: true,
          editingEmbeddedMap: false,
        }),
        nameOnCreation: null,
        authoring: canvasAuthoring(authoring),
        spaceSession,
        resourceResize: adapter.getState().resourceResize,
        onSelectResource: () => undefined,
        spaceResourceTargets: new Map([[TARGET_SPACE_ID, target]]),
        mapEmbeddings,
      }),
    );
    const rail = render(
      <ResourceRailActions aria-label="Resource rail">
        {onlyNode(result.current.nodes).data.kindOperations.mapRail}
      </ResourceRailActions>,
    );
    const chooseOtherMap = async () => {
      fireEvent.click(screen.getByTestId('space-resource-map'));
      await act(async () => {
        fireEvent.click(screen.getByRole('menuitemradio', { name: 'Collection 2' }));
        await Promise.resolve();
      });
    };
    return { result, rail, mapEmbeddings, chooseOtherMap };
  };

  it('drops what the embedding said once its plugin stops embedding, whatever the kind, so reopening starts afresh', async () => {
    const { result, rail, mapEmbeddings, chooseOtherMap } = mountEmbedding(refusingEmbed);
    await chooseOtherMap();
    expect(onlyNode(result.current.nodes).data.contextNotice).toBe('That Map is not offered.');
    rail.unmount();

    act(() => mapEmbeddings.publish(UR_ID, UR_ID, null, UR_DRAWING));
    act(() => mapEmbeddings.publish(UR_ID, UR_ID, refusingEmbed, UR_DRAWING));
    expect(onlyNode(result.current.nodes).data.kindOperations.mapRail).toBeDefined();
    expect(onlyNode(result.current.nodes).data.contextNotice).toBeUndefined();
  });

  it('says nothing of a choice answered after its embedding is gone', async () => {
    let answer: (refused: { readonly refused: string }) => void = () => undefined;
    const late: MapEmbedRequest = {
      ...refusingEmbed,
      select: {
        value: { map: TARGET_MAP_ID, graph: TARGET_GRAPH_ID },
        commit: () =>
          new Promise((resolve) => {
            answer = resolve;
          }),
      },
    };
    const { result, rail, mapEmbeddings, chooseOtherMap } = mountEmbedding(late);
    await chooseOtherMap();
    rail.unmount();
    act(() => mapEmbeddings.publish(UR_ID, UR_ID, null, UR_DRAWING));
    await act(async () => {
      answer({ refused: 'That Map is not offered.' });
      await Promise.resolve();
    });
    act(() => mapEmbeddings.publish(UR_ID, UR_ID, refusingEmbed, UR_DRAWING));
    expect(onlyNode(result.current.nodes).data.contextNotice).toBeUndefined();
  });
});
