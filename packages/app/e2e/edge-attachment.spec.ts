import { COLLAPSED_RESOURCE_SIZE } from '@project/core';
import { expect, test, type Page } from './fixtures';
import {
  activateGraph,
  authoringHandle,
  connectHandles,
  dragBy,
  nodeByTitle,
  positionOf,
  selectCanvas,
  settled,
} from './graph';

/**
 * Where an Edge meets a Resource (ADR 0087).
 *
 * An Edge attaches to the anchor on the side that faces the other Resource, chosen
 * while it is drawn from where the two Resources are at that moment. Nothing about
 * it is stored, and nothing decides it before the frame it is drawn in — which
 * is why these are browser tests: the rule itself is a pure function of two
 * rects and is covered in the node environment, and what only a browser can show
 * is that the side is right *during* a drag and not merely after it.
 */

/** Half the 24-unit anchor. React Flow puts an Edge's end on the outer rim of the
 *  handle it attaches to, which is the border plus this. */
const RADIUS = 12;

type Side = 'top' | 'right' | 'bottom' | 'left';

/** A point on the canvas, in flow coordinates. */
interface Point {
  readonly x: number;
  readonly y: number;
}

/** Where an Edge meets one side of a Resource at the given flow position. */
function anchorAt(at: Point, side: Side): Point {
  const { width, height } = COLLAPSED_RESOURCE_SIZE;
  switch (side) {
    case 'top':
      return { x: at.x + width / 2, y: at.y - RADIUS };
    case 'right':
      return { x: at.x + width + RADIUS, y: at.y + height / 2 };
    case 'bottom':
      return { x: at.x + width / 2, y: at.y + height + RADIUS };
    case 'left':
      return { x: at.x - RADIUS, y: at.y + height / 2 };
  }
}

/**
 * The two ends of a drawn Edge, in flow coordinates.
 *
 * `getBezierPath` writes `M<sourceX>,<sourceY> C… <targetX>,<targetY>`, and the
 * SVG sits inside React Flow's transformed viewport, so these are the same
 * coordinates a node's own transform is written in.
 */
async function endsOf(page: Page, edge: string): Promise<{ from: Point; to: Point }> {
  const d = await page
    .locator(`.react-flow__edge[data-id="${edge}"] .react-flow__edge-path`)
    .getAttribute('d');
  if (d === null) throw new Error(`Edge ${edge} drew no path.`);
  const numbers = d.match(/-?\d+(?:\.\d+)?/g) ?? [];
  expect(numbers, `path "${d}" should be a bezier with four points`).toHaveLength(8);
  const at = (index: number): Point => ({
    x: Number(numbers[index]),
    y: Number(numbers[index + 1]),
  });
  return { from: at(0), to: at(6) };
}

/** Playwright's pointer arithmetic lands within a unit or two of the delta asked
 *  for, so an anchor is compared to the position the canvas actually reports. */
const near = (actual: Point, expected: Point, what: string): void => {
  expect(Math.abs(actual.x - expected.x), `${what} x`).toBeLessThan(2);
  expect(Math.abs(actual.y - expected.y), `${what} y`).toBeLessThan(2);
};

/** The fixture's Long Graph, and the Edge it draws from A to B. An Edge is
 *  identified by its Graph and its two endpoints (`graphRenderEdgeId`). Long is
 *  the fixture's Active Graph, so its Edge takes the centre lane and runs
 *  anchor to anchor (ADR 0142). */
const LONG = '00000000-0000-4000-8000-000000000023';
const MID = '00000000-0000-4000-8000-000000000024';
const SHORT = '00000000-0000-4000-8000-000000000025';
const RESOURCE_A = '00000000-0000-4000-8000-000000000002';
const RESOURCE_B = '00000000-0000-4000-8000-000000000003';
const RESOURCE_C = '00000000-0000-4000-8000-000000000005';
const RESOURCE_D = '00000000-0000-4000-8000-000000000006';
const RESOURCE_A_PRIME = '00000000-0000-4000-8000-00000000000c';
const A_TO_B = `${LONG}::${RESOURCE_A}::${RESOURCE_B}`;
const A_TO_A = `${LONG}::${RESOURCE_A}::${RESOURCE_A}`;

