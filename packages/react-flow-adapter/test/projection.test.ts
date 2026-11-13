import { describe, expect, it } from 'vitest';
import { buildGraphRenderEdges, loadSpace, type Space } from '@project/graph';
import type { ResourceId, ResourceShape, SpaceFile } from '@project/core';
import { graphPaint } from '@project/ui';
import { Position } from '@xyflow/react';
import { AUTHORING_HANDLE_DIAMETER } from '../src/authoring-handle';
import {
  projectResourceNodes,
  projectGraphEdges,
  OTHER_GRAPH_OPACITY,
  RECEDING_STROKE_WIDTH,
  ROUTED_EDGE_TYPE,
} from '../src/index';
import { imageFile, jsonResourceFile, referenceFile, resourceFile } from './resource-files';
import { ACTIVE_LANE_SPACING, GRAPH_LANE_SPACING } from '../src/edge-lanes';
import { uuid } from './uuid';

function load(
  input: unknown,
  resourceFiles = [
    ...resourceFile('00000000-0000-4000-8000-000000000002', 'Resource A'),
    ...resourceFile('00000000-0000-4000-8000-000000000003', 'Resource B'),
  ],
): Space {
  const result = loadSpace(input, resourceFiles);
  if (!result.ok) throw new Error('fixture should load');
  return result.space;
}

/**
 * A version 1 space document over the given graphs.
 *
 * A graph is an owned value of the map that holds it (ADR 0040), and
 * every edge endpoint must be a resource of *that* map, so the one map below
 * takes membership of every resource the graphs touch. The positions are arbitrary
 * — nothing in this file reads them — and what they express here is membership,
 * which is what a map's position keys are.
 *
 * Returned as `SpaceFile` rather than as `unknown`, although `loadSpace` takes
 * `unknown` and would accept either. The literal is the whole point: typed, the
 * next change to the aggregate fails here at `tsc`; untyped, it checks against
 * nothing and fails at runtime instead.
 */
function spaceFile(
  graphs: readonly { id: string; title: string; edges: readonly { from: string; to: string }[] }[],
): SpaceFile {
  const members = [...new Set(graphs.flatMap(({ edges }) => edges.flatMap((e) => [e.from, e.to])))];
  return {
    version: 1,
    id: uuid('00000000-0000-4000-8000-000000000001'),
    title: 'Test',
    maps: [
      {
        id: uuid('00000000-0000-4000-8000-000000000050'),
        title: 'Only map',
        kind: 'positioned',
        positions: Object.fromEntries(
          members.map((id, index) => [uuid(id), { x: index * 300, y: 0 }]),
        ),
        graphs: graphs.map(({ id, title, edges }) => ({
          id: uuid(id),
          title,
          edges: edges.map(({ from, to }) => ({ from: uuid(from), to: uuid(to) })),
        })),
      },
    ],
  };
}

const space = load(
  spaceFile([
    {
      id: '00000000-0000-4000-8000-000000000004',
      title: 'Main',
      edges: [
        {
          from: '00000000-0000-4000-8000-000000000002',
          to: '00000000-0000-4000-8000-000000000003',
        },
      ],
    },
    {
      id: '00000000-0000-4000-8000-000000000030',
      title: 'Alt',
      edges: [
        {
          from: '00000000-0000-4000-8000-000000000003',
          to: '00000000-0000-4000-8000-000000000002',
        },
      ],
    },
  ]),
);

