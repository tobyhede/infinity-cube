import type { Node, NodeHandle } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { FALLBACK_GRAPH_COLOR, bareOperations, graphPaint } from '@project/ui';
import type { EntityActionGroup, KindOperationsOf, MapEmbedRequest } from '@project/ui';
import {
  DEFAULT_GRAPH_HEAD_SHAPE,
  DEFAULT_RESOURCE_SHAPE,
  authorsContent,
  embedsMap,
  resolvedMapContent,
  type JsonValue,
  type Resource,
  type ResourceId,
  type ResourceShape,
  type GraphHeadShape,
  type GraphId,
} from '@project/core';
import { referencedResources, resolveResourceContent } from '@project/graph';
import type {
  GraphRenderEdge,
  LayoutStrategyResource,
  LayoutStrategyGraph,
  Space,
} from '@project/graph';
import { ROUTED_EDGE_TYPE, type RoutedEdgeData, type RoutedFlowEdge } from './RoutedEdge';
import { AUTHORING_HANDLE_DIAMETER } from './authoring-handle';
import { graphLanes } from './edge-lanes';
import { graphHeadMarkerId } from './GraphHeadMarkers';

const FALLBACK_COLOR = FALLBACK_GRAPH_COLOR;

/** The z-index an Open Resource is drawn at, over its Closed neighbours. */
export const OPEN_RESOURCE_Z_INDEX = 10;

/**
 * Opacity of the Graphs that are not the active one, while one is. With no
 * Graph active every Graph is drawn at full strength; activating one recedes
 * the rest to hairlines with small heads (`RECEDING_STROKE_WIDTH`), which this
 * softens rather than hides.
 */
export const OTHER_GRAPH_OPACITY = 0.8;

/** The z-index a Resource drawing a Map embedding is drawn at, over its neighbours. */
export const OPEN_RESOURCE_Z_INDEX = 10;
export const OTHER_GRAPH_OPACITY = 0.35;

/** What ends an inline title edit. Answers a refusal reason, or `null` when the
 *  new title was accepted — the contract the host's Title editor reads, where
 *  `null` keeps the editor closed and a string keeps it open beside the message. */
export type ResourceTitleEditor = {
  onComplete: (title: string) => string | null;
  onCancel: () => void;
};

/**
 * A Resource's own kind beside that kind's operations, one arm per kind, so the
 * two cannot disagree. The kind is drawn as a persistent glyph on the Resource.
 * A Reference Resource is `reference` whatever its Target is; what it draws is
 * its plugin's.
 */
type KindDataOf<K extends Resource['kind']> = {
  [P in K]: { kind: P; kindOperations: KindOperationsOf<P> };
}[K];
type ResourceKindData = KindDataOf<Resource['kind']>;

/** Data carried by each custom resource node. Kept as a type alias so it satisfies
 *  React Flow's `Record<string, unknown>` data constraint. */
export type ResourceNodeData = ResourceKindData & ResourceNodeCommonData;

/**
 * Whether this Resource's own content embeds a Map its author edits in that
 * Map, rather than in the Resource's content area.
 */
export const authorsEmbeddedMap = (
  data: Pick<ResourceNodeData, 'authorsContent' | 'embedsMap'>,
): boolean => data.authorsContent && data.embedsMap;

/** A Resource node's data for one kind. */
export type ResourceNodeDataOf<K extends Resource['kind']> = Extract<ResourceNodeData, { kind: K }>;