/** Every drawn Edge the selector matches: its id, path, stroke and the head
 *  shape its end marker draws. */
async function drawnLines(page: Page, selector: string) {
  return page.locator(selector).evaluateAll((elements) =>
    elements.map((element) => {
      const path = element.querySelector('.react-flow__edge-path');
      return {
        id: element.getAttribute('data-id') ?? '',
        d: path?.getAttribute('d') ?? '',
        stroke: path === null ? '' : getComputedStyle(path).stroke,
        head: (() => {
          const id = /^url\('#(.+)'\)$/.exec(path?.getAttribute('marker-end') ?? '')?.[1];
          const marker = id === undefined ? null : document.getElementById(id);
          return (
            marker
              ?.querySelector('[data-slot="graph-head-shape"]')
              ?.getAttribute('data-head-shape') ?? null
          );
        })(),
      };
    }),
  );
}

test('an Edge leaves and enters on the sides the two Resources face', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const a = nodeByTitle(page, 'A').first();
  const b = nodeByTitle(page, 'B').first();
  await expect(a).toBeVisible();
  await settled(page);

  // A sits to the left of B, clear of it horizontally and level with it, so the
  // Edge crosses the gap: out of A's right side and into B's left.
  {
    const [from, to] = [await positionOf(a), await positionOf(b)];
    const ends = await endsOf(page, A_TO_B);
    near(ends.from, anchorAt(from, 'right'), 'the Edge leaving A');
    near(ends.to, anchorAt(to, 'left'), 'the Edge entering B');
  }

  // Put A below B. Nothing about the Edge is authored, so what changes is only
  // where the two Resources are — and the Edge now leaves A's top and enters B's
  // bottom.
  await dragBy(page, a, 420, 488);
  await settled(page);
  {
    const [from, to] = [await positionOf(a), await positionOf(b)];
    expect(from.y, 'A should have landed below B').toBeGreaterThan(to.y + 300);
    const ends = await endsOf(page, A_TO_B);
    near(ends.from, anchorAt(from, 'top'), 'the Edge leaving A');
    near(ends.to, anchorAt(to, 'bottom'), 'the Edge entering B');
  }
});

test('the attachment follows the drag rather than waiting for the release', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();
  await settled(page);
  const atRest = await endsOf(page, A_TO_B);

  // Read mid-gesture, with the pointer still down. This is the whole reason the
  // side is chosen in the Edge rather than in the projection: the projection
  // does not run again during a drag — the render adapter splices React Flow's
  // live positions into the published projection and leaves the Edges as they
  // were — so an Edge that took its side from there would stay on A's right and
  // cross A until the author let go.
  await dragBy(page, a, 420, 488, async () => {
    const moving = await positionOf(a);
    const ends = await endsOf(page, A_TO_B);
    expect(ends.from, 'the Edge should not still leave where it did at rest').not.toEqual(
      atRest.from,
    );
    near(ends.from, anchorAt(moving, 'top'), 'the Edge leaving A mid-drag');
  });
});

