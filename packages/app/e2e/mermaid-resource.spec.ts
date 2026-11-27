import type { Locator } from '@playwright/test';
import { expect, test } from './fixtures';
import { PRIMARY_MODIFIER } from './markdown-source';
import {
  boxOf,
  createResource,
  nodeByTitle,
  resourceControls,
  selectResource,
  settled,
} from './graph';

/**
 * Save the source being edited in `resource` on Mod-Enter, then Open it to
 * draw it: an edit begun from Closed leaves it Closed (ADR 0178).
 */
async function saveThenOpen(resource: Locator, title: string): Promise<void> {
  const page = resource.page();
  const source = page.getByRole('textbox', { name: `Mermaid source of ${title}` });
  await source.press(`${PRIMARY_MODIFIER}+Enter`);
  await expect(source).toHaveCount(0);
  await (
    await resourceControls(page, resource)
  )
    .getByRole('button', { name: `Open Resource ${title}` })
    .click();
}

/**
 * A Mermaid Resource drawn by the Mermaid library itself (ADR 0158), which no
 * unit test can run: jsdom has no layout for it to measure with.
 */
test('a Mermaid Resource draws its saved source with Mermaid, in the canvas’s colour scheme', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await settled(page);
  await createResource(page, 'Mermaid Resource');
  const title = page.getByRole('textbox', { name: 'Resource title' });
  await expect(title).toBeFocused();
  await title.fill('Flow');
  await title.press('Enter');

  const flow = nodeByTitle(page, 'Flow').first();
  // Edit from Closed begins editing without Opening it (ADR 0178), so the
  // diagram is drawn once the saved Resource is Opened.
  await (
    await resourceControls(page, flow)
  )
    .getByRole('button', { name: 'Edit Resource Flow' })
    .click();
  const source = page.getByRole('textbox', { name: 'Mermaid source of Flow' });
  await expect(source).toBeFocused();
  await source.fill('flowchart LR\n  Edit --> Save');
  await saveThenOpen(flow, 'Flow');

  const nodes = flow.locator('svg[aria-roledescription] .node');
  await expect(nodes).toHaveCount(2, { timeout: 20_000 });
  // The SVG Mermaid draws names its kind of drawing in `aria-roledescription`.
  await expect(flow.locator('svg[aria-roledescription]')).toContainText('Edit');
  // Laid out inside the Resource, Mermaid never grows the page past its one
  // viewport.
  expect(
    await page.evaluate(() => (document.scrollingElement?.scrollHeight ?? 0) <= window.innerHeight),
  ).toBe(true);

  const fill = () =>
    nodes.first().evaluate((node) => {
      const box = node.querySelector('rect, polygon, path');
      return box === null ? '' : getComputedStyle(box).fill;
    });
  const light = await fill();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(fill).not.toBe(light);
});

test('a Mermaid source that chooses its own theme keeps it in either colour scheme', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await settled(page);
  await createResource(page, 'Mermaid Resource');
  const title = page.getByRole('textbox', { name: 'Resource title' });
  await expect(title).toBeFocused();
  await title.fill('Themed');
  await title.press('Enter');

  const themed = nodeByTitle(page, 'Themed').first();
  await (
    await resourceControls(page, themed)
  )
    .getByRole('button', { name: 'Edit Resource Themed' })
    .click();
  const source = page.getByRole('textbox', { name: 'Mermaid source of Themed' });
  await expect(source).toBeFocused();
  await source.fill('---\nconfig:\n  theme: forest\n---\nflowchart LR\n  A --> B');
  await saveThenOpen(themed, 'Themed');

  const nodes = themed.locator('svg[aria-roledescription] .node');
  await expect(nodes).toHaveCount(2, { timeout: 20_000 });
  const fill = () =>
    nodes.first().evaluate((node) => {
      const box = node.querySelector('rect, polygon, path');
      return box === null ? '' : getComputedStyle(box).fill;
    });
  // Mermaid's `forest` theme fills a node with this green in either scheme.
  const FOREST = 'rgb(205, 228, 152)';
  await expect.poll(fill).toBe(FOREST);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(fill).toBe(FOREST);
});

test('a Mermaid source that cannot be drawn is refused in Mermaid’s words, naming the author’s own line', async ({
  page,
}) => {
  await page.goto('/');
  await settled(page);
  await createResource(page, 'Mermaid Resource');
  const title = page.getByRole('textbox', { name: 'Resource title' });
  await expect(title).toBeFocused();
  await title.fill('Broken');
  await title.press('Enter');

  const broken = nodeByTitle(page, 'Broken').first();
  await (
    await resourceControls(page, broken)
  )
    .getByRole('button', { name: 'Edit Resource Broken' })
    .click();
  const source = page.getByRole('textbox', { name: 'Mermaid source of Broken' });
  await expect(source).toBeFocused();
  // Three lines, the third of them the one Mermaid cannot read.
  await source.fill('flowchart LR\n  A --> B\n  B --> --> C');
  await saveThenOpen(broken, 'Broken');

  // The source is drawn as written, so the line Mermaid names is the author's.
  await expect(broken.getByRole('note')).toContainText('Parse error on line 3', {
    timeout: 20_000,
  });
});

test('an edit draws a Mermaid Resource at its Edit size, which a resize writes and the next edit keeps', async ({
  page,
}) => {
  await page.goto('/');
  await settled(page);
  await createResource(page, 'Mermaid Resource');
  const title = page.getByRole('textbox', { name: 'Resource title' });
  await expect(title).toBeFocused();
  await title.fill('Sized');
  await title.press('Enter');

  const sized = nodeByTitle(page, 'Sized').first();
  const rect = async () =>
    sized.evaluate((element) => ({
      width: Number.parseFloat(getComputedStyle(element).width),
      height: Number.parseFloat(getComputedStyle(element).height),
    }));
  const source = page.getByRole('textbox', { name: 'Mermaid source of Sized' });
  const edit = async () => {
    await (
      await resourceControls(page, sized)
    )
      .getByRole('button', { name: 'Edit Resource Sized' })
      .click();
    await expect(source).toBeVisible();
  };
  const cancel = async () => {
    await (
      await resourceControls(page, sized)
    )
      .getByRole('button', { name: 'Cancel editing Resource Sized' })
      .click();
    await expect(source).toHaveCount(0);
  };
  const size = await rect();

  // With no Edit size stored, the editor is drawn at the larger of the
  // plugin's hint and the size on each axis (ADR 0178): the reading width.
  await edit();
  await expect.poll(async () => (await rect()).width).toBe(READING_WIDTH);
  expect((await rect()).height).toBeGreaterThanOrEqual(size.height);
  const measured = await rect();

  // A resize while editing writes the Edit size, and leaves the size alone.
  await selectResource(sized);
  const handle = await boxOf(
    sized.locator('.react-flow__resize-control.handle.bottom.right'),
    'resize control',
  );
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 120, handle.y + handle.height / 2 + 90, {
    steps: 5,
  });
  await page.mouse.up();
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
  await sized.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  const edited = await rect();
  expect(edited.width).toBeGreaterThan(measured.width);
  expect(edited.height).toBeGreaterThan(measured.height);
  await expect(source).toBeVisible();

  // Cancel draws it at its size again; the next edit draws it at the Edit size.
  await cancel();
  await expect.poll(rect).toEqual(size);
  await edit();
  await expect.poll(rect).toEqual(edited);
});

/** The width the Mermaid plugin's size hint asks for. */
const READING_WIDTH = 640;