type ResourceNodeCommonData = {
  /**
   * Resolved content facts.
   * `authorsContent`: whether an author may change this content here, the
   * Resource's own, of a kind whose content is authored.
   */
  authorsContent: boolean;
  embedsMap: boolean;
  /** Reports rendered title geometry by placement, including embedded placements. */
  onBodyHeightChange?: (id: string, height: number | null) => void;
  /**
   * Told, by placement, what a Map embedding drawn in this Resource's rect asks
   * for, and `null` once it is gone, so the canvas draws that Map over the
   * rect (ADR 0142), with the key of the drawing it is drawn in. Supplied by
   * the canvas to every node, nested ones too.
   */
  onMapEmbed?: (
    id: string,
    resourceId: ResourceId,
    request: MapEmbedRequest | null,
    drawing: symbol,
  ) => void;
  resourceId: ResourceId;
  title: string;
  /** Whether the Resource's reusable component must withhold authoring affordances. */
  readOnly: boolean;
  /** False withholds hover-reveal; omitted or true offers the host-canvas handles. */
  connectionAuthoringEnabled?: boolean;
  onBeginTitleEditing?: () => void;
  /**
   * The inline title editor this Resource is currently showing, absent on one that
   * is not being renamed. Its presence *is* the editing state, and it carries
   * the two operations that end the edit — so a composition cannot ask for the
   * editor without also saying what completes and cancels it.
   *
   * `ResourceNode` hands it to `PluginResource`'s Title as its `editor`, and
   * draws the Resource `state: 'editing'` while it is present. Do not split it into a boolean and
   * two independent optional callbacks: the adapter would have to manufacture
   * total functions out of partial data, and an absent completion answering
   * `null` — which the Title's editor reads as *accepted* — would close the editor
   * on a rename that never happened.
   */
  titleEditor?: ResourceTitleEditor;
  /**
   * Resizing this Resource, absent on one that may not be resized.
   *
   * Presence is the capability and it carries its own floor, for the same reason
   * `titleEditor` above carries its own completions: the floor is the Closed Size,
   * `RESOURCE_SIZE`, which belongs to the composition and not to this package —
   * an adapter that hardcoded a minimum would be a second opinion about a
   * constant `app` already owns.
   *
   * `onResize` previews a size and no origin. Displacement moves Resources and does
   * not scale them, so a reported size needs no inversion — which is what keeps
   * this out of the family of gestures that must go back through the authored
   * placement. If a resize is ever allowed to move the Resource's top-left, it joins
   * that family.
   *
   * The lifecycle travels as one capability: the composition supplies every
   * operation together because a resize gesture begun on an
   * unselected Resource has to select it before there is anything for `onResize`
   * to complete against — one control, one drag, and Selection is not a second
   * Edit (ADR 0122).
   */
  resize?: {
    readonly minWidth: number;
    readonly minHeight: number;
    onResizeStart: () => void;
    onResize: (size: { width: number; height: number }) => void;
    onResizeEnd: () => void;
    onResizeCancel: () => void;
  };
  /**
   * This Resource's own commands — copy an address it can be reached by, delete it
   * — drawn as one more control on the Resource's rail (ADR 0073, ADR 0082).
   *
   * Built by the composition and carried whole, exactly as the operations above
   * are: an address comes from the product destination table and a deletion
   * runs a completed Edit, neither of which this package can reach. Absent
   * means no control rather than an empty menu.
   */
  entityActions?: readonly EntityActionGroup[];
  /**
   * A refusal or busy notice from this Resource's context commands. Absent or null
   * leaves the alert region unmounted.
   */
  contextNotice?: string | null;
  /**
   * The outline the canvas strokes this Resource's border and ring on, resolved
   * from its plugin's Map content — the rectangle where it declares none (ADR
   * 0121, ADR 0142).
   */
  shape: ResourceShape;
  /** The Resource's content as stored, which the plugin drawing it parses itself (ADR 0142). */
  ownContent: Resource['content'];
  /**
   * The Map content the plugin drawing this Resource is given on this Map: its
   * entry's, else the plugin's default.
   */
  mapContent: JsonValue;
  /**
   * The Resources this one's content references, as they stand, which the
   * plugin drawing it may draw inside its rect through the host's embedding
   * (ADR 0142): an Open Reference Resource's Target.
   */
  embeddable?: readonly Resource[] | undefined;
  /** Ordinary renderer selection, kept outside the authored Space. */
  selectedForAuthoring: boolean;
  /** The graph being emphasised, if any. Drives handle dimming. */
  activeGraphId: GraphId | null;
  /** The active Graph's colour, used by graph-independent authoring handles. */
  activeGraphColor: string;
  /** The colour of the Graph this Resource is drawn in, or `null` for ink (ADR 0135). */
  borderColor: string | null;
  /** Whether this Resource recedes because the Active Graph does not reach it (ADR 0135). */
  receding: boolean;
  /**
   * Whether this Resource leans because a Resource framing it is being dragged.
   *
   * Only an *embedded* Resource carries it; a Resource dragged directly leans from its
   * own `state`. The lean is about this Resource's own centre and says nothing
   * about where the frame is, because the application has already rotated this
   * Resource's *position* about the dragged Resource's centre (`embedded-map.ts`)
   * — translating a rect along a rotation and then turning it in place is the
   * same rigid motion as turning it about that distant point, and expressing it
   * that way is what lets React Flow draw the Edges itself.
   */
  dragTilted?: boolean;
};