test('a self-Edge draws a visible loop', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();
  await settled(page);
  const before = await page.locator('.react-flow__edge').count();

  // A Graph may hold an Edge from a Resource to itself (ADR 0032). The facing rule
  // would answer this pair rather than fail on it — one rect against itself
  // settles on Bottom leaving and Top entering — and those two sides face away
  // from each other with the Resource between them, so the curve would be drawn
  // through it. That is why the self-Edge is taken first.
  await a.hover();
  await connectHandles(
    page,
    authoringHandle(a, 'source', 'right'),
    authoringHandle(a, 'target', 'top'),
  );
  await expect(page.locator('.react-flow__edge')).toHaveCount(before + 1);
  await settled(page);

  // Two adjacent sides, so the curve goes round the corner rather than doubling
  // back through the Resource it belongs to.
  const at = await positionOf(a);
  const ends = await endsOf(page, A_TO_A);
  near(ends.from, anchorAt(at, 'right'), 'the self-Edge leaving A');
  near(ends.to, anchorAt(at, 'top'), 'the self-Edge entering A');

  // And nothing anywhere draws `NaN`, which React Flow renders as no line at all.
  const paths = await page
    .locator('.react-flow__edge-path')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('d') ?? ''));
  expect(paths.every((d) => d.length > 0 && !d.includes('NaN'))).toBe(true);
});

test('several Graphs over one pair of Resources run as parallel lines, each ending in its own head', async ({
  page,
}) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  // Long, Mid and Short all carry A → B, and A and B sit level: each a level
  // line of its own, in its own colour. Where each runs and how much of it is
  // drawn is the next test's. Every line ends in its Graph's head shape
  // (ADR 0105): Long stores none and ends in an arrow, Mid a dot and Short a
  // diamond, so the three tell apart with colour removed.
  const lines = await drawnLines(
    page,
    `.react-flow__edge[data-id$="::${RESOURCE_A}::${RESOURCE_B}"]`,
  );
  expect(lines.length, 'three Graphs carry A → B').toBe(3);
  expect(new Set(lines.map((line) => line.stroke)).size, 'each in its own colour').toBe(3);
  for (const line of lines) {
    const ys = (line.d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number).filter((_, i) => i % 2 === 1);
    expect(Math.max(...ys) - Math.min(...ys), `${line.id} is a level line`).toBeLessThan(0.01);
  }
  expect(
    Object.fromEntries(lines.map((line) => [line.id.split('::')[0], line.head])),
    'each line ends in its own Graph’s head shape',
  ).toEqual({ [LONG]: 'arrow', [MID]: 'dot', [SHORT]: 'diamond' });

  // Every drawn Edge ends in its Graph's head shape, not only the ones over A and B.
  const every = await drawnLines(page, '.react-flow__edge');
  expect(every.length, 'Long, Mid and Short draw nine Edges between them').toBe(9);
  const headOf = new Map([
    [LONG, 'arrow'],
    [MID, 'dot'],
    [SHORT, 'diamond'],
  ]);
  for (const edge of every) {
    expect(edge.head, `${edge.id} ends in its Graph’s head shape`).toBe(
      headOf.get(edge.id.split('::')[0] ?? ''),
    );
  }
  // Nine Edges name three markers: each Graph's is drawn once for the canvas,
  // in one `<defs>`, and no Edge draws one of its own.
  await expect(page.locator('.react-flow marker'), 'one head marker per Graph').toHaveCount(3);
  await expect(page.locator('.react-flow defs:has(marker)')).toHaveCount(1);
  await expect(page.locator('.react-flow__edge marker')).toHaveCount(0);
});

/**
 * Where a straight Edge runs beside the line between its two anchors and how
 * much of it is drawn: its lane, in lane spacings, on the screen (positive
 * below a horizontal Edge, right of a vertical one), and the fraction of its
 * length left undrawn at each end. `from` and `to` are the anchors it leaves
 * and enters, unmoved, and `horizontal` whether they sit on left and right
 * sides. The trim is measured along a straight Edge only.
 */