const colors = {
  '00000000-0000-4000-8000-000000000004': '#111111',
  '00000000-0000-4000-8000-000000000030': '#222222',
};
describe('projectResourceNodes', () => {
  it.each(['space', 'markdown'] as const)(
    'publishes resolved %s geometry and actions for Closed and Open References',
    (kind) => {
      const targetId = uuid('00000000-0000-4000-8000-000000000002');
      const referenceId = uuid('00000000-0000-4000-8000-000000000007');
      const target =
        kind === 'markdown'
          ? resourceFile(targetId, 'Target', 'Body')
          : jsonResourceFile(targetId, 'Target', 'space', {
              spaceId: '00000000-0000-4000-8000-000000000009',
              map: '00000000-0000-4000-8000-000000000050',
              graph: '00000000-0000-4000-8000-000000000004',
            });
      const loaded = load(
        spaceFile([
          {
            id: '00000000-0000-4000-8000-000000000004',
            title: 'Main',
            edges: [{ from: targetId, to: referenceId }],
          },
        ]),
        [...target, ...referenceFile(referenceId, 'Reference', targetId)],
      );
      const nodes = projectResourceNodes(loaded);
      expect(nodes.find((node) => node.id === referenceId)?.data).toMatchObject({
        authorsContent: false,
        embedsMap: kind === 'space',
      });
      // A Markdown Resource's plugin edits its own content (ADR 0142).
      expect(nodes.find((node) => node.id === targetId)?.data).toMatchObject({
        authorsContent: kind === 'space',
        embedsMap: kind === 'space',
      });
    },
  );

  /**
   * Open is the Markdown plugin's Map content (ADR 0142): an entry that stores
   * none is drawn with the plugin's default, Closed, whoever draws the Map and
   * whether or not it may be authored, and one Map's Open is not another's.
   */
  it('draws a fresh Markdown Resource Closed, and each Map with its own Open', () => {
    const a = uuid('00000000-0000-4000-8000-000000000002');
    const nodes = projectResourceNodes(space);
    expect(nodes.find((n) => n.id === a)?.data.mapContent).toEqual({ open: false });
    const opened = projectResourceNodes(space, {
      mapContent: (id) => (id === a ? { open: true } : undefined),
    });
    expect(opened.find((n) => n.id === a)?.data.mapContent).toEqual({ open: true });
    expect(opened.filter((n) => n.id !== a).map((n) => n.data.mapContent)).not.toContainEqual({
      open: true,
    });
  });

  it('maps resources to resource nodes carrying the title, not the content', () => {
    const nodes = projectResourceNodes(space);
    const a = nodes.find((n) => n.id === '00000000-0000-4000-8000-000000000002')!;
    expect(a.type).toBe('resource');
    expect(a.data.title).toBe('Resource A');
    // ADR 0064: content is loaded when a resource is opened, not embedded per node.
    expect('markdown' in a.data).toBe(false);
  });

  it('carries the Shape the Map records for each Resource it projects', () => {
    const a = uuid('00000000-0000-4000-8000-000000000002');
    const resourceShape = (id: ResourceId): ResourceShape => (id === a ? 'diamond' : 'rectangle');
    const nodes = projectResourceNodes(space, { resourceShape });
    expect(nodes.find((n) => n.id === a)?.data.shape).toBe('diamond');
    expect(nodes.filter((n) => n.id !== a).map((n) => n.data.shape)).not.toContain('diamond');
  });

  it('uses the positions a map put on the resources', () => {
    const nodes = projectResourceNodes(space, {
      strategyGraph: {
        resources: [
          {
            id: uuid('00000000-0000-4000-8000-000000000002'),
            x: 500,
            y: 600,
            width: 260,
            height: 300,
          },
        ],
        edges: [],
      },
    });
    const a = nodes.find((n) => n.id === '00000000-0000-4000-8000-000000000002')!;
    expect(a.position).toEqual({ x: 500, y: 600 });
    // A position is all a strategy answers (ADR 0086), and the rect it placed is
    // what the node declares — width and height together with the handles, since
    // React Flow re-measures a node that carries no measured size.
    expect(a.width).toBe(260);
    expect(a.height).toBe(300);
    // resource b is absent from the map → falls back to the origin (no authored position).
    expect(nodes.find((n) => n.id === '00000000-0000-4000-8000-000000000003')!.position).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("declares four anchors of each role on the rim of the Resource's own box", () => {
    // A Resource's anchors follow the rect it occupies rather than a constant: the
    // strategies arrange every collapsed Resource at `RESOURCE_SIZE`, so this differs
    // only for an Open one (ADR 0064) — and it has to, or an Edge attaches
    // partway down a box the Resource no longer fills.
    const nodes = projectResourceNodes(space, {
      strategyGraph: {
        resources: [
          {
            id: uuid('00000000-0000-4000-8000-000000000002'),
            x: 0,
            y: 0,
            width: 560,
            height: 420,
          },
        ],
        edges: [],
      },
    });
    const a = nodes.find((n) => n.id === '00000000-0000-4000-8000-000000000002')!;
    const radius = AUTHORING_HANDLE_DIAMETER / 2;
    const declared = (a.handles ?? []).map((handle) => ({
      id: handle.id,
      type: handle.type,
      position: handle.position,
      x: handle.x,
      y: handle.y,
    }));

    expect(declared).toHaveLength(8);
    for (const role of ['source', 'target'] as const) {
      expect(declared.filter((handle) => handle.type === role)).toEqual([
        {
          id: `authoring-${role}-top`,
          type: role,
          position: Position.Top,
          x: 280 - radius,
          y: -radius,
        },
        {
          id: `authoring-${role}-right`,
          type: role,
          position: Position.Right,
          x: 560 - radius,
          y: 210 - radius,
        },
        {
          id: `authoring-${role}-bottom`,
          type: role,
          position: Position.Bottom,
          x: 280 - radius,
          y: 420 - radius,
        },
        {
          id: `authoring-${role}-left`,
          type: role,
          position: Position.Left,
          x: -radius,
          y: 210 - radius,
        },
      ]);
    }
  });

  it('declares no geometry for a resource the strategy has not placed, leaving React Flow to measure it', () => {
    const nodes = projectResourceNodes(space, {
      strategyGraph: {
        resources: [
          {
            id: uuid('00000000-0000-4000-8000-000000000002'),
            x: 500,
            y: 600,
            width: 260,
            height: 300,
          },
        ],
        edges: [],
      },
    });
    const b = nodes.find((n) => n.id === '00000000-0000-4000-8000-000000000003')!;

    // Both keys are absent together, and that pairing is load-bearing: React Flow
    // reads declared handles only when they are there, and re-measures a node that
    // carries no measured size. Declaring one without the other strands a resource on
    // whichever half it kept.
    expect('handles' in b).toBe(false);
    expect('measured' in b).toBe(false);
  });

  it("carries a Reference Resource's Target for its plugin to embed, under the Reference Resource identity", () => {
    const referenceId = uuid('00000000-0000-4000-8000-000000000007');
    const withReference = load(
      spaceFile([
        {
          id: '00000000-0000-4000-8000-000000000004',
          title: 'Main',
          edges: [
            {
              from: '00000000-0000-4000-8000-000000000002',
              to: referenceId,
            },
          ],
        },
      ]),
      [
        ...resourceFile('00000000-0000-4000-8000-000000000002', 'Opening', '## Authored once'),
        ...referenceFile(referenceId, 'Return', '00000000-0000-4000-8000-000000000002'),
      ],
    );

    const nodes = projectResourceNodes(withReference);
    const target = withReference.resources.find(
      ({ id }) => id === '00000000-0000-4000-8000-000000000002',
    );
    expect(nodes.find((node) => node.id === referenceId)?.data).toMatchObject({
      title: 'Return',
      kind: 'reference',
      ownContent: { target: '00000000-0000-4000-8000-000000000002' },
      embeddable: [target],
    });
  });

  it('carries an Image Resource’s own kind, stored content and Map content to its plugin', () => {
    const imageId = uuid('00000000-0000-4000-8000-000000000008');
    const url = 'https://example.com/harbour.png';
    const withImage = load(
      spaceFile([
        {
          id: '00000000-0000-4000-8000-000000000004',
          title: 'Main',
          edges: [{ from: '00000000-0000-4000-8000-000000000002', to: imageId }],
        },
      ]),
      [
        ...resourceFile('00000000-0000-4000-8000-000000000002', 'Opening'),
        ...imageFile(imageId, 'Harbour', url),
      ],
    );
    const imageNode = (options: Parameters<typeof projectResourceNodes>[1]) =>
      projectResourceNodes(withImage, options).find((node) => node.id === imageId)?.data;

    expect(imageNode({})).toMatchObject({
      kind: 'image',
      ownContent: { url },
      mapContent: {},
    });
  });
});

describe('projectResourceNodes embeddable', () => {
  const imageId = uuid('00000000-0000-4000-8000-000000000008');
  const referenceId = uuid('00000000-0000-4000-8000-000000000009');
  const markdownId = uuid('00000000-0000-4000-8000-000000000002');
  const url = 'https://example.com/harbour.png';
  const withKinds = load(
    spaceFile([
      {
        id: '00000000-0000-4000-8000-000000000004',
        title: 'Main',
        edges: [
          { from: markdownId, to: imageId },
          { from: imageId, to: referenceId },
        ],
      },
    ]),
    [
      ...resourceFile(markdownId, 'Opening', '## Authored once'),
      ...imageFile(imageId, 'Harbour', url),
      ...referenceFile(referenceId, 'Harbour, again', imageId),
    ],
  );
  const embeddable = (id: string) =>
    projectResourceNodes(withKinds).find((node) => node.id === id)?.data.embeddable;

  it('carries what a Resource references for its plugin to embed, and nothing else', () => {
    expect(embeddable(markdownId)).toStrictEqual([]);
    expect(embeddable(imageId)).toStrictEqual([]);
    expect(embeddable(referenceId)).toStrictEqual(
      withKinds.resources.filter(({ id }) => id === imageId),
    );
  });
});

describe('projectGraphEdges', () => {
  const graphRenderEdges = buildGraphRenderEdges(space);
  // Each Graph's one Edge, named by the id `buildGraphRenderEdges` minted for
  // it rather than by a restated shape: that id is the Graph and the Edge's two
  // endpoints, and this file is about the projection rather than about how an
  // Edge is identified — `packages/graph/test/graph-rendering.test.ts` owns
  // that. Both fixture Graphs hold exactly one Edge.
  const edgeIdOf = (graphId: string): string =>
    graphRenderEdges.find((edge) => edge.graphId === uuid(graphId))!.id;
  const MAIN_EDGE_ID = edgeIdOf('00000000-0000-4000-8000-000000000004');
  const ALT_EDGE_ID = edgeIdOf('00000000-0000-4000-8000-000000000030');

  it('maps graph edges to coloured React Flow edges that name no handle', () => {
    const edges = projectGraphEdges(graphRenderEdges, colors);
    expect(edges).toHaveLength(2);
    const mainEdge = edges.find((e) => e.id === MAIN_EDGE_ID)!;
    expect(mainEdge).toMatchObject({
      type: ROUTED_EDGE_TYPE,
      source: '00000000-0000-4000-8000-000000000002',
      target: '00000000-0000-4000-8000-000000000003',
    });
    // The side is chosen while the Edge is drawn, from where its two Resources are
    // at that moment (ADR 0087), so there is nothing for the projection to name.
    expect(mainEdge.sourceHandle).toBeUndefined();
    expect(mainEdge.targetHandle).toBeUndefined();
    expect(mainEdge.style?.stroke).toBe(graphPaint('#111111'));
  });

  it('carries the Graph it belongs to and no geometry of its own', () => {
    const edges = projectGraphEdges(graphRenderEdges, colors);

    // The Edge data is the Graph id, its lane and how that lane is read, how
    // far out its pair's lanes reach, and its end trim, and no geometry
    // (ADR 0086). Both fixture Graphs join the same two Resources, Alt in the other
    // direction, so each stacks on its own left from half a lane out and each, first
    // in its direction, runs full length (ADR 0143). A Map has nowhere
    // to store waypoints, so the bezier the Edge draws between the two anchors
    // it attaches to is the only Edge geometry.
    expect(edges.find((e) => e.id === MAIN_EDGE_ID)!.data).toEqual({
      graphId: uuid('00000000-0000-4000-8000-000000000004'),
      laneOffset: GRAPH_LANE_SPACING / 2,
      laneSide: 'travel',
      laneReach: GRAPH_LANE_SPACING / 2,
      endTrim: 0,
      headShape: 'arrow',
      headSize: 'full',
    });
    expect(edges.find((e) => e.id === ALT_EDGE_ID)!.data).toEqual({
      graphId: uuid('00000000-0000-4000-8000-000000000030'),
      laneOffset: GRAPH_LANE_SPACING / 2,
      laneSide: 'travel',
      laneReach: GRAPH_LANE_SPACING / 2,
      endTrim: 0,
      headShape: 'arrow',
      headSize: 'full',
    });
  });

  it('carries an Edge Title and its hiding into the data the Edge draws from', () => {
    const [main, alt] = graphRenderEdges;
    const edges = projectGraphEdges(
      [
        { ...main!, title: 'depends on' },
        { ...alt!, title: 'then', titleHidden: true },
      ],
      colors,
    );

    expect(edges.find((e) => e.id === main!.id)!.data).toMatchObject({ title: 'depends on' });
    expect(edges.find((e) => e.id === main!.id)!.data).not.toHaveProperty('titleHidden');
    expect(edges.find((e) => e.id === alt!.id)!.data).toMatchObject({
      title: 'then',
      titleHidden: true,
    });
  });

  it('draws every graph the same when nothing is emphasised', () => {
    const edges = projectGraphEdges(graphRenderEdges, colors, {});
    expect(edges.every((e) => e.style?.opacity === 1)).toBe(true);
    expect(edges.every((e) => e.style?.strokeWidth === 2 && e.data?.headSize === 'full')).toBe(
      true,
    );
    expect(edges.some((e) => e.animated)).toBe(false);
  });

  it('recedes the other graphs while one is active, never hiding them', () => {
    const edges = projectGraphEdges(graphRenderEdges, colors, {
      activeGraphId: uuid('00000000-0000-4000-8000-000000000004'),
    });
    const main = edges.find((e) => e.id === MAIN_EDGE_ID)!;
    const alt = edges.find((e) => e.id === ALT_EDGE_ID)!;

    // The Active Graph is untouched.
    expect(main.style?.opacity).toBe(1);
    // Emphasis is never motion: the Active Graph's line is still.
    expect(main.animated).toBe(false);
    // Drawn wider; `EDGE_TITLE_BOX_CHROME` in `@project/ui` reckons with this
    // 3, since a Title's border is its Edge's stroke.
    expect(main.style?.strokeWidth).toBe(3);
    expect(main.data?.headSize).toBe('full');

    // The others recede to hairlines with small heads but are still drawn,
    // and none are dropped.
    expect(alt.style?.strokeWidth).toBe(RECEDING_STROKE_WIDTH);
    expect(alt.data?.headSize).toBe('small');
    expect(alt.style?.opacity).toBe(OTHER_GRAPH_OPACITY);
    expect(OTHER_GRAPH_OPACITY).toBeGreaterThan(0);
    expect(alt.animated).toBe(false);
    expect(edges).toHaveLength(graphRenderEdges.length);
  });

  describe('Graphs joining the same two Resources', () => {
    const [A, B, C] = ['a', 'b', 'c'].map((id) => uuid(`00000000-0000-4000-8000-00000000010${id}`));
    const [RED, BLUE, GREEN] = ['1', '2', '3'].map((id) =>
      uuid(`00000000-0000-4000-8000-00000000020${id}`),
    );
    const edge = (graphId: string, source: string, target: string) => ({
      id: `${graphId}::${source}::${target}`,
      graphId: uuid(graphId),
      source: uuid(source),
      target: uuid(target),
    });
    const shared = [edge(RED!, A!, B!), edge(BLUE!, A!, B!), edge(GREEN!, B!, C!)];
    const laneOf = (edges: ReturnType<typeof projectGraphEdges>, graphId: string) =>
      edges.find((e) => e.id.startsWith(graphId))!.data!.laneOffset;

    const dataOf = (edges: ReturnType<typeof projectGraphEdges>, graphId: string) =>
      edges.find((e) => e.id.startsWith(graphId))!.data!;

    it('carries the lane its Edge is given: the Active Graph centred, the rest beside it and shorter', () => {
      const edges = projectGraphEdges(shared, colors, {
        activeGraphId: uuid(BLUE!),
      });

      expect(dataOf(edges, BLUE!)).toMatchObject({
        laneOffset: 0,
        laneSide: 'screen',
        laneReach: ACTIVE_LANE_SPACING,
        endTrim: 0,
      });
      // Beside the Active Graph's Edge the lane opens to clear its full-size head.
      expect(dataOf(edges, RED!)).toMatchObject({
        laneOffset: ACTIVE_LANE_SPACING,
        laneSide: 'screen',
        laneReach: ACTIVE_LANE_SPACING,
        endTrim: 0.1,
      });
      // Green is alone on its pair, so it runs anchor to anchor although it is
      // not the Active Graph.
      expect(dataOf(edges, GREEN!)).toMatchObject({ laneOffset: 0, laneReach: 0, endTrim: 0 });
    });

    it("ends every Edge in its Graph's head shape, the ones that stop short included", () => {
      const edges = projectGraphEdges(shared, colors, {
        activeGraphId: uuid(BLUE!),
        headShapes: { [uuid(BLUE!)]: 'dot', [uuid(RED!)]: 'diamond' },
      });

      // Blue runs full length; Red stops short beside it and Green, alone,
      // runs full length. Each ends in its own Graph's head shape (ADR 0105),
      // and Green, storing none, ends in an arrow.
      expect(dataOf(edges, BLUE!)).toMatchObject({ endTrim: 0, headShape: 'dot' });
      expect(dataOf(edges, RED!)).toMatchObject({ endTrim: 0.1, headShape: 'diamond' });
      expect(dataOf(edges, GREEN!)).toMatchObject({ endTrim: 0, headShape: 'arrow' });
    });

    it("names its Graph's one head marker as the Edge's end marker", () => {
      const edges = projectGraphEdges(shared, colors, {
        activeGraphId: uuid(BLUE!),
        headShapes: { [uuid(BLUE!)]: 'dot' },
      });

      // One marker per Graph and size, whichever Edge of it this is and however
      // short; Green stores no head shape and still names its own. The Graphs
      // that recede name their small head.
      expect(edges.map((e) => [e.data!.graphId, e.markerEnd])).toEqual([
        [RED, 'graph-head-00000000-0000-4000-8000-000000000201-small'],
        [GREEN, 'graph-head-00000000-0000-4000-8000-000000000203-small'],
        [BLUE, 'graph-head-00000000-0000-4000-8000-000000000202'],
      ]);
    });

    it('moves the centre to whichever Graph becomes active', () => {
      const centred = (activeGraphId: string) => {
        const edges = projectGraphEdges(shared, colors, {
          activeGraphId: uuid(activeGraphId),
        });
        return [RED!, BLUE!].filter((graphId) => laneOf(edges, graphId) === 0);
      };

      expect(centred(RED!)).toEqual([RED]);
      expect(centred(BLUE!)).toEqual([BLUE]);
    });

    it('draws the Active Graph last, over the lanes it converges with', () => {
      const edges = projectGraphEdges(shared, colors, {
        activeGraphId: uuid(RED!),
      });

      expect(edges.map((e) => e.data!.graphId)).toEqual([BLUE, GREEN, RED]);
    });
  });
});