export type ResourceFlowNode = Node<ResourceNodeData, 'resource'>;

/** A Resource node of one kind. */
export type ResourceFlowNodeOf<K extends Resource['kind']> = Node<
  ResourceNodeDataOf<K>,
  'resource'
>;

/** Whether `node` is a Resource of `kind`, narrowing its data to that kind's. */
export function isResourceNodeOf<K extends Resource['kind']>(
  node: ResourceFlowNode,
  kind: K,
): node is ResourceFlowNodeOf<K> {
  return node.data.kind === kind;
}

/** A Resource kind with none of its operations offered yet. */
export function bareKindData<K extends Resource['kind']>(kind: K): KindDataOf<K> {
  return { kind, kindOperations: bareOperations(kind) };
}

export type ColorByGraphId = Readonly<Partial<Record<GraphId, string>>>;

/** How a Resource is drawn for the Graphs that reach it (ADR 0135). */
export interface ResourceEmphasis {
  /** The colour of the Graph this Resource is drawn in, or `null` for ink. */
  readonly borderColor: string | null;
  /** Whether this Resource recedes because the Active Graph does not reach it. */
  readonly receding: boolean;
}

/** Ink at full strength: a Resource no Graph reaches, while nothing recedes. */
export const UNEMPHASISED: ResourceEmphasis = { borderColor: null, receding: false };

/** Each Graph's head shape; a Graph missing here draws as `DEFAULT_GRAPH_HEAD_SHAPE`. */
export type HeadShapeByGraphId = Readonly<Partial<Record<GraphId, GraphHeadShape>>>;

export interface ProjectResourceNodesOptions {
  /** Draw Resources without any Resource-owned authoring controls. The four anchors of
   *  each role are declared and rendered either way — an Edge attaches to one,
   *  and React Flow draws no Edge at all for a Resource whose handles it cannot
   *  resolve (ADR 0087) — so this withholds the affordance, not the anchor. */
  readOnly?: boolean;
  /** Ordinary renderer selection used to expose continued-authoring handles. */
  selectedResourceId?: ResourceId | null;
  /** The graph to emphasise, if any. */
  activeGraphId?: GraphId | null;
  /** The active Graph's resolved colour for graph authoring controls. */
  activeGraphColor?: string;
  /** The laid-out graph; the resources' positions come from here when present. */
  strategyGraph?: LayoutStrategyGraph;
  /** Restrict the projection to these resource ids (e.g. one graph's resources). */
  resourceIds?: readonly ResourceId[];
  /** The Shape the Map draws each projected Resource in; absent, every one is the rectangle. */
  resourceShape?: (resourceId: ResourceId) => ResourceShape;
  /** The Map content each projected Resource's entry stores; absent, none stores any. */
  mapContent?: (resourceId: ResourceId) => JsonValue | undefined;
  /** How each projected Resource is drawn for its Graphs; absent, every one is ink at full strength. */
  resourceEmphasis?: (resourceId: ResourceId) => ResourceEmphasis;
}