async function laneOf(page: Page, edge: string, from: Point, to: Point, horizontal: boolean) {
  const d = await page
    .locator(`.react-flow__edge[data-id="${edge}"] .react-flow__edge-path`)
    .getAttribute('d');
  const n = (d?.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  expect(n.length, `${edge} draws a path`).toBeGreaterThanOrEqual(8);
  const [startX = 0, startY = 0] = n;
  const [endX = 0, endY = 0] = n.slice(-2);
  const across = horizontal ? [startY - from.y, endY - to.y] : [startX - from.x, endX - to.x];
  const along = horizontal
    ? [(startX - from.x) / (to.x - from.x), (to.x - endX) / (to.x - from.x)]
    : [(startY - from.y) / (to.y - from.y), (to.y - endY) / (to.y - from.y)];
  const [startAcross = 0, endAcross = 0] = across;
  const [startTrim = 0, endTrim = 0] = along;
  // A dragged Resource lands within a unit or two of where it was sent, so a
  // line meant to be straight may lean by a fraction of a unit.
  expect(Math.abs(endAcross - startAcross), `${edge} runs parallel to its anchors`).toBeLessThan(
    0.5,
  );
  expect(Math.abs(endTrim - startTrim), `${edge} is cut the same at both ends`).toBeLessThan(0.02);
  return { lane: startAcross / GRAPH_LANE_SPACING, trim: startTrim };
}

/** The fixture's lane spacing, in flow units (`GRAPH_LANE_SPACING`). */
const GRAPH_LANE_SPACING = 8;

/** The two anchors A → B leaves and enters, and whether they sit on left and right sides. */
interface Anchors {
  readonly from: Point;
  readonly to: Point;
  readonly horizontal: boolean;
}

/** A → B's anchors: A's right and B's left where they sit level, A's bottom and B's top where B is below. */
async function anchorsAB(page: Page, horizontal: boolean): Promise<Anchors> {
  const [a, b] = [nodeByTitle(page, 'A').first(), nodeByTitle(page, 'B').first()];
  return {
    from: anchorAt(await positionOf(a), horizontal ? 'right' : 'bottom'),
    to: anchorAt(await positionOf(b), horizontal ? 'left' : 'top'),
    horizontal,
  };
}

/** An Edge's id, and the lane and trim it should be drawn at. */
type ExpectedLane = readonly [edge: string, lane: number, trim: number];

/**
 * Checks each Edge over one pair of Resources, `from` leaving and `to`
 * entering, against the lane and trim it should have. An Edge running the
 * other way leaves `to` and enters `from`.
 */
async function expectLanes(
  page: Page,
  what: string,
  { from, to, horizontal }: Anchors,
  expected: readonly ExpectedLane[],
) {
  for (const [edge, lane, trim] of expected) {
    const forwards = edge.endsWith(`::${RESOURCE_A}::${RESOURCE_B}`);
    const [leaves, enters] = forwards ? [from, to] : [to, from];
    const measured = await laneOf(page, edge, leaves, enters, horizontal);
    expect(measured.lane, `${what}: ${edge} lane`).toBeCloseTo(lane, 1);
    expect(measured.trim, `${what}: ${edge} trim`).toBeCloseTo(trim, 1);
  }
}

const over = (graph: string, from: string, to: string) => `${graph}::${from}::${to}`;
const AB = (graph: string) => over(graph, RESOURCE_A, RESOURCE_B);
const BA = (graph: string) => over(graph, RESOURCE_B, RESOURCE_A);

test('a pair running one way puts the Active Graph on the centre, the rest stacked below and ranked shorter', async ({
  page,
}) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const b = nodeByTitle(page, 'B').first();
  await expect(nodeByTitle(page, 'D').first()).toBeVisible();
  await settled(page);

  // Long, Mid and Short all carry A → B. Whichever is active runs on the
  // centre line, anchor to anchor; the rest stack one lane further below each
  // in Graph order, and each a tenth shorter at each end than the one inside it.
  await expectLanes(page, 'Long active', await anchorsAB(page, true), [
    [AB(LONG), 0, 0],
    [AB(MID), 1, 0.1],
    [AB(SHORT), 2, 0.2],
  ]);
  await activateGraph(page, 'Mid');
  await settled(page);
  await expectLanes(page, 'Mid active', await anchorsAB(page, true), [
    [AB(MID), 0, 0],
    [AB(LONG), 1, 0.1],
    [AB(SHORT), 2, 0.2],
  ]);

  // Only Long joins D and A′, so its Edge there is first in its direction and
  // runs anchor to anchor on the centre although Mid is active.
  const [d, aPrime] = [nodeByTitle(page, 'D').first(), nodeByTitle(page, 'A′').first()];
  const lone = await laneOf(
    page,
    over(LONG, RESOURCE_D, RESOURCE_A_PRIME),
    anchorAt(await positionOf(d), 'right'),
    anchorAt(await positionOf(aPrime), 'left'),
    true,
  );
  expect(lone.lane, 'Long’s lone D → A′ on the centre').toBeCloseTo(0, 1);
  expect(lone.trim, 'Long’s lone D → A′ full length').toBeCloseTo(0, 1);

  await activateGraph(page, 'Short');
  await settled(page);
  await expectLanes(page, 'Short active', await anchorsAB(page, true), [
    [AB(SHORT), 0, 0],
    [AB(LONG), 1, 0.1],
    [AB(MID), 2, 0.2],
  ]);

  // Long and Mid join C and D, and Short does not: with Short active, Long is
  // first in Graph order there, on the centre and full length, and Mid below it.
  const c = nodeByTitle(page, 'C').first();
  const [leavesC, entersD] = [
    anchorAt(await positionOf(c), 'right'),
    anchorAt(await positionOf(d), 'left'),
  ];
  const longCD = await laneOf(page, over(LONG, RESOURCE_C, RESOURCE_D), leavesC, entersD, true);
  const midCD = await laneOf(page, over(MID, RESOURCE_C, RESOURCE_D), leavesC, entersD, true);
  expect(longCD.lane, 'Long C → D on the centre').toBeCloseTo(0, 1);
  expect(longCD.trim, 'Long C → D full length').toBeCloseTo(0, 1);
  expect(midCD.lane, 'Mid C → D a lane below').toBeCloseTo(1, 1);
  expect(midCD.trim, 'Mid C → D a tenth short').toBeCloseTo(0.1, 1);

  // Stacked vertically, the rest run to the screen's right of the active one.
  await activateGraph(page, 'Mid');
  await dragBy(page, b, -420, 300);
  await settled(page);
  await expectLanes(page, 'B below A, Mid active', await anchorsAB(page, false), [
    [AB(MID), 0, 0],
    [AB(LONG), 1, 0.1],
    [AB(SHORT), 2, 0.2],
  ]);
});

