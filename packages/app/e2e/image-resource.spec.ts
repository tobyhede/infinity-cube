// `test` comes from ./fixtures, not @playwright/test — it carries the auto-use
// gate that fails a test if React Flow logged a warning while it ran.
import { readFileSync } from 'node:fs';
import { COLLAPSED_RESOURCE_SIZE, encodeCompactUuid, uuidSchema, type UUID } from '@project/core';
import { decodeLoadedSpace } from '@project/persistence';
import { expect, test, type Locator, type Page } from './fixtures';
import {
  boxOf,
  createResource,
  createResourceControl,
  dock,
  dockNavigation,
  expectArrowOrder,
  expectAvailable,
  expectWithheld,
  nodeByTitle,
  openResource,
  presentControl,
  presentedResource,
  resourceToolbar,
  resourceControls,
  selectedCanvas,
  selectCanvas,
  newMap,
  settled,
  stageBody,
  stageFrame,
} from './graph';
import { expectPictureLoaded, HARBOUR_SIZE } from './image';
import { openFromRail } from './space-resource-frame';
import { SEEDED_MAP_ID, seedPositionedMap } from './seed';

const IMAGE_ID = uuidSchema.parse('00000000-0000-4000-8000-0000000000a1');
const DEEP_DIVE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000070');
const HARBOUR_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000076');
const FIGURE_URL = 'https://example.com/figure.png';
/** A picture many times the size of any frame the Stage draws. */
const OVERSIZED = { width: 4000, height: 3000 } as const;
/**
 * The tracked fixture's 400×300 picture, served in place of the external URL so
 * nothing reaches the network.
 */
const HARBOUR = readFileSync(
  new URL('../fixture/assets/fZoCiTSlSs9w9S87nrFeaOkPdKB4wvFrbWfaMn23ZOs.png', import.meta.url),
);

interface Pictures {
  /** The Image Resource's Title. */
  readonly title?: string;
  /** Give the seeded Graph an Edge from the Image Resource to itself, so presenting starts there. */
  readonly presentable?: boolean;
  /** The picture's recorded natural size. */
  readonly naturalSize?: { readonly width: number; readonly height: number };
  /** The Image Resource's size on the Map; absent, it is the Closed Size. */
  readonly size?: { readonly width: number; readonly height: number };
}

/**
 * Open a Space holding one Markdown Resource and a Closed Image Resource beside
 * it, whose recorded natural size is 400×300. It joins through the same HTTP
 * commit the browser makes, so its natural size is one no gesture measured.
 */
async function openPictures(
  page: Page,
  { title = 'Figure', presentable = false, naturalSize = HARBOUR_SIZE, size }: Pictures = {},
): Promise<UUID> {
  const seeded = await seedPositionedMap(
    page,
    'Pictures',
    (snapshot) => {
      const markdown = snapshot.resources.find(({ document }) => document.kind === 'markdown');
      if (markdown === undefined) throw new Error('The opened Space holds no Markdown Resource.');
      return {
        [markdown.id]: { x: 0, y: 0, open: false },
        [IMAGE_ID]:
          size === undefined ? { x: 400, y: 0, open: false } : { x: 400, y: 0, open: false, size },
      };
    },
    [
      {
        id: IMAGE_ID,
        document: {
          title,
          kind: 'image',
          content: { url: FIGURE_URL, naturalSize },
        },
      },
    ],
    presentable ? [{ from: IMAGE_ID, to: IMAGE_ID }] : [],
  );
  await page.goto(`/spaces/${encodeCompactUuid(seeded.snapshot.id)}`);
  await expect(selectedCanvas(page)).toContainText('Pictures');
  await settled(page);
  return seeded.snapshot.id;
}

/** Serve the tracked 400×300 picture at the Image Resource's URL. */
const serveFigure = (page: Page) =>
  page.route(FIGURE_URL, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: HARBOUR }),
  );

/** The node's authored rect in canvas units, as React Flow sizes its wrapper. */
const authoredSize = (node: Locator) =>
  node.evaluate((element) =>
    element instanceof HTMLElement
      ? {
          width: Number.parseFloat(element.style.width),
          height: Number.parseFloat(element.style.height),
        }
      : null,
  );

/**
 * The picture is drawn over the whole region the host gives its plugin inside
 * the Resource's rect: its box is that region's, to within a pixel, and
 * `object-fit: contain` fits the picture whole inside it.
 */
async function expectPictureFills(node: Locator, picture: Locator): Promise<void> {
  const nodeBox = await boxOf(node, 'the Image Resource');
  const regionBox = await boxOf(node.locator('.canvas-resource__plugin'), "the plugin's region");
  const pictureBox = await boxOf(picture, 'the picture');
  expect(pictureBox.x).toBeCloseTo(regionBox.x, 0);
  expect(pictureBox.y).toBeCloseTo(regionBox.y, 0);
  expect(pictureBox.width).toBeCloseTo(regionBox.width, 0);
  expect(pictureBox.height).toBeCloseTo(regionBox.height, 0);
  expect(regionBox.x).toBeGreaterThanOrEqual(nodeBox.x);
  expect(regionBox.y).toBeGreaterThanOrEqual(nodeBox.y);
  expect(regionBox.x + regionBox.width).toBeLessThanOrEqual(nodeBox.x + nodeBox.width);
  expect(regionBox.y + regionBox.height).toBeLessThanOrEqual(nodeBox.y + nodeBox.height);
}

/** A Resource sized to hold the 400×300 picture. */
const SIZED_TO_PICTURE = { width: 408, height: 359 } as const;

/**
 * An Image Resource is its picture (ADR 0106, ADR 0142): drawn whole into the
 * rect it is given at any size, fitted and never cropped, named by its Title,
 * with no drawn Title and no Open or Close. At rest it has no border; selected,
 * the canvas strokes its border and ring.
 */
test(
  'an Image Resource draws its picture whole into its rect, bare at rest, at any size',
  { tag: '@parity:image-resource-draws-its-picture-bare' },
  async ({ page }) => {
    await serveFigure(page);
    await openPictures(page, { size: SIZED_TO_PICTURE });
    const node = page.locator(`.react-flow__node[data-id="${IMAGE_ID}"]`);
    const resource = node.getByRole('article', { name: 'Figure' });
    await expect(resource).toHaveAttribute('data-kind', 'image');

    const picture = resource.getByRole('img', { name: 'Figure' });
    await expect(picture).toHaveAttribute('src', FIGURE_URL);
    await expectPictureLoaded(picture, HARBOUR_SIZE.width);
    await expect(picture).toHaveCSS('object-fit', 'contain');
    await expect(resource.getByRole('heading')).toHaveCount(0);
    await expect.poll(() => authoredSize(node)).toEqual(SIZED_TO_PICTURE);
    await expectPictureFills(node, picture);

    // Bare at rest: no border is stroked until the Resource is selected.
    await expect(resource).toHaveAttribute('data-bare', 'true');
    await expect(resource).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
    const controls = await resourceControls(page, node);
    await expect(resource).toHaveAttribute('data-bare', 'false');
    await expect(resource).not.toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
    await expect(controls.getByRole('button', { name: /^(Open|Close) Resource/ })).toHaveCount(0);
    await expect(controls.getByRole('button', { name: 'Rename Resource Figure' })).toBeVisible();
    await expect(
      controls.getByRole('button', { name: 'Replace image of Resource Figure' }),
    ).toBeVisible();
  },
);

/** At the Closed Size, the smallest any Resource is, the picture still fills the rect whole. */
test('an Image Resource at the Closed Size draws its picture whole', async ({ page }) => {
  await serveFigure(page);
  await openPictures(page);
  const node = page.locator(`.react-flow__node[data-id="${IMAGE_ID}"]`);
  await expect.poll(() => authoredSize(node)).toEqual(COLLAPSED_RESOURCE_SIZE);
  const picture = node.getByRole('img', { name: 'Figure' });
  await expectPictureLoaded(picture, HARBOUR_SIZE.width);
  await expectPictureFills(node, picture);
});

/** Presenting an Image Resource draws its picture on the Stage, named by the Resource. */
test('presenting an Image Resource draws its picture', async ({ page }) => {
  await serveFigure(page);
  await openPictures(page, { presentable: true });
  await presentControl(page).click();

  const picture = presentedResource(page).getByRole('img', { name: 'Figure' });
  await expect(picture).toHaveAttribute('src', FIGURE_URL);
  await expectPictureLoaded(picture, HARBOUR_SIZE.width);
  await expect(picture).toBeVisible();
});

/**
 * A picture far larger than the frame is fitted inside it, whole: the Stage
 * neither clips it nor scrolls to show the rest.
 */
