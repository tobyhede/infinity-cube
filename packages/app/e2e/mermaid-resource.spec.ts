import { expect, test } from './fixtures';
import { PRIMARY_MODIFIER } from './markdown-source';
import { createResource, nodeByTitle, resourceControls, settled } from './graph';

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
  // Edit from Closed Opens it and then begins editing (ADR 0064).
  await (
    await resourceControls(page, flow)
  )
    .getByRole('button', { name: 'Edit Resource Flow' })
    .click();
  const source = page.getByRole('textbox', { name: 'Mermaid source of Flow' });
  await expect(source).toBeFocused();
  await source.fill('flowchart LR\n  Edit --> Save');
  await source.press(`${PRIMARY_MODIFIER}+Enter`);

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
  await source.press(`${PRIMARY_MODIFIER}+Enter`);

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
  await source.press(`${PRIMARY_MODIFIER}+Enter`);

  // The source is drawn as written, so the line Mermaid names is the author's.
  await expect(broken.getByRole('note')).toContainText('Parse error on line 3', {
    timeout: 20_000,
  });
});