test('a pair running both ways stacks each direction on its own left, the first in each direction full length', async ({
  page,
}) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const [a, b] = [nodeByTitle(page, 'A').first(), nodeByTitle(page, 'B').first()];
  await expect(a).toBeVisible();
  await settled(page);

  /** Draws B → A into the Active Graph. */
  const drawBA = async () => {
    const before = await page.locator('.react-flow__edge').count();
    await b.hover();
    await connectHandles(
      page,
      authoringHandle(b, 'source', 'left'),
      authoringHandle(a, 'target', 'right'),
    );
    await expect(page.locator('.react-flow__edge')).toHaveCount(before + 1);
    await settled(page);
  };

  // A → B travels right, so its left is above; B → A travels left, so its left
  // is below. Each direction starts half a lane out, its first Edge full length.
  await drawBA();
  await expectLanes(page, 'Long active, holding both directions', await anchorsAB(page, true), [
    [AB(LONG), -0.5, 0],
    [AB(MID), -1.5, 0.1],
    [AB(SHORT), -2.5, 0.2],
    [BA(LONG), 0.5, 0],
  ]);

  // Mid has no B → A yet, so Long's B → A, alone in its direction, stays full
  // length though Long is no longer active.
  await activateGraph(page, 'Mid');
  await settled(page);
  await expectLanes(page, 'Mid active, in A → B only', await anchorsAB(page, true), [
    [AB(MID), -0.5, 0],
    [AB(LONG), -1.5, 0.1],
    [AB(SHORT), -2.5, 0.2],
    [BA(LONG), 0.5, 0],
  ]);

  // Two Edges B → A, Mid's first while Mid is active.
  await drawBA();
  await expectLanes(page, 'Mid active, holding both directions', await anchorsAB(page, true), [
    [AB(MID), -0.5, 0],
    [AB(LONG), -1.5, 0.1],
    [AB(SHORT), -2.5, 0.2],
    [BA(MID), 0.5, 0],
    [BA(LONG), 1.5, 0.1],
  ]);

  await activateGraph(page, 'Short');
  await settled(page);
  await expectLanes(page, 'Short active, in A → B only', await anchorsAB(page, true), [
    [AB(SHORT), -0.5, 0],
    [AB(LONG), -1.5, 0.1],
    [AB(MID), -2.5, 0.2],
    [BA(LONG), 0.5, 0],
    [BA(MID), 1.5, 0.1],
  ]);

  await activateGraph(page, 'Long');
  await settled(page);
  await expectLanes(page, 'Long active, holding both directions', await anchorsAB(page, true), [
    [AB(LONG), -0.5, 0],
    [AB(MID), -1.5, 0.1],
    [AB(SHORT), -2.5, 0.2],
    [BA(LONG), 0.5, 0],
    [BA(MID), 1.5, 0.1],
  ]);

  // Stacked vertically, A → B travels down, so its left is the screen's right,
  // and B → A travels up, so its left is the screen's left.
  const vertical: readonly ExpectedLane[] = [
    [AB(LONG), 0.5, 0],
    [AB(MID), 1.5, 0.1],
    [AB(SHORT), 2.5, 0.2],
    [BA(LONG), -0.5, 0],
    [BA(MID), -1.5, 0.1],
  ];

  await dragBy(page, b, -420, 300);
  await settled(page);
  await expectLanes(page, 'B below A, Long active', await anchorsAB(page, false), vertical);

  // Halfway through a drag that takes B on down and to the left, the sides
  // already hold. The projection does not run during a drag, so the side has
  // to come from the travel as each lane is drawn. Read at the anchors only:
  // the lanes curve here, so how much of each is drawn is not a straight
  // line's trim, and pointer arithmetic lands within a unit or two, so the
  // side is checked to the nearest half lane.
  await dragBy(page, b, -420, 300, async () => {
    const { from, to } = await anchorsAB(page, false);
    const downward = await laneOf(page, AB(LONG), from, to, false);
    const upward = await laneOf(page, BA(LONG), to, from, false);
    expect(downward.lane, 'A → B mid-drag, on the screen’s right').toBeCloseTo(0.5, 0);
    expect(upward.lane, 'B → A mid-drag, on the screen’s left').toBeCloseTo(-0.5, 0);
  });
});

