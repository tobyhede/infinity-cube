import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  dockNavigation,
  expectAvailable,
  expectWithheld,
  resourceControls,
  selectedCanvas,
} from '../e2e/graph';

/**
 * Replacing a picture over the production application (ADR 0142): the story's
 * Space holds an Image Resource, Figure, and one whose picture never resolves,
 * Missing. Its asset store answers one reference after a second.
 */

const story = '/?story=space--replace-image--default&mode=preview';
const FIGURE_URL = 'https://example.com/figure.png';
const STORED_URL = '/assets/LXEWQrcmsEQBYnyp-6wy9chTD7GQPMTbAiWHF5IaSIE';
const HARBOUR = readFileSync(
  new URL('../fixture/assets/fZoCiTSlSs9w9S87nrFeaOkPdKB4wvFrbWfaMn23ZOs.png', import.meta.url),
);
const PICTURE = { name: 'harbour.png', mimeType: 'image/png', buffer: HARBOUR };

/** The node an Image Resource is drawn in, found by its accessible name, its Title. */
const imageNode = (page: Page, title: string): Locator =>
  page
    .locator('.react-flow__node')
    .filter({ has: page.getByRole('article', { name: title, exact: true }) });

const open = async (page: Page): Promise<void> => {
  for (const url of [FIGURE_URL, `**${STORED_URL}`]) {
    await page.route(url, (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: HARBOUR }),
    );
  }
  await page.goto(story);
  await expect(imageNode(page, 'Figure')).toBeVisible();
};

/** Press the rail's Replace on `title` and choose `file` in the picker it opens. */
const replaceFromRail = async (
  page: Page,
  title: string,
  file: { name: string; mimeType: string; buffer: Buffer },
) => {
  const node = imageNode(page, title);
  const controls = await resourceControls(page, node);
  const chooser = page.waitForEvent('filechooser');
  await controls.getByRole('button', { name: `Replace image of Resource ${title}` }).click();
  await (await chooser).setFiles(file);
  return node;
};

test(
  'Replace on the rail stores the chosen picture and names it in one Edit, withholding navigation until it answers',
  {
    tag: [
      '@parity:image-resource-replace-from-the-rail',
      '@parity:image-resource-replace-holds-navigation',
    ],
  },
  async ({ page }) => {
    await open(page);
    const revision = page.getByTestId('replacement-revision');
    const before = Number(await revision.textContent());

    const node = await replaceFromRail(page, 'Figure', PICTURE);
    await expect(node.getByTestId('image-notice')).toHaveText('Replacing image…');
    const menuButtons = dockNavigation(page);
    await expectWithheld(menuButtons);
    await expect(selectedCanvas(page)).toHaveText('Pictures');

    const picture = node.getByRole('img', { name: 'Figure' });
    await expect(picture).toHaveAttribute('src', STORED_URL);
    await expect(node.getByTestId('image-notice')).toHaveCount(0);
    await expectAvailable(menuButtons);
    await expect(revision).toHaveAttribute('data-url', STORED_URL);
    await expect(revision).toHaveText(String(before + 1));
  },
);

test(
  'Replace refuses a file that is not a picture and an SVG over the picture, which stays',
  { tag: '@parity:image-resource-replace-refuses' },
  async ({ page }) => {
    await open(page);
    const node = await replaceFromRail(page, 'Figure', {
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello'),
    });
    const notice = node.getByTestId('image-notice');
    await expect(notice).toHaveText('notes.txt is not a PNG, JPEG, WebP or GIF image.');
    await replaceFromRail(page, 'Figure', {
      name: 'figure.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    });
    await expect(notice).toHaveText(
      'figure.svg is an SVG image, which cannot be stored. Use PNG, JPEG, WebP or GIF.',
    );
    await expect(node.getByRole('img', { name: 'Figure' })).toHaveAttribute('src', FIGURE_URL);
    await expect(page.getByTestId('replacement-revision')).toHaveAttribute('data-url', FIGURE_URL);
  },
);

/** A picture that does not load still offers Replace, which recovers it. */
test('an Image Resource whose picture does not load is replaced from its rail', async ({
  page,
}) => {
  await open(page);
  const missing = imageNode(page, 'Missing');
  await expect(missing.getByText('Image did not load')).toBeVisible();
  await replaceFromRail(page, 'Missing', PICTURE);
  await expect(missing.getByRole('img', { name: 'Missing' })).toHaveAttribute('src', STORED_URL);
});