test(
  'presenting an oversized picture fits it inside the frame',
  { tag: '@parity:stage-fits-an-oversized-picture' },
  async ({ page }) => {
    await page.route(FIGURE_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="${OVERSIZED.width}" height="${OVERSIZED.height}"><rect width="100%" height="100%" fill="#2a6f97"/></svg>`,
      }),
    );
    await openPictures(page, { presentable: true, naturalSize: OVERSIZED });
    await presentControl(page).click();

    const picture = presentedResource(page).getByRole('img', { name: 'Figure' });
    await expectPictureLoaded(picture, OVERSIZED.width);
    const frame = await boxOf(stageFrame(page), 'the Stage frame');
    const room = await boxOf(picture, 'the picture');
    expect(room.x).toBeGreaterThanOrEqual(frame.x - 0.5);
    expect(room.y).toBeGreaterThanOrEqual(frame.y - 0.5);
    expect(room.x + room.width).toBeLessThanOrEqual(frame.x + frame.width + 0.5);
    expect(room.y + room.height).toBeLessThanOrEqual(frame.y + frame.height + 0.5);
    // Fitted rather than clipped: the picture keeps its whole aspect inside the
    // room it is given, and the frame has nothing below it to scroll to.
    await expect(picture).toHaveCSS('object-fit', 'contain');
    expect(
      await stageBody(page).evaluate((body) => body.scrollHeight <= body.clientHeight),
      'the frame scrolls',
    ).toBe(true);
  },
);

/**
 * A picture that will not load is not a refusal (ADR 0106): the Space stays as it
 * was authored, the Resource keeps the size it had, and its rect says the image
 * did not load and names its URL.
 */
test(
  'an Image Resource whose picture does not load names its URL in its rect',
  { tag: '@parity:image-resource-shows-failed-state' },
  async ({ page }) => {
    await page.route(FIGURE_URL, (route) => route.abort());
    await openPictures(page);
    const node = page.locator(`.react-flow__node[data-id="${IMAGE_ID}"]`);

    const resource = node.getByRole('article', { name: 'Figure' });
    await expect(resource.getByText('Image did not load')).toBeVisible();
    await expect(resource.getByText(FIGURE_URL)).toBeVisible();
    await expect(resource.getByRole('img', { name: 'Figure' })).toHaveCount(0);
    await expect.poll(() => authoredSize(node)).toEqual(COLLAPSED_RESOURCE_SIZE);
  },
);

/**
 * Until the picture arrives, the rect draws a skeleton in the picture's place
 * rather than an empty box, a status named Loading image; the picture replaces
 * it, and the Stage draws the same.
 */
test(
  'an Image Resource draws a skeleton until its picture loads',
  { tag: '@parity:open-image-resource-shows-skeleton-while-loading' },
  async ({ page }) => {
    const { promise: held, resolve: releasePicture } = Promise.withResolvers<null>();
    await page.route(FIGURE_URL, async (route) => {
      await held;
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: HARBOUR,
      });
    });
    await openPictures(page);
    const node = page.locator(`.react-flow__node[data-id="${IMAGE_ID}"]`);

    const resource = node.getByRole('article', { name: 'Figure' });
    const skeleton = resource.getByRole('status', { name: 'Loading image' });
    await expect(skeleton).toBeVisible();
    // The picture is laid out but drawn transparent until it loads.
    await expect(resource.getByRole('img', { name: 'Figure' })).toHaveCSS('opacity', '0');

    releasePicture(null);
    const picture = resource.getByRole('img', { name: 'Figure' });
    await expectPictureLoaded(picture, HARBOUR_SIZE.width);
    await expect(skeleton).toHaveCount(0);
  },
);

/** On the Stage too, a picture still arriving draws the skeleton in its place. */
test('a presented Image Resource draws a skeleton until its picture loads', async ({ page }) => {
  const { promise: held, resolve: releasePicture } = Promise.withResolvers<null>();
  await page.route(FIGURE_URL, async (route) => {
    await held;
    await route.fulfill({ status: 200, contentType: 'image/png', body: HARBOUR });
  });
  await openPictures(page, { presentable: true });
  await presentControl(page).click();

  const skeleton = presentedResource(page).getByRole('status', { name: 'Loading image' });
  await expect(skeleton).toBeVisible();
  releasePicture(null);
  await expectPictureLoaded(
    presentedResource(page).getByRole('img', { name: 'Figure' }),
    HARBOUR_SIZE.width,
  );
  await expect(skeleton).toHaveCount(0);
});

/** A picture that fails after the skeleton is drawn gives way to the failed-image state. */
test('a picture that fails while loading replaces the skeleton with the failed-image state', async ({
  page,
}) => {
  const { promise: held, resolve: releasePicture } = Promise.withResolvers<null>();
  await page.route(FIGURE_URL, async (route) => {
    await held;
    await route.abort();
  });
  await openPictures(page);
  const node = page.locator(`.react-flow__node[data-id="${IMAGE_ID}"]`);

  const resource = node.getByRole('article', { name: 'Figure' });
  const skeleton = resource.getByRole('status', { name: 'Loading image' });
  await expect(skeleton).toBeVisible();
  releasePicture(null);
  await expect(resource.getByText('Image did not load')).toBeVisible();
  await expect(skeleton).toHaveCount(0);
});

/** Three small PNGs, each a size the created Resource is expected to record. */
const PICTURES = [
  {
    name: 'diagram.png',
    size: { width: 3, height: 2 },
    base64:
      'iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAEElEQVR4nGP4z8AAQQxwFgBB0gX7h/C5SAAAAABJRU5ErkJggg==',
  },
  {
    name: 'square.png',
    size: { width: 4, height: 4 },
    base64:
      'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGP4z8AARwzEcQCukw/x0F8jngAAAABJRU5ErkJggg==',
  },
  {
    name: 'strip.png',
    size: { width: 5, height: 1 },
    base64:
      'iVBORw0KGgoAAAANSUhEUgAAAAUAAAABCAIAAACZnPOkAAAADUlEQVR4nGP4z8CAjAAs4wT8bOOiaQAAAABJRU5ErkJggg==',
  },
] as const;

const [FIRST_PICTURE] = PICTURES;

/** A Space opened on a seeded Map holding one Markdown Resource, for a gesture to create beside. */
async function openForCreation(page: Page): Promise<UUID> {
  const seeded = await seedPositionedMap(page, 'Pictures', (snapshot) => {
    const markdown = snapshot.resources.find(({ document }) => document.kind === 'markdown');
    if (markdown === undefined) throw new Error('The opened Space holds no Markdown Resource.');
    return { [markdown.id]: { x: 0, y: 0, open: false } };
  });
  await page.goto(`/spaces/${encodeCompactUuid(seeded.snapshot.id)}`);
  await expect(selectedCanvas(page)).toContainText('Pictures');
  await settled(page);
  return seeded.snapshot.id;
}

/** The stored Space's Image Resources, with where the seeded Map places each. */
async function storedImages(page: Page, spaceId: UUID) {
  const response = await page.request.get(`/api/spaces/${spaceId}`);
  expect(response.ok()).toBe(true);
  const { snapshot } = decodeLoadedSpace(await response.json());
  const positions = snapshot.document.maps?.find(({ id }) => id === SEEDED_MAP_ID)?.positions;
  return snapshot.resources.flatMap(({ id, document }) =>
    document.kind === 'image' ? [{ id, document, at: positions?.[id] }] : [],
  );
}

/** The stored Space's revision, which any Edit a gesture completed would have moved. */
async function storedRevision(page: Page, spaceId: UUID): Promise<bigint> {
  const response = await page.request.get(`/api/spaces/${spaceId}`);
  expect(response.ok()).toBe(true);
  return decodeLoadedSpace(await response.json()).revision;
}

const titleNumber = (title: string): number => Number(/^Resource (\d+)$/u.exec(title)?.[1]);

/** The visible canvas's empty pane, where a drop or a paste is the canvas's own. */
const pane = (page: Page): Locator => page.locator('.react-flow__pane:visible').first();

test('choosing a file from the Dock creates an Image Resource titled Resource N at the stored URL', async ({
  page,
}) => {
  const spaceId = await openForCreation(page);

  const chooser = page.waitForEvent('filechooser');
  await createResource(page, 'Image Resource');
  await (
    await chooser
  ).setFiles({
    name: FIRST_PICTURE.name,
    mimeType: 'image/png',
    buffer: Buffer.from(FIRST_PICTURE.base64, 'base64'),
  });

  // The caret lands in the new Resource's Title, which is `Resource N` and
  // never the file's name.
  const title = page.getByRole('textbox', { name: 'Resource title' });
  await expect(title).toBeFocused();
  await expect(title).toHaveValue(/^Resource \d+$/u);
  await title.press('Escape');

  await expect.poll(async () => (await storedImages(page, spaceId)).length).toBe(1);
  const [created] = await storedImages(page, spaceId);
  expect(created?.document).toMatchObject({
    kind: 'image',
    content: {
      url: expect.stringMatching(/^\/assets\/[A-Za-z0-9_-]{43}$/u),
      naturalSize: FIRST_PICTURE.size,
    },
  });
  expect(created?.document.title).toMatch(/^Resource \d+$/u);
});

test('cancelling the file picker creates nothing', async ({ page }) => {
  const spaceId = await openForCreation(page);
  const before = await storedRevision(page, spaceId);
  const resources = page.locator('.react-flow__node:visible');
  const count = await resources.count();

  const chooser = page.waitForEvent('filechooser');
  await createResource(page, 'Image Resource');
  await (await chooser).setFiles([]);

  await expect(page.getByRole('textbox', { name: 'Resource title' })).toHaveCount(0);
  await expect(resources).toHaveCount(count);
  expect(await storedImages(page, spaceId)).toEqual([]);
  expect(await storedRevision(page, spaceId)).toBe(before);
});

test('dropping three images creates three Resources in one Edit, numbered in order, in a row', async ({
  page,
}) => {
  const spaceId = await openForCreation(page);
  const commits: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/spaces') {
      commits.push(request.url());
    }
  });

  const box = await boxOf(pane(page), 'the canvas pane');
  const dataTransfer = await page.evaluateHandle((pictures) => {
    const transfer = new DataTransfer();
    for (const { name, base64 } of pictures) {
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      transfer.items.add(new File([bytes], name, { type: 'image/png' }));
    }
    return transfer;
  }, PICTURES);
  const at = { clientX: box.x + box.width / 2, clientY: box.y + box.height * 0.75 };
  await pane(page).dispatchEvent('dragover', { dataTransfer, ...at });
  await pane(page).dispatchEvent('drop', { dataTransfer, ...at });

  const title = page.getByRole('textbox', { name: 'Resource title' });
  await expect(title).toBeFocused();
  await title.press('Escape');

  await expect.poll(async () => (await storedImages(page, spaceId)).length).toBe(3);
  // Read left to right: the store keeps Resources in its own order, and the row
  // is the order the files were dropped in.
  const created = (await storedImages(page, spaceId)).toSorted(
    (left, right) => (left.at?.x ?? 0) - (right.at?.x ?? 0),
  );
  // Titled with three successive numbers, in the order the files were dropped.
  const numbers = created.map(({ document }) => titleNumber(document.title));
  expect(numbers).toEqual([numbers[0], (numbers[0] ?? 0) + 1, (numbers[0] ?? 0) + 2]);
  expect(created.map(({ document }) => document.content.naturalSize)).toEqual(
    PICTURES.map(({ size }) => size),
  );
  // In a row from the drop point: one height, rising left to right.
  const [first, second, third] = created.map(({ at: placed }) => placed);
  expect(new Set([first?.y, second?.y, third?.y]).size).toBe(1);
  expect((second?.x ?? 0) - (first?.x ?? 0)).toBeGreaterThan(0);
  expect((third?.x ?? 0) - (second?.x ?? 0)).toBe((second?.x ?? 0) - (first?.x ?? 0));
  // The row starts at the drop point: the first Resource is centred under it.
  const firstBox = await boxOf(
    page.locator(`.react-flow__node[data-id="${created[0]?.id ?? ''}"]`),
    'the first dropped Image Resource',
  );
  expect(firstBox.x + firstBox.width / 2).toBeCloseTo(at.clientX, -1);
  expect(firstBox.y + firstBox.height / 2).toBeCloseTo(at.clientY, -1);
  // One Edit: the three arrived in one commit. V1 has no Undo; one Edit is
  // what a single Undo would reverse.
  expect(commits).toHaveLength(1);
});

/**
 * Drag a picture over `target` and drop it there, answering whether the
 * `dragover` was taken and with which effect — a drag nothing takes is one the
 * browser answers by opening the file in place of the Space. `at` is where in
 * the target's box, as fractions of its width and height; its centre by default.
 */
async function dropPictureOn(
  target: Locator,
  picture: (typeof PICTURES)[number],
  at: { readonly x: number; readonly y: number } = { x: 0.5, y: 0.5 },
): Promise<{ readonly taken: boolean; readonly dropEffect: string }> {
  return target.evaluate(
    (element, { name, base64, at: within }) => {
      const transfer = new DataTransfer();
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      transfer.items.add(new File([bytes], name, { type: 'image/png' }));
      const box = element.getBoundingClientRect();
      const init = {
        dataTransfer: transfer,
        clientX: box.left + box.width * within.x,
        clientY: box.top + box.height * within.y,
        bubbles: true,
        cancelable: true,
      };
      const over = new DragEvent('dragover', init);
      element.dispatchEvent(over);
      const answer = { taken: over.defaultPrevented, dropEffect: transfer.dropEffect };
      element.dispatchEvent(new DragEvent('drop', init));
      return answer;
    },
    { ...picture, at },
  );
}

test('a picture dropped on a Resource, or on the Map an Open Space Resource draws, creates nothing', async ({
  page,
}) => {
  const spaceId = await openForCreation(page);
  const uploads: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/assets')) {
      uploads.push(request.url());
    }
  });

  await createResource(page, 'Space Resource');
  const editor = page.getByRole('textbox', { name: 'Resource title' });
  await expect(editor).toBeFocused();
  const spaceTitle = await editor.inputValue();
  await editor.press('Enter');
  await settled(page);
  const spaceResource = page
    .locator('.react-flow__node:visible:not([data-id^="embedded:"])')
    .filter({ has: page.getByRole('heading', { name: spaceTitle }) });
  await openFromRail(page, spaceResource);
  const embedded = page.locator('.react-flow__node:visible[data-id^="embedded:"]');
  await expect(embedded).toHaveCount(1);
  await settled(page);
  const markdown = page
    .locator('.react-flow__node:visible:not([data-id^="embedded:"])')
    .filter({ has: page.locator('[data-kind="markdown"]') })
    .filter({ hasNot: page.getByRole('heading', { name: spaceTitle }) });

  const refusals = [
    await dropPictureOn(markdown, FIRST_PICTURE),
    await dropPictureOn(spaceResource, FIRST_PICTURE),
    await dropPictureOn(embedded, FIRST_PICTURE),
  ];

  // The empty canvas still takes a drop, which is what the refusals above are
  // measured against: once its Resource exists, any earlier drop that was
  // taken would already have started storing its picture. Aimed at a corner,
  // because the Open Space Resource's drawn Map covers the canvas's centre and
  // a drop on it is refused rather than falling through to the canvas.
  const [, square] = PICTURES;
  await dropPictureOn(pane(page), square, { x: 0.04, y: 0.96 });
  const title = page.getByRole('textbox', { name: 'Resource title' });
  await expect(title).toBeFocused();
  await title.press('Escape');
  await expect.poll(async () => (await storedImages(page, spaceId)).length).toBe(1);
  expect(uploads).toHaveLength(1);
  const [created] = await storedImages(page, spaceId);
  expect(created?.document.content.naturalSize).toEqual(square.size);
  // Each refusal still claims the drag, so the browser does not open the file.
  expect(refusals).toEqual([
    { taken: true, dropEffect: 'none' },
    { taken: true, dropEffect: 'none' },
    { taken: true, dropEffect: 'none' },
  ]);
});

/**
 * Paste text on the canvas the way an author does: the text on the system
 * clipboard, a click on the empty pane, and the paste shortcut.
 */
async function pasteOnCanvas(page: Page, text: string): Promise<void> {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate((copied) => navigator.clipboard.writeText(copied), text);
  const box = await boxOf(pane(page), 'the canvas pane');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.75);
  await page.keyboard.press('ControlOrMeta+V');
}

test('pasting an image URL on the canvas creates an Image Resource holding it, titled Resource N', async ({
  page,
}) => {
  await page.route('https://example.com/a.png', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(FIRST_PICTURE.base64, 'base64'),
    }),
  );
  const spaceId = await openForCreation(page);

  await pasteOnCanvas(page, 'https://example.com/a.png');

  const title = page.getByRole('textbox', { name: 'Resource title' });
  await expect(title).toBeFocused();
  await expect(title).toHaveValue(/^Resource \d+$/u);
  await title.press('Escape');
  await expect.poll(async () => (await storedImages(page, spaceId)).length).toBe(1);
  const [created] = await storedImages(page, spaceId);
  expect(created?.document).toMatchObject({
    kind: 'image',
    content: { url: 'https://example.com/a.png', naturalSize: FIRST_PICTURE.size },
  });
  expect(created?.document.title).toMatch(/^Resource \d+$/u);
});

test('pasting an unreachable image URL still creates the Resource, with no recorded size', async ({
  page,
}) => {
  await page.route('https://example.com/gone.png', (route) => route.abort());
  const spaceId = await openForCreation(page);

  await pasteOnCanvas(page, 'https://example.com/gone.png');

  await expect(page.getByRole('textbox', { name: 'Resource title' })).toBeFocused();
  await expect.poll(async () => (await storedImages(page, spaceId)).length).toBe(1);
  const [created] = await storedImages(page, spaceId);
  expect(created?.document).toEqual({
    title: expect.stringMatching(/^Resource \d+$/u),
    kind: 'image',
    content: { url: 'https://example.com/gone.png' },
  });
});

for (const refused of [
  {
    file: { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a picture') },
    sentence: 'notes.txt is not a PNG, JPEG, WebP or GIF image.',
  },
  {
    file: {
      name: 'huge.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
    },
    sentence: 'huge.png is larger than 10 MB, the largest image that can be stored.',
  },
]) {
  test(`choosing ${refused.file.name} reports its refusal and creates nothing`, async ({
    page,
  }) => {
    const spaceId = await openForCreation(page);

    const chooser = page.waitForEvent('filechooser');
    await createResource(page, 'Image Resource');
    await (await chooser).setFiles(refused.file);

    const notice = page.getByRole('alert').filter({ hasText: 'Image Resource not created' });
    await expect(notice).toContainText(refused.sentence);
    await expect(page.getByRole('textbox', { name: 'Resource title' })).toHaveCount(0);
    expect(await storedImages(page, spaceId)).toEqual([]);
  });
}

/** The node an Image Resource is drawn in, and everything it offers. */
async function imageControls(page: Page) {
  const node = page.locator(`.react-flow__node[data-id="${IMAGE_ID}"]`);
  return { node, controls: await resourceControls(page, node) };
}

/** The stored Space holding the seeded Image Resource, and where its document now points. */
async function storedFigure(page: Page, spaceId: UUID) {
  const response = await page.request.get(`/api/spaces/${spaceId}`);
  expect(response.ok()).toBe(true);
  const loaded = decodeLoadedSpace(await response.json());
  const figure = loaded.snapshot.resources.find(({ id }) => id === IMAGE_ID)?.document;
  return { revision: loaded.revision, figure, maps: loaded.snapshot.document.maps };
}

/** Commits the browser sends, counted from when this is called. */
function countCommits(page: Page) {
  let commits = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/spaces') {
      commits += 1;
    }
  });
  return { count: () => commits };
}

/** The first small picture, as a file chosen in the browser's picker. */
const FIRST_FILE = {
  name: FIRST_PICTURE.name,
  mimeType: 'image/png',
  buffer: Buffer.from(FIRST_PICTURE.base64, 'base64'),
};

/** Press the rail's Replace and choose `file` in the picker it opens. */
async function replaceFromRail(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
) {
  const { node, controls } = await imageControls(page);
  const chooser = page.waitForEvent('filechooser');
  await controls.getByRole('button', { name: 'Replace image of Resource Figure' }).click();
  await (await chooser).setFiles(file);
  return node;
}

/**
 * Replace is on the rail (ADR 0142): its picker opens in the press, and the
 * chosen file is admitted, stored and named in one content commit that keeps
 * the Resource's identity, Title, placement and Edges.
 */
test(
  'Replace on the rail stores the chosen picture and names it in one Edit, keeping the Resource',
  { tag: '@parity:image-resource-replace-from-the-rail' },
  async ({ page }) => {
    await serveFigure(page);
    const spaceId = await openPictures(page, { presentable: true });
    const before = await storedFigure(page, spaceId);
    const commits = countCommits(page);

    const node = await replaceFromRail(page, FIRST_FILE);

    const picture = node.getByRole('img', { name: 'Figure' });
    await expect(picture).toHaveAttribute('src', /^\/assets\/[A-Za-z0-9_-]{43}$/u);
    await expectPictureLoaded(picture, FIRST_PICTURE.size.width);
    await settled(page);
    const after = await storedFigure(page, spaceId);
    expect(after.figure).toEqual({
      title: 'Figure',
      kind: 'image',
      content: {
        url: expect.stringMatching(/^\/assets\/[A-Za-z0-9_-]{43}$/u),
        naturalSize: FIRST_PICTURE.size,
      },
    });
    // Placement, size and Edges are the Map's, and the Map is untouched.
    expect(after.maps?.map(({ positions, graphs }) => ({ positions, graphs }))).toEqual(
      before.maps?.map(({ positions, graphs }) => ({ positions, graphs })),
    );
    expect(commits.count()).toBe(1);
    expect(after.revision).toBe(before.revision + 1n);
  },
);

/** A file dropped on the picture replaces it, and the canvas creates nothing from it. */
test('a picture dropped on an Image Resource replaces it, creating nothing', async ({ page }) => {
  await serveFigure(page);
  const spaceId = await openPictures(page);
  const node = page.locator(`.react-flow__node[data-id="${IMAGE_ID}"]`);
  const resourcesBefore = await page.locator('.react-flow__node').count();
  const dataTransfer = await page.evaluateHandle(({ name, base64 }) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], name, { type: 'image/png' }));
    return transfer;
  }, FIRST_PICTURE);
  const picture = node.getByRole('img', { name: 'Figure' });
  await picture.dispatchEvent('dragenter', { dataTransfer });
  await picture.dispatchEvent('dragover', { dataTransfer });
  await picture.dispatchEvent('drop', { dataTransfer });

  await expect(picture).toHaveAttribute('src', /^\/assets\/[A-Za-z0-9_-]{43}$/u);
  await settled(page);
  await expect(page.locator('.react-flow__node')).toHaveCount(resourcesBefore);
  expect((await storedFigure(page, spaceId)).figure).toMatchObject({
    title: 'Figure',
    content: { naturalSize: FIRST_PICTURE.size },
  });
});

/**
 * A file that is not a picture, or an SVG, is refused before anything is
 * stored: the refusal is said over the picture, which stays as it was.
 */
test(
  'Replace refuses a file that is not a picture and an SVG, storing nothing',
  { tag: '@parity:image-resource-replace-refuses' },
  async ({ page }) => {
    await serveFigure(page);
    const spaceId = await openPictures(page);
    const before = await storedFigure(page, spaceId);
    const uploads: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/assets') {
        uploads.push(request.url());
      }
    });
    const node = await replaceFromRail(page, {
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello'),
    });
    const notice = node.getByTestId('image-notice');
    await expect(notice).toHaveText('notes.txt is not a PNG, JPEG, WebP or GIF image.');
    await replaceFromRail(page, {
      name: 'figure.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    });
    await expect(notice).toHaveText(
      'figure.svg is an SVG image, which cannot be stored. Use PNG, JPEG, WebP or GIF.',
    );
    await expect(node.getByRole('img', { name: 'Figure' })).toHaveAttribute('src', FIGURE_URL);
    await settled(page);
    expect(uploads).toEqual([]);
    expect((await storedFigure(page, spaceId)).figure).toEqual(before.figure);
  },
);

/**
 * While a Replace runs, it is the application's one exclusive operation (ADR
 * 0126, ADR 0142): the Dock's navigation is drawn unavailable by
 * `aria-disabled`, stays in its arrow order and opens nothing, a Back is held,
 * and its answer releases them all.
 */
test(
  'a Replace in flight withholds navigation and authoring until it answers',
  {
    tag: [
      '@parity:image-resource-replace-holds-navigation',
      '@parity:command-dock-draws-its-menu-buttons-unavailable',
    ],
  },
  async ({ page }) => {
    await serveFigure(page);
    await openPictures(page);
    await newMap(page);
    const mapName = page.getByRole('textbox', { name: 'Map name' });
    await mapName.fill('Elsewhere');
    await mapName.press('Enter');
    await selectCanvas(page, 'Pictures');
    await selectCanvas(page, 'Elsewhere');
    const previousUrl = page.url();
    await selectCanvas(page, 'Pictures');
    const heldUrl = page.url();

    const held = Promise.withResolvers<undefined>();
    await page.route(
      (url) => url.pathname === '/assets',
      async (route) => {
        await held.promise;
        await route.continue();
      },
    );
    const node = await replaceFromRail(page, FIRST_FILE);
    await expect(node.getByTestId('image-notice')).toHaveText('Replacing image…');

    // Authoring is withdrawn with navigation: creating a Resource, and the
    // Image's own Rename, wait for the Replace.
    const create = createResourceControl(page);
    await expect(create).toBeDisabled();
    const rename = page.getByRole('button', { name: 'Rename Resource Figure' });
    await expect(rename).toHaveCount(0);

    const menuButtons = dockNavigation(page);
    await expectWithheld(menuButtons);
    await expectArrowOrder(page, menuButtons);
    for (const control of menuButtons) {
      await control.click({ force: true, delay: 120 });
      await expect(page.getByRole('menu')).toHaveCount(0);
      await control.press('Enter');
      await expect(page.getByRole('menu')).toHaveCount(0);
    }
    // A withheld command is not a refused one, so nothing is reported.
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          let pops = 0;
          const arrived = () => {
            if (++pops === 2) {
              window.removeEventListener('popstate', arrived);
              resolve();
            }
          };
          window.addEventListener('popstate', arrived);
          window.history.back();
        }),
    );
    await expect(page).toHaveURL(heldUrl);
    await expect(selectedCanvas(page)).toHaveText('Pictures');

    held.resolve(undefined);
    await expect(node.getByRole('img', { name: 'Figure' })).toHaveAttribute(
      'src',
      /^\/assets\/[A-Za-z0-9_-]{43}$/u,
    );
    await expect(node.getByTestId('image-notice')).toHaveCount(0);
    await expectAvailable(menuButtons);
    await expect(create).toBeEnabled();
    await (
      await imageControls(page)
    ).controls
      .getByRole('button', { name: 'Rename Resource Figure' })
      .focus();
    await page.goBack();
    await expect(page).toHaveURL(previousUrl);
    await expect(selectedCanvas(page)).toHaveText('Elsewhere');
  },
);

/**
 * A Replace whose upload fails says so over the picture, changes nothing, and
 * ends its exclusive work, so navigation is available again; uploads time out
 * after two minutes, so the wait is bounded (ADR 0126). A later Replace lands.
 */
for (const failure of ['HTTP 500', 'network', 'timeout'] as const) {
  test(`a Replace recovers from an upload failing by ${failure}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await serveFigure(page);
    const spaceId = await openPictures(page);
    const before = await storedFigure(page, spaceId);
    if (failure === 'timeout') await page.clock.install();
    const uploads = (url: URL) => url.pathname === '/assets';
    await page.route(uploads, async (route) => {
      if (failure === 'network') await route.abort('failed');
      else if (failure === 'HTTP 500') await route.fulfill({ status: 500, body: 'Unavailable' });
      // A timed-out upload is never answered.
    });

    const node = await replaceFromRail(page, FIRST_FILE);
    const notice = node.getByTestId('image-notice');
    if (failure === 'timeout') {
      await expect(notice).toHaveText('Replacing image…');
      await expectWithheld(dockNavigation(page));
      await page.clock.fastForward(120_000);
    }
    await expect(notice).toHaveText('This image was not replaced. Try again.');
    await expect(notice).toHaveAttribute('role', 'alert');
    await expectAvailable(dockNavigation(page));
    await expect(createResourceControl(page)).toBeEnabled();
    await expect(node.getByRole('img', { name: 'Figure' })).toHaveAttribute('src', FIGURE_URL);
    expect((await storedFigure(page, spaceId)).revision).toBe(before.revision);
    expect(errors).toEqual([]);

    await page.unroute(uploads);
    await replaceFromRail(page, FIRST_FILE);
    const picture = node.getByRole('img', { name: 'Figure' });
    await expect(picture).toHaveAttribute('src', /^\/assets\/[A-Za-z0-9_-]{43}$/u);
    await expectPictureLoaded(picture, FIRST_PICTURE.size.width);
    await expect(notice).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

/**
 * Hold every upload to the host's asset collection until the answer is
 * released, so a Replace stays in flight between its store and its commit.
 */
async function holdUploads(page: Page): Promise<() => void> {
  const held = Promise.withResolvers<undefined>();
  await page.route(
    (url) => url.pathname === '/assets',
    async (route) => {
      await held.promise;
      await route.continue();
    },
  );
  return () => held.resolve(undefined);
}

/**
 * Press `node`'s rail Replace, choose `file`, and wait until the plugin says
 * the Replace is running.
 */
async function replaceHeld(
  page: Page,
  node: Locator,
  title: string,
  file: { name: string; mimeType: string; buffer: Buffer } = FIRST_FILE,
): Promise<void> {
  const controls = await resourceControls(page, node);
  const replace = controls.getByRole('button', { name: `Replace image of Resource ${title}` });
  const chooser = page.waitForEvent('filechooser');
  // Pressed from the keyboard, as the rail may sit under the Dock.
  await replace.focus();
  await replace.press('Enter');
  await (await chooser).setFiles(file);
  await expect(node.getByTestId('image-notice')).toHaveText('Replacing image…');
}

/** Rename the seeded Image Resource from its rail, committing on Enter. */
async function renameFigure(page: Page, title: string): Promise<void> {
  const { controls } = await imageControls(page);
  await controls.getByRole('button', { name: 'Rename Resource Figure' }).click();
  const field = page.getByRole('textbox', { name: 'Resource title' });
  await field.fill(title);
  await field.press('Enter');
}

const PRESENTATION_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000060');
const OVERVIEW_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000061');

/**
 * Add the Image Resource to the fixture's Presentation Space on the Overview
 * Map that Meta's Space Resource enters it on, through the same HTTP commit the
 * browser makes.
 */
async function seedPresentationFigure(page: Page): Promise<void> {
  const response = await page.request.get(`/api/spaces/${PRESENTATION_ID}`);
  expect(response.ok()).toBe(true);
  const { snapshot, revision } = decodeLoadedSpace(await response.json());
  const maps = (snapshot.document.maps ?? []).map((authored) =>
    authored.id === OVERVIEW_MAP_ID
      ? {
          ...authored,
          positions: {
            ...authored.positions,
            [IMAGE_ID]: { x: 1272, y: 12, open: false, size: SIZED_TO_PICTURE },
          },
        }
      : authored,
  );
  const commit = await page.request.post('/api/spaces', {
    data: {
      changes: [
        {
          kind: 'update',
          spaceId: PRESENTATION_ID,
          snapshot: {
            ...snapshot,
            resources: [
              ...snapshot.resources,
              {
                id: IMAGE_ID,
                document: {
                  title: 'Figure',
                  kind: 'image',
                  content: { url: FIGURE_URL, naturalSize: HARBOUR_SIZE },
                },
              },
            ],
            document: { ...snapshot.document, maps },
          },
          expectedRevision: revision.toString(),
        },
      ],
    },
  });
  expect(commit.ok()).toBe(true);
}

/**
 * In an entered Space the opener's crumb is navigation too: a Replace run from
 * the Image plugin's rail withholds it with the rest, in the same arrow order,
 * and when the Replace lands every navigation command is available again,
 * Exit included.
 */
test("a Replace in an entered Space withholds the opener's crumb, and its answer makes every navigation command available", async ({
  page,
}) => {
  await serveFigure(page);
  await seedPresentationFigure(page);
  await page.goto('/');
  await selectCanvas(page, 'Linked Spaces');
  const presentation = nodeByTitle(page, 'Presentation');
  await expect(presentation).toBeVisible();
  await settled(page);
  await (
    await resourceControls(page, presentation)
  )
    .getByRole('button', { name: 'Actions for Resource Presentation' })
    .click();
  await page.getByRole('menuitem', { name: 'Enter', exact: true }).click();
  // Meta stays open behind the entered Space, so its Dock is in the page too.
  const bar = dock(page).filter({ visible: true });
  const shownSpace = bar.getByTestId('space-title');
  await expect(shownSpace).toContainText('Presentation');
  await expect(bar.getByTestId('selected-canvas')).toContainText('Overview');
  await settled(page);

  const release = await holdUploads(page);
  const { node } = await imageControls(page);
  await replaceHeld(page, node, 'Figure');

  const goTo = page.getByRole('button', { name: 'Go to Map fixture' });
  const navigation = [goTo, ...dockNavigation(page)];
  await expectWithheld(navigation);
  await expectArrowOrder(page, navigation);
  await goTo.click({ force: true });
  await expect(shownSpace).toContainText('Presentation');
  await expect(page.getByRole('alert')).toHaveCount(0);

  release();
  await expect(node.getByTestId('image-notice')).toHaveCount(0);
  await expectPictureLoaded(node.getByRole('img', { name: 'Figure' }), FIRST_PICTURE.size.width);
  await expectAvailable(navigation);
  await shownSpace.click({ delay: 120 });
  const exit = page.getByRole('menu').getByRole('menuitem', { name: 'Exit Space' });
  await expect(exit).toBeEnabled();
  await exit.click();
  await expect(shownSpace).toContainText('Map fixture');
});

/**
 * Follow a fragment of the current location, answering whether the browser
 * fired `popstate` for it; the spec fires `popstate` before `hashchange`.
 */
const followFragment = (page: Page, fragment: string) =>
  page.evaluate(
    (hash) =>
      new Promise<boolean>((resolve) => {
        let popped = false;
        const heard = () => {
          popped = true;
        };
        window.addEventListener('popstate', heard);
        window.addEventListener(
          'hashchange',
          () => {
            window.removeEventListener('popstate', heard);
            resolve(popped);
          },
          { once: true },
        );
        window.location.hash = hash;
      }),
    fragment,
  );

/**
 * Traverse by `delta`, answering a read of how many `popstate`s have arrived
 * since and where the browser is. Each call counts on its own.
 */
async function traverseCounting(page: Page, delta: number) {
  await page.evaluate((by) => {
    const { dataset } = document.documentElement;
    const token = String(Number(dataset['popToken'] ?? 0) + 1);
    dataset['popToken'] = token;
    dataset['pops'] = '0';
    window.addEventListener('popstate', () => {
      if (dataset['popToken'] === token) dataset['pops'] = String(Number(dataset['pops']) + 1);
    });
    window.history.go(by);
  }, delta);
  return () =>
    page.evaluate(() => ({
      pops: Number(document.documentElement.dataset['pops']),
      url: window.location.href,
    }));
}

test('a Replace in flight holds a Back and a Forward across a fragment link', async ({ page }) => {
  await serveFigure(page);
  await openPictures(page);
  await newMap(page);
  const mapName = page.getByRole('textbox', { name: 'Map name' });
  await mapName.fill('Elsewhere');
  await mapName.press('Enter');
  await selectCanvas(page, 'Pictures');
  await selectCanvas(page, 'Elsewhere');
  await selectCanvas(page, 'Pictures');
  const heldUrl = page.url();
  const fragmentUrl = `${heldUrl}#figure`;
  // A same-document entry the application did not write, arriving by `popstate`.
  expect(await followFragment(page, 'figure')).toBe(true);
  await expect(page).toHaveURL(fragmentUrl);
  const { node } = await imageControls(page);
  const release = await holdUploads(page);
  await replaceHeld(page, node, 'Figure');

  // Back across the fragment's entry, to the Elsewhere entry, returns to the fragment's.
  const afterBack = await traverseCounting(page, -2);
  await expect.poll(afterBack).toEqual({ pops: 2, url: fragmentUrl });
  await expect(selectedCanvas(page)).toHaveText('Pictures');

  release();
  await expect(node.getByTestId('image-notice')).toHaveCount(0);
  await page.unrouteAll({ behavior: 'wait' });
  await serveFigure(page);
  await page.goBack();
  await expect(page).toHaveURL(heldUrl);
  const releaseAgain = await holdUploads(page);
  await replaceHeld(page, node, 'Figure', { ...FIRST_FILE, name: 'again.png' });

  // Forward onto the fragment's entry returns to the entry it left.
  const afterForward = await traverseCounting(page, 1);
  await expect.poll(afterForward).toEqual({ pops: 2, url: heldUrl });
  releaseAgain();
  await expect(node.getByTestId('image-notice')).toHaveCount(0);
});

/**
 * Stand a revision conflict up under a Replace in flight: another writer
 * commits first, the browser's rename of the Image Resource is parked until a
 * Replace has started and its upload is held, and the parked save then meets
 * the newer stored revision.
 */
async function conflictDuringReplace(page: Page, spaceId: UUID) {
  const stored = await page.request.get(`/api/spaces/${spaceId}`);
  expect(stored.ok()).toBe(true);
  const loaded = decodeLoadedSpace(await stored.json());
  const remoteCommit = await page.request.post('/api/spaces', {
    data: {
      changes: [
        {
          kind: 'update',
          spaceId,
          snapshot: {
            ...loaded.snapshot,
            document: { ...loaded.snapshot.document, title: 'Renamed elsewhere' },
          },
          expectedRevision: loaded.revision.toString(),
        },
      ],
    },
  });
  expect(remoteCommit.ok()).toBe(true);

  const saveHeld = Promise.withResolvers<undefined>();
  let parked = false;
  await page.route('**/api/spaces', async (route) => {
    if (!parked && route.request().method() === 'POST') {
      parked = true;
      await saveHeld.promise;
    }
    await route.continue();
  });
  await renameFigure(page, 'Harbour');
  const { node } = await imageControls(page);
  const releaseUpload = await holdUploads(page);
  await replaceHeld(page, node, 'Harbour');
  saveHeld.resolve(undefined);
  const conflict = page.getByRole('alertdialog', { name: 'Changes conflict' });
  await expect(conflict).toBeVisible();
  return {
    // The modal dialog hides the canvas from the accessibility tree, so what
    // stands behind it is read from the node itself.
    behind: node,
    conflict,
    revision: loaded.revision + 1n,
    releaseUpload,
  };
}

test('keeping local work during a Replace in flight re-commits it, and the Replace lands', async ({
  page,
}) => {
  await serveFigure(page);
  const spaceId = await openPictures(page);
  const { behind, conflict, revision, releaseUpload } = await conflictDuringReplace(page, spaceId);
  const status = page.getByTestId('persistence-status');
  const keepLocal = conflict.getByRole('button', { name: 'Keep local and retry' });
  await expect(keepLocal).not.toHaveAttribute('aria-disabled', 'true');
  await keepLocal.click();
  await expect(conflict).toBeHidden();
  await expect(status).toHaveText('Persisted');
  await expect(status).toHaveAttribute('data-revision', (revision + 1n).toString());
  // It re-committed the working Space, renamed, and the Replace still runs.
  await expect(behind.getByTestId('image-notice')).toHaveText('Replacing image…');

  releaseUpload();
  await expect(behind.getByTestId('image-notice')).toHaveCount(0);
  await expect(status).toHaveAttribute('data-revision', (revision + 2n).toString());
  const { figure } = await storedFigure(page, spaceId);
  expect(figure).toMatchObject({
    title: 'Harbour',
    kind: 'image',
    content: { naturalSize: FIRST_PICTURE.size },
  });
  expect(figure?.kind === 'image' ? figure.content.url : undefined).not.toBe(FIGURE_URL);
});

test('Reload is withheld while a Replace is in flight and offered again once it answers', async ({
  page,
}) => {
  await serveFigure(page);
  const spaceId = await openPictures(page);
  const { behind, conflict, revision, releaseUpload } = await conflictDuringReplace(page, spaceId);
  const reload = conflict.getByRole('button', { name: 'Reload' });
  await expect(reload).toHaveAttribute('aria-disabled', 'true');
  await expect(reload).not.toHaveAttribute('disabled');
  await reload.focus();
  await expect(reload).toBeFocused();
  await reload.click({ force: true });
  await reload.press('Enter');
  await expect(conflict).toBeVisible();
  await expect(behind.getByTestId('image-notice')).toHaveText('Replacing image…');

  releaseUpload();
  await expect(behind.getByText('Replacing image…')).toHaveCount(0);
  await expect(reload).not.toHaveAttribute('aria-disabled', 'true');
  await reload.click();
  await expect(conflict).toBeHidden();
  await expect(page.getByTestId('space-title').filter({ visible: true })).toHaveText(
    'Renamed elsewhere',
  );
  await expect(page.getByTestId('persistence-status')).toHaveAttribute(
    'data-revision',
    revision.toString(),
  );
});

test('a failed save is retried while a Replace is in flight, and the Replace lands', async ({
  page,
}) => {
  await serveFigure(page);
  const spaceId = await openPictures(page);
  const status = page.getByTestId('persistence-status');
  const before = BigInt((await status.getAttribute('data-revision')) ?? '');
  let failing = true;
  await page.route('**/api/spaces', async (route) => {
    if (failing && route.request().method() === 'POST') return route.abort('failed');
    return route.continue();
  });
  // Renaming the Image Resource is the Edit whose save fails.
  await renameFigure(page, 'Harbour');
  const failure = page.getByTestId('persistence-failure');
  await expect(failure).toBeVisible();

  const { node } = await imageControls(page);
  const release = await holdUploads(page);
  await replaceHeld(page, node, 'Harbour');

  const retry = failure.getByRole('button', { name: 'Retry', exact: true });
  await expect(retry).toBeEnabled();
  failing = false;
  await retry.click();
  await expect(failure).toBeHidden();
  await expect(status).toHaveText('Persisted');
  await expect(status).toHaveAttribute('data-revision', (before + 1n).toString());
  // Retry re-committed the working Space, and the Replace still holds the page.
  await expect(node.getByTestId('image-notice')).toHaveText('Replacing image…');
  await expectWithheld(dockNavigation(page));

  release();
  await expect(node.getByTestId('image-notice')).toHaveCount(0);
  await expectAvailable(dockNavigation(page));
  await expect(status).toHaveAttribute('data-revision', (before + 2n).toString());
  expect((await storedFigure(page, spaceId)).figure).toMatchObject({
    title: 'Harbour',
    content: { naturalSize: FIRST_PICTURE.size },
  });
});

/**
 * A Replace run from the plugin on a Map an Open Space Resource draws is that
 * drawn Space's Edit: Back and Forward are held while it runs, the picture is
 * replaced in place, and the drawn Space, not the canvas's, records it.
 */
test('a Replace in an only-drawn Space holds Back and Forward and edits that Space', async ({
  page,
}) => {
  await serveFigure(page);
  const response = await page.request.get(`/api/spaces/${DEEP_DIVE_ID}`);
  expect(response.ok()).toBe(true);
  const loaded = decodeLoadedSpace(await response.json());
  const targetMap = loaded.snapshot.document.maps?.[0];
  if (targetMap === undefined) throw new Error('Deep dive must have a Map');
  const committed = await page.request.post('/api/spaces', {
    data: {
      changes: [
        {
          kind: 'update',
          spaceId: DEEP_DIVE_ID,
          snapshot: {
            ...loaded.snapshot,
            document: {
              ...loaded.snapshot.document,
              maps: [
                {
                  ...targetMap,
                  positions: {
                    [HARBOUR_ID]: { x: 0, y: 0, open: false, size: SIZED_TO_PICTURE },
                  },
                  graphs: targetMap.graphs.map((graph) => ({ ...graph, edges: [] })),
                },
              ],
            },
          },
          expectedRevision: loaded.revision.toString(),
        },
      ],
    },
  });
  expect(committed.ok()).toBe(true);
  const harbourBefore = loaded.snapshot.resources.find(({ id }) => id === HARBOUR_ID)?.document;
  const drawingId = uuidSchema.parse('00000000-0000-4000-8000-000000000011');
  const root = await seedPositionedMap(page, 'Embedded pictures', () => ({
    [drawingId]: { x: 0, y: 0, content: { open: true }, size: { width: 900, height: 700 } },
  }));
  const rootBefore = root.snapshot.resources;
  await page.goto(`/spaces/${encodeCompactUuid(root.snapshot.id)}`);
  await expect(selectedCanvas(page)).toHaveText('Embedded pictures');
  const drawing = page.locator(`.react-flow__node[data-id="${drawingId}"]`);
  const picture = page.locator(`.react-flow__node[data-id="embedded:${drawingId}:${HARBOUR_ID}"]`);
  await expect(picture).toBeVisible();
  await expect(page.getByRole('button', { name: 'Spaces. 1 open.' })).toBeVisible();
  const edit = (await resourceControls(page, drawing)).getByRole('button', {
    name: 'Edit Resource Deep dive',
  });
  await edit.focus();
  await edit.press('Enter');
  const heldUrl = page.url();
  expect(await followFragment(page, 'embedded-image')).toBe(true);
  const fragmentUrl = page.url();

  const release = await holdUploads(page);
  await replaceHeld(page, picture, 'Harbour');
  const afterBack = await traverseCounting(page, -1);
  await expect.poll(afterBack).toEqual({ pops: 2, url: fragmentUrl });
  await expect(picture.getByTestId('image-notice')).toHaveText('Replacing image…');

  release();
  await expect(picture.getByTestId('image-notice')).toHaveCount(0);
  await expect(picture.getByRole('img', { name: 'Harbour' })).toHaveAttribute(
    'src',
    /^\/assets\/[A-Za-z0-9_-]{43}$/u,
  );
  await expect
    .poll(async () => {
      const result = await page.request.get(`/api/spaces/${DEEP_DIVE_ID}`);
      return decodeLoadedSpace(await result.json()).snapshot.resources.find(
        ({ id }) => id === HARBOUR_ID,
      )?.document;
    })
    .toMatchObject({ kind: 'image', content: { naturalSize: FIRST_PICTURE.size } });
  const harbourAfter = decodeLoadedSpace(
    await (await page.request.get(`/api/spaces/${DEEP_DIVE_ID}`)).json(),
  ).snapshot.resources.find(({ id }) => id === HARBOUR_ID)?.document;
  expect(harbourAfter).not.toEqual(harbourBefore);
  // The canvas's own Space recorded nothing of it.
  const rootAfter = decodeLoadedSpace(
    await (await page.request.get(`/api/spaces/${root.snapshot.id}`)).json(),
  ).snapshot.resources;
  expect(rootAfter).toEqual(rootBefore);

  await page.goBack();
  await expect(page).toHaveURL(heldUrl);
  await expect(page.getByRole('button', { name: 'Spaces. 1 open.' })).toBeVisible();
});

/** Presenting draws the picture fitted on the Stage, and offers no Replace there. */
test('a presented Image Resource offers no Replace', async ({ page }) => {
  await serveFigure(page);
  await openPictures(page, { presentable: true });
  await presentControl(page).click();
  const presented = presentedResource(page);
  await expectPictureLoaded(presented.getByRole('img', { name: 'Figure' }), HARBOUR_SIZE.width);
  await expect(page.getByRole('button', { name: /^Replace image/u })).toHaveCount(0);
});

/**
 * The tracked fixture's Image Resource shows a stored image the host seeded from
 * a tracked file before serving (ADR 0106), so it draws with every request that
 * leaves the host refused.
 */
test('the tracked fixture draws its Image Resource with no network', async ({
  page,
  e2eServer,
}) => {
  const hostUrl = e2eServer.resolvedUrls?.local[0];
  if (hostUrl === undefined) throw new Error('Vite did not publish a loopback URL');
  const host = new URL(hostUrl).origin;
  const escaped: string[] = [];
  await page.route(
    (url) => url.origin !== host,
    (route) => {
      escaped.push(route.request().url());
      return route.abort();
    },
  );
  await page.goto(`/spaces/${encodeCompactUuid(DEEP_DIVE_ID)}`);
  await expect(selectedCanvas(page)).toContainText('Deep dive');
  await settled(page);

  const resource = page
    .locator(`.react-flow__node[data-id="${HARBOUR_ID}"]`)
    .getByRole('article', { name: 'Harbour' });
  const picture = resource.getByRole('img', { name: 'Harbour' });
  await expect(picture).toHaveAttribute('src', /^\/assets\/[A-Za-z0-9_-]{43}$/u);
  await expectPictureLoaded(picture, HARBOUR_SIZE.width);
  expect(escaped).toEqual([]);
});

/**
 * A Reference Resource targets an Image Resource (ADR 0070, ADR 0106, ADR
 * 0142). Created from the Image Resource's own menu, it is named after it with
 * the caret in its Title; Opening it changes no size; it draws that picture
 * read-only, with Close and no Replace, not on its rail and not in its
 * failed-image state; replacing the Target's image, through the Target's own
 * Replace, changes what it draws; and the picture is named by the Reference's
 * Title, which its rail renames without touching the Target's.
 */
test(
  "an Open Reference Resource draws its Image Resource Target's picture read-only",
  { tag: '@parity:open-reference-draws-target-image-read-only' },
  async ({ page }) => {
    await page.route(FIGURE_URL, (route) => route.abort());
    const spaceId = await openPictures(page);

    // An Image Resource draws no Title heading, so its node is found by its id.
    const { node: image } = await imageControls(page);
    await (
      await resourceToolbar(page, image)
    )
      .getByRole('button', { name: 'Actions for Resource Figure' })
      .click({ delay: 120 });
    const menu = page.getByRole('menu').last();
    await menu.getByRole('menuitem', { name: 'Create Reference' }).click();
    const title = page.getByRole('textbox', { name: 'Resource title' });
    await expect(title).toBeFocused();
    await expect(title).toHaveValue('Figure');
    await title.press('Enter');
    await expect(title).toHaveCount(0);
    await settled(page);

    const node = page
      .locator('.react-flow__node')
      .filter({ has: page.locator('[data-kind="reference"]') });
    await expect(node).toHaveCount(1);
    const referenceId = await node.getAttribute('data-id');
    if (referenceId === null) throw new Error('The Reference Resource has no id.');
    const response = await page.request.get(`/api/spaces/${spaceId}`);
    const stored = decodeLoadedSpace(await response.json()).snapshot.resources.find(
      ({ id }) => id === referenceId,
    );
    expect(stored?.document).toEqual({
      title: 'Figure',
      kind: 'reference',
      content: { target: IMAGE_ID },
    });

    const reference = page.locator(`.react-flow__node[data-id="${referenceId}"]`);
    await openResource(reference, 'Figure');
    const article = reference.getByRole('article', { name: 'Figure' });
    await expect(article).toHaveAttribute('data-kind', 'reference');
    // Open is the Reference plugin's Map content (ADR 0142), which its view draws.
    await expect(article.locator('[data-open="true"]')).toHaveCount(1);
    // Opening changes no size: the Reference Resource keeps the Closed Size.
    await expect.poll(() => authoredSize(reference)).toEqual(COLLAPSED_RESOURCE_SIZE);

    // The Target's picture did not load: the Reference Resource names its URL
    // and offers no Replace, which is the Image Resource's own command.
    await expect(article.getByText('Image did not load')).toBeVisible();
    await expect(article.getByText(FIGURE_URL)).toBeVisible();
    await expect(article.getByRole('button', { name: /Replace/ })).toHaveCount(0);
    const controls = await resourceControls(page, reference);
    await expect(controls.getByRole('button', { name: 'Close Resource Figure' })).toBeVisible();
    await expect(controls.getByRole('button', { name: /^Replace image of Resource/ })).toHaveCount(
      0,
    );
    await expect(controls.getByRole('button', { name: /^Edit Resource/ })).toHaveCount(0);

    // The picture is named by the Reference's Title, renamed from its rail: the
    // rename is the Reference's, and the Target keeps its own Title.
    await controls.getByRole('button', { name: 'Rename Resource Figure' }).click();
    const rename = page.getByRole('textbox', { name: 'Resource title' });
    await expect(rename).toBeFocused();
    await rename.fill('Figure, referenced');
    await rename.press('Enter');
    const renamedArticle = reference.getByRole('article', { name: 'Figure, referenced' });
    await expect(renamedArticle).toBeVisible();
    await settled(page);
    const renamed = decodeLoadedSpace(
      await (await page.request.get(`/api/spaces/${spaceId}`)).json(),
    ).snapshot.resources;
    expect(renamed.find(({ id }) => id === referenceId)?.document.title).toBe('Figure, referenced');
    expect(renamed.find(({ id }) => id === IMAGE_ID)?.document.title).toBe('Figure');

    // Replacing the Target's image, from the Target's own rail, is what changes
    // the Reference Resource's picture.
    await page.keyboard.press('Escape');
    await replaceFromRail(page, FIRST_FILE);
    const picture = renamedArticle.getByRole('img', { name: 'Figure, referenced' });
    await expect(picture).toHaveAttribute('src', /^\/assets\/[A-Za-z0-9_-]{43}$/u);
    await expectPictureLoaded(picture, FIRST_PICTURE.size.width);
    await expect(renamedArticle.getByText('Image did not load')).toHaveCount(0);
    await settled(page);
    expect((await storedFigure(page, spaceId)).figure).toMatchObject({
      content: { naturalSize: FIRST_PICTURE.size },
    });
  },
);

/**
 * Paste text with the pointer over `over` while `focused` holds the caret: the
 * paste goes to the focused element and lands where the pointer is.
 */
async function pasteOver(page: Page, focused: Locator, over: Locator, text: string): Promise<void> {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate((copied) => navigator.clipboard.writeText(copied), text);
  await focused.focus();
  const box = await boxOf(over, 'the paste target');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.press('ControlOrMeta+V');
}

test('drop and paste create in an edited embedded Map and an inert drop or paste is refused', async ({
  page,
}) => {
  await serveFigure(page);
  const rootId = await openForCreation(page);
  await createResource(page, 'Space Resource');
  const naming = page.getByRole('textbox', { name: 'Resource title' });
  const title = await naming.inputValue();
  await naming.press('Enter');
  await settled(page);
  const rootRead = await page.request.get(`/api/spaces/${rootId}`);
  const frame = decodeLoadedSpace(await rootRead.json()).snapshot.resources.find(
    ({ document }) => document.kind === 'space' && document.title === title,
  );
  if (frame?.document.kind !== 'space') throw new Error('Space Resource was not created');
  const targetId = uuidSchema.parse(frame.document.content.spaceId);
  const drawing = page.locator(`.react-flow__node[data-id="${frame.id}"]`);
  await openFromRail(page, drawing);
  const child = page.locator(`.react-flow__node[data-id^="embedded:${frame.id}:"]`).first();
  await expect(child).toBeVisible();
  await pasteOver(page, drawing, child, FIGURE_URL);
  await expect(page.getByTestId('canvas-command-refusal')).toHaveText(
    'Edit this Map before adding Resources.',
  );
  await expect(page.getByRole('textbox', { name: 'Resource title' })).toHaveCount(0);
  expect(await storedImages(page, rootId)).toHaveLength(0);
  expect(await dropPictureOn(child, FIRST_PICTURE)).toEqual({ taken: true, dropEffect: 'none' });
  await expect(page.getByTestId('canvas-command-refusal')).toHaveText(
    'Edit this Map before adding Resources.',
  );
  expect(await storedImages(page, targetId)).toHaveLength(0);
  const edit = (await resourceControls(page, drawing)).getByRole('button', {
    name: `Edit Resource ${title}`,
  });
  await edit.focus();
  await edit.press('Enter');
  await expect(child.locator('.rf-resource-node__inner')).toHaveAttribute(
    'data-connection-authoring',
    'true',
  );
  expect((await dropPictureOn(child, FIRST_PICTURE)).taken).toBe(true);
  const createdTitle = page.getByRole('textbox', { name: 'Resource title' });
  await expect(createdTitle).toBeFocused();
  await expect(
    createdTitle.locator('xpath=ancestor::*[contains(@class,"react-flow__node")][1]'),
  ).toHaveAttribute('data-id', /^embedded:/);
  await createdTitle.press('Escape');
  await expect.poll(async () => (await storedImages(page, targetId)).length).toBe(1);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate((url) => navigator.clipboard.writeText(url), FIGURE_URL);
  await child.focus();
  const box = await boxOf(child, 'the embedded Resource');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.press('ControlOrMeta+V');
  await expect(createdTitle).toBeFocused();
  await createdTitle.press('Escape');
  await expect.poll(async () => (await storedImages(page, targetId)).length).toBe(2);
  expect(await storedImages(page, rootId)).toHaveLength(0);
});

/** Create a Space Resource on the opened Space's Map and Open it, answering it and its target. */
async function openSpaceResource(
  page: Page,
  rootId: UUID,
): Promise<{
  readonly drawing: Locator;
  readonly id: UUID;
  readonly title: string;
  readonly targetId: UUID;
}> {
  await createResource(page, 'Space Resource');
  const naming = page.getByRole('textbox', { name: 'Resource title' });
  const title = await naming.inputValue();
  await naming.press('Enter');
  await settled(page);
  const rootRead = await page.request.get(`/api/spaces/${rootId}`);
  const frame = decodeLoadedSpace(await rootRead.json()).snapshot.resources.find(
    ({ document }) => document.kind === 'space' && document.title === title,
  );
  if (frame?.document.kind !== 'space') throw new Error('Space Resource was not created');
  const drawing = page.locator(`.react-flow__node[data-id="${frame.id}"]`);
  await openFromRail(page, drawing);
  await expect(
    page.locator(`.react-flow__node[data-id^="embedded:${frame.id}:"]`).first(),
  ).toBeVisible();
  return {
    drawing,
    id: frame.id,
    title,
    targetId: uuidSchema.parse(frame.document.content.spaceId),
  };
}

test('a drop or paste on the Map a Reference Resource draws is refused as read-only', async ({
  page,
}) => {
  const rootId = await openForCreation(page);
  const { drawing, id, title, targetId } = await openSpaceResource(page, rootId);
  await (
    await resourceControls(page, drawing)
  )
    .getByRole('button', { name: `Actions for Resource ${title}` })
    .click();
  await page.getByRole('menuitem', { name: 'Create Reference' }).click();
  const naming = page.getByRole('textbox', { name: 'Resource title' });
  await expect(naming).toBeFocused();
  await naming.press('Enter');
  await settled(page);
  const rootRead = await page.request.get(`/api/spaces/${rootId}`);
  const reference = decodeLoadedSpace(await rootRead.json()).snapshot.resources.find(
    ({ document }) => document.kind === 'reference' && document.content.target === id,
  );
  if (reference === undefined) throw new Error('Reference Resource was not created');
  const referenceNode = page.locator(`.react-flow__node[data-id="${reference.id}"]`);
  await openFromRail(page, referenceNode);
  const child = page.locator(`.react-flow__node[data-id^="embedded:${reference.id}:"]`).first();
  await expect(child).toBeVisible();

  await pasteOver(page, referenceNode, child, FIGURE_URL);
  await expect(page.getByTestId('canvas-command-refusal')).toHaveText(
    'This Map is shown read-only, so nothing can be added to it.',
  );
  await expect(page.getByRole('textbox', { name: 'Resource title' })).toHaveCount(0);
  expect(await storedImages(page, rootId)).toHaveLength(0);
  expect(await dropPictureOn(child, FIRST_PICTURE)).toEqual({ taken: true, dropEffect: 'none' });
  await expect(page.getByTestId('canvas-command-refusal')).toHaveText(
    'This Map is shown read-only, so nothing can be added to it.',
  );
  expect(await storedImages(page, targetId)).toHaveLength(0);
});

test('a Resource dragged from the Resources list onto an edited drawn Map is refused', async ({
  page,
}) => {
  const rootId = await openForCreation(page);
  const { drawing, title, targetId } = await openSpaceResource(page, rootId);
  const edit = (await resourceControls(page, drawing)).getByRole('button', {
    name: `Edit Resource ${title}`,
  });
  await edit.focus();
  await edit.press('Enter');
  const child = page.locator(`.react-flow__node[data-id^="embedded:"]`).first();
  await expect(child.locator('.rf-resource-node__inner')).toHaveAttribute(
    'data-connection-authoring',
    'true',
  );
  const before = await storedRevision(page, targetId);
  const rootRead = await page.request.get(`/api/spaces/${rootId}`);
  const canvasResource = decodeLoadedSpace(await rootRead.json()).snapshot.resources.find(
    ({ document }) => document.kind === 'markdown',
  );
  if (canvasResource === undefined) throw new Error('The opened Space holds no Markdown Resource.');

  // The Resources list carries one of the canvas's own Resources, which no Map
  // of another Space can place.
  await child.evaluate((element, resourceId) => {
    const transfer = new DataTransfer();
    transfer.setData('application/x-infinity-cube-resource-id', resourceId);
    const box = element.getBoundingClientRect();
    const init = {
      dataTransfer: transfer,
      clientX: box.left + box.width / 2,
      clientY: box.top + box.height / 2,
      bubbles: true,
      cancelable: true,
    };
    element.dispatchEvent(new DragEvent('dragover', init));
    element.dispatchEvent(new DragEvent('drop', init));
  }, canvasResource.id);

  await expect(page.getByTestId('canvas-command-refusal')).toHaveText(
    'A Resource can be placed only on a Map of its own Space.',
  );
  await settled(page);
  expect(await storedRevision(page, targetId)).toBe(before);
});