test('loops on one Resource nest outwards, the Active Graph’s innermost and full length', async ({
  page,
}) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();
  await settled(page);

  // One loop on A in each of Long, Mid and Short, drawn while each is active.
  for (const graph of ['Long', 'Mid', 'Short']) {
    await activateGraph(page, graph);
    const before = await page.locator('.react-flow__edge').count();
    await a.hover();
    await connectHandles(
      page,
      authoringHandle(a, 'source', 'right'),
      authoringHandle(a, 'target', 'top'),
    );
    await expect(page.locator('.react-flow__edge')).toHaveCount(before + 1);
    await settled(page);
  }

  // Read from the drawn paths: a loop's lane moves both its ends one lane
  // further from the corner per lane, so its middle runs further out; its trim
  // cuts the same fraction from each end, so a further-out, more-trimmed loop
  // starts further from where its untrimmed lane would. The Active Graph's
  // loop runs anchor to anchor.
  const loopsOf = async () =>
    page.locator('.react-flow__edge-path').evaluateAll(
      (paths, ids) =>
        ids.map((id) => {
          const path = paths.find((each) => each.closest(`[data-id="${id}"]`) !== null);
          if (!(path instanceof SVGPathElement)) throw new Error(`No loop drawn for ${id}.`);
          const length = path.getTotalLength();
          const at = (distance: number) => {
            const point = path.getPointAtLength(distance);
            return { x: point.x, y: point.y };
          };
          return { id, start: at(0), middle: at(length / 2), end: at(length) };
        }),
      [LONG, MID, SHORT].map((graph) => over(graph, RESOURCE_A, RESOURCE_A)),
    );
  const expectLoops = async (what: string, inOrder: readonly string[]) => {
    const at = await positionOf(a);
    const [right, top] = [anchorAt(at, 'right'), anchorAt(at, 'top')];
    const corner = { x: right.x, y: top.y };
    const loops = await loopsOf();
    const ranked = inOrder.map((graph) => {
      const found = loops.find((each) => each.id === over(graph, RESOURCE_A, RESOURCE_A));
      if (found === undefined) throw new Error(`${what}: no loop for ${graph}.`);
      return found;
    });
    const [innermost, ...outer] = ranked;
    if (innermost === undefined) throw new Error(`${what}: no loops.`);
    near(innermost.start, right, `${what}: the active loop leaving A`);
    near(innermost.end, top, `${what}: the active loop entering A`);
    const outwards = ranked.map(({ middle }) =>
      Math.hypot(middle.x - corner.x, middle.y - corner.y),
    );
    const cut = outer.map(({ start }, index) =>
      Math.hypot(start.x - right.x, start.y - (right.y + (index + 1) * GRAPH_LANE_SPACING)),
    );
    for (let index = 1; index < ranked.length; index += 1) {
      expect(
        outwards[index],
        `${what}: ${inOrder[index]} runs outside ${inOrder[index - 1]}`,
      ).toBeGreaterThan((outwards[index - 1] ?? 0) + GRAPH_LANE_SPACING / 4);
    }
    expect(cut[0], `${what}: ${inOrder[1]} stops short`).toBeGreaterThan(4);
    expect(cut[1], `${what}: ${inOrder[2]} stops shorter`).toBeGreaterThan((cut[0] ?? 0) + 4);
  };

  await expectLoops('Short active', [SHORT, LONG, MID]);
  await activateGraph(page, 'Mid');
  await settled(page);
  await expectLoops('Mid active', [MID, LONG, SHORT]);
});