/**
 * The four anchors a Resource declares on each role, one per side.
 *
 * An Edge attaches to whichever of them faces its neighbour, chosen while it is
 * drawn (ADR 0087) — so what is declared here is every side an Edge could ever
 * take, and never which one it took. Both roles are declared on all four sides
 * because an authoring gesture may begin or end anywhere, and because React Flow
 * resolves an Edge that names no handle to the first bound of that kind.
 *
 * Declared rather than measured. `parseHandles` prefers what is on `node.handles`
 * to anything in the DOM, so a Resource's anchors are known on the render that
 * first places it. React Flow still re-reads them from the DOM with
 * `getHandleBounds` whenever a node's element changes size, and finds the same
 * four sides, which `ResourceNode` renders on every Resource; each projection
 * then declares them again.
 */
function declaredHandles(resource: LayoutStrategyResource): NodeHandle[] {
  const radius = AUTHORING_HANDLE_DIAMETER / 2;
  const anchor = (type: 'source' | 'target', side: Position, x: number, y: number): NodeHandle => ({
    id: `authoring-${type}-${side}`,
    type,
    position: side,
    x,
    y,
    width: AUTHORING_HANDLE_DIAMETER,
    height: AUTHORING_HANDLE_DIAMETER,
  });
  return (['source', 'target'] as const).flatMap((type) => [
    anchor(type, Position.Top, resource.width / 2 - radius, -radius),
    anchor(type, Position.Right, resource.width - radius, resource.height / 2 - radius),
    anchor(type, Position.Bottom, resource.width / 2 - radius, resource.height - radius),
    anchor(type, Position.Left, -radius, resource.height / 2 - radius),
  ]);
}

/**
 * Map resources → React Flow resource nodes, each declaring the four anchors an Edge
 * may attach to on every side. The resource id is the React Flow node id.
 *
 * A Resource's anchors are Graph-independent and drawn in the Active Graph's
 * colour, which the composition resolves and passes as `activeGraphColor`. Its
 * border is the colour of the Graph it is drawn in, and whether it recedes, both
 * from `resourceEmphasis` (ADR 0135).
 *
 * A node carries its Resource's title, its content as stored and its Map
 * content, which its plugin draws (ADR 0142); resolved content supplies only
 * the facts the canvas needs.
 */
export function projectResourceNodes(
  space: Space,
  options: ProjectResourceNodesOptions = {},
): ResourceFlowNode[] {
  const activeGraphId = options.activeGraphId ?? null;
  const visible = options.resourceIds ? new Set(options.resourceIds) : null;
  const laidOut = new Map((options.strategyGraph?.resources ?? []).map((r) => [r.id, r]));

  const source = visible ? space.resources.filter((r) => visible.has(r.id)) : space.resources;
  return source.map((resource) => {
    const placedResource = laidOut.get(resource.id);
    const content = resolveResourceContent(space, resource);
    const emphasis = options.resourceEmphasis?.(resource.id) ?? UNEMPHASISED;
    const node: ResourceFlowNode = {
      id: resource.id,
      type: 'resource',
      position: { x: placedResource?.x ?? 0, y: placedResource?.y ?? 0 },
      data: {
        resourceId: resource.id,
        title: resource.title,
        readOnly: options.readOnly ?? false,
        ...bareKindData(resource.kind),
        authorsContent: authorsContent(content),
        embedsMap: embedsMap(content),
        selectedForAuthoring: resource.id === (options.selectedResourceId ?? null),
        shape: options.resourceShape?.(resource.id) ?? DEFAULT_RESOURCE_SHAPE,
        ownContent: resource.content,
        mapContent: resolvedMapContent(resource.kind, options.mapContent?.(resource.id)),
        embeddable: referencedResources(space, resource),
        activeGraphId,
        activeGraphColor: options.activeGraphColor ?? FALLBACK_COLOR,
        borderColor: emphasis.borderColor,
        receding: emphasis.receding,
      },
      className: 'rf-resource-node',
    };
    // Carry the map's dimensions through when it has placed the resource. Every
    // strategy works at a fixed `RESOURCE_SIZE`, so declaring width/height
    // here means React Flow renders the node at exactly the size the map
    // reasoned about — no measure-then-reflow, and a centred `nodeOrigin` (if a
    // view chooses one) resolves correctly on first paint. Absent before the
    // layout resolves, so React Flow falls back to measuring.
    //
    // `measured` is deliberately *not* set alongside them. React Flow documents
    // it as an output it writes after measuring, and it is redundant as an
    // input: `nodeHasDimensions` reads `measured?.width ?? width ?? initialWidth`,
    // so width/height already answer it, and a Resource counts as initialized on
    // those plus its declared `handles`. What supplying it would change is that
    // React Flow preserves cached `handleBounds` instead of resetting them for
    // re-measure — a distinction with no meaning here, because the bounds come
    // from `declaredHandles` either way.
    if (placedResource) {
      node.width = placedResource.width;
      node.height = placedResource.height;
      node.handles = declaredHandles(placedResource);
    }
    return node;
  });
}

