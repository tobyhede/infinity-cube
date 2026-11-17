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

  const nodes = flow.getByTestId('mermaid-diagram').locator('svg .node');
  await expect(nodes).toHaveCount(2, { timeout: 20_000 });
  await expect(flow.getByTestId('mermaid-diagram')).toContainText('Edit');
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