/** The colour the page paints at a point on screen, as `[r, g, b]`. */
async function pixelAt(page: Page, point: Point): Promise<number[]> {
  const png = await page.screenshot({
    clip: { x: Math.floor(point.x), y: Math.floor(point.y), width: 1, height: 1 },
  });
  return page.evaluate(async (base64) => {
    const image = await createImageBitmap(
      await (await fetch(`data:image/png;base64,${base64}`)).blob(),
    );
    const context = new OffscreenCanvas(1, 1).getContext('2d');
    if (context === null) throw new Error('No 2D context to read a pixel with.');
    context.drawImage(image, 0, 0);
    return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)];
  }, png.toString('base64'));
}

test("a receding Graph's head is painted at its Edge's opacity", async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  // Long is active, so Mid recedes. Its marker is shared with every Mid Edge
  // and lives outside the Edge, so what is proved here is that a marker is
  // painted as part of the path naming it: at the path's opacity.
  const line = page.locator(
    `.react-flow__edge[data-id="${MID}::${RESOURCE_A}::${RESOURCE_B}"] .react-flow__edge-path`,
  );
  const { head, body, stroke, opacity } = await line.evaluate((element) => {
    if (!(element instanceof SVGPathElement)) throw new Error('An Edge draws a path.');
    const style = getComputedStyle(element);
    const length = element.getTotalLength();
    const tip = element.getPointAtLength(length);
    const back = element.getPointAtLength(length - 1);
    const [dx, dy] = [tip.x - back.x, tip.y - back.y];
    // A dot's centre lies three frame units behind the tip, and a frame unit
    // is 12.5/20 of a stroke width (`GraphHeadMarker`). The line runs through
    // it too, so an opaque head would paint the Graph's full colour there.
    const behind = 3 * ((Number.parseFloat(style.strokeWidth) * 12.5) / 20);
    const screen = (x: number, y: number) => {
      const matrix = element.getScreenCTM();
      if (matrix === null) throw new Error('The Edge is not on screen.');
      const at = new DOMPoint(x, y).matrixTransform(matrix);
      return { x: at.x, y: at.y };
    };
    const middle = element.getPointAtLength(length / 2);
    return {
      head: screen(tip.x - dx * behind, tip.y - dy * behind),
      body: screen(middle.x, middle.y),
      stroke: (style.stroke.match(/\d+/g) ?? []).slice(0, 3).map(Number),
      opacity: style.opacity,
    };
  });
  expect(opacity, 'Mid recedes').toBe('0.35');

  const [atHead, atBody] = [await pixelAt(page, head), await pixelAt(page, body)];
  const distance = (a: number[], b: number[]) =>
    Math.max(...a.map((channel, index) => Math.abs(channel - b[index]!)));
  // Mid's colour is pale, so an opaque head would differ from the translucent
  // line by little more than the line differs from the colour: the bounds sit
  // either side of the middle of that gap.
  expect(distance(atBody, stroke), 'the line itself is translucent').toBeGreaterThan(20);
  expect(distance(atHead, stroke), 'the head is not painted opaque').toBeGreaterThan(20);
  expect(distance(atHead, atBody), 'the head is as translucent as its line').toBeLessThan(12);
});