export interface ProjectGraphEdgesOptions {
  /** The graph to emphasise, if any. */
  activeGraphId?: GraphId | null;
  /** What each Graph's Edges end in (ADR 0105). */
  headShapes?: HeadShapeByGraphId;
}

/**
 * Map graph-derived edges → coloured React Flow edges.
 */
export function projectGraphEdges(
  graphRenderEdges: readonly GraphRenderEdge[],
  colors: ColorByGraphId,
  options: ProjectGraphEdgesOptions = {},
): RoutedFlowEdge[] {
  const activeGraphId = options.activeGraphId ?? null;

  const lanes = graphLanes(graphRenderEdges, activeGraphId);

  // React Flow paints Edges in the order it is given them, so the Active Graph
  // goes last: wherever it crosses another Graph's Edge, its stroke is the one
  // on top.
  const drawn = graphRenderEdges.map((edge) => {
    const color = colors[edge.graphId] ?? FALLBACK_COLOR;
    const isActiveGraph = edge.graphId === activeGraphId;
    const receding = activeGraphId !== null && !isActiveGraph;
    const headSize = receding ? 'small' : 'full';
    const lane = lanes.get(edge.id) ?? { offset: 0, side: 'screen', reach: 0, endTrim: 0 };

    const data: RoutedEdgeData = {
      graphId: edge.graphId,
      laneOffset: lane.offset,
      laneSide: lane.side,
      laneReach: lane.reach,
      endTrim: lane.endTrim,
      headShape: options.headShapes?.[edge.graphId] ?? DEFAULT_GRAPH_HEAD_SHAPE,
      headSize,
    };
    if (edge.title !== undefined) data.title = edge.title;
    if (edge.titleHidden === true) data.titleHidden = true;

    const flowEdge: RoutedFlowEdge = {
      id: edge.id,
      // A custom edge, drawing a bezier between the handles React Flow resolved.
      type: ROUTED_EDGE_TYPE,
      source: edge.source,
      target: edge.target,
      className: `rf-graph-edge rf-graph-edge--${edge.graphId}${isActiveGraph ? ' rf-graph-edge--active' : ''}`,
      // Never `animated`: React Flow's marching dash draws the emphasised Graph in
      // constant motion, which competes with every Resource on the canvas for
      // attention. Emphasis is the stroke's width, opacity and paint order.
      animated: false,
      // Its Graph's head marker at this size, which `GraphHeadMarkers` draws
      // once for the canvas and React Flow hands the Edge as `url('#…')`.
      markerEnd: graphHeadMarkerId(edge.graphId, headSize),
      style: {
        stroke: graphPaint(color),
        strokeWidth: isActiveGraph ? 3 : receding ? RECEDING_STROKE_WIDTH : 2,
        opacity: receding ? OTHER_GRAPH_OPACITY : 1,
      },
      data,
    };
    return { flowEdge, onTop: isActiveGraph };
  });
  return [
    ...drawn.filter(({ onTop }) => !onTop).map(({ flowEdge }) => flowEdge),
    ...drawn.filter(({ onTop }) => onTop).map(({ flowEdge }) => flowEdge),
  ];
}