test('a selected Edge draws its controls on the geometry it moved to', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();
  await settled(page);

  await dragBy(page, a, 420, 488);
  await settled(page);

  // Click the drawn path's own middle, which is where the controls must arrive:
  // both come from one `useRoutedEdgeGeometry`, so a disagreement between them
  // would be a disagreement with what is on screen.
  const middle = await page
    .locator(`.react-flow__edge[data-id="${A_TO_B}"] .react-flow__edge-path`)
    .first()
    .evaluate((path) => {
      // Narrowed rather than asserted: what the selector matches is React Flow's
      // own `<path>`, and the browser is where that can be checked instead of
      // claimed.
      if (!(path instanceof SVGPathElement)) throw new Error('The Edge drew no path element.');
      const transform = path.getScreenCTM();
      if (transform === null) throw new Error('The Edge has no screen transform.');
      const at = path.getPointAtLength(path.getTotalLength() / 2).matrixTransform(transform);
      return { x: at.x, y: at.y };
    });
  await page.mouse.click(middle.x, middle.y);
  await expect(page.locator('.react-flow__edge.selected')).toHaveCount(1);

  // The chrome layer is what `labelX`/`labelY` place: a zero-size anchor at
  // the Edge's middle, with an untitled Edge's toolbar centred on it.
  const layer = (await page.locator(`[data-edge-chrome="${A_TO_B}"]`).boundingBox())!;
  expect(Math.abs(layer.x - middle.x)).toBeLessThan(8);
  expect(Math.abs(layer.y - middle.y)).toBeLessThan(8);
  const toolbar = page.getByRole('toolbar', { name: 'Edge A → B', exact: true });
  await expect(toolbar).toBeVisible();
  const box = (await toolbar.boundingBox())!;
  expect(Math.abs(box.x + box.width / 2 - middle.x)).toBeLessThan(8);
  expect(Math.abs(box.y + box.height / 2 - middle.y)).toBeLessThan(8);
});
