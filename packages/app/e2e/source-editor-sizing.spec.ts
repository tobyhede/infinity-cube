import { encodeCompactUuid, uuidSchema } from '@project/core';
import { test, expect } from './fixtures';
import { boxOf, nodeByTitle, resourceControls, settled } from './graph';
import { seedPositionedMap, storeText } from './seed';

const sources = [
  { kind: 'markdown', label: 'Markdown', text: 'Hi', media: 'text/markdown' },
  { kind: 'mermaid', label: 'Mermaid', text: 'graph LR\nA', media: 'text/vnd.mermaid' },
] as const;

for (const { kind, label, text, media } of sources) {
  test(`a narrow ${label} source editor fits below its wrapped Title`, async ({ page }) => {
    const url = await storeText(page, text, media);
    const id = uuidSchema.parse('00000000-0000-4000-8000-000000000095');
    const title = 'Three things to understand about how the presentation will change';
    const seeded = await seedPositionedMap(
      page,
      'Wide display',
      () => ({
        [id]: { x: 0, y: 0, size: { width: 900, height: 240 }, content: { open: true } },
      }),
      [{ id, document: { title, kind, content: { url } } }],
    );
    await page.goto(`/spaces/${encodeCompactUuid(seeded.snapshot.id)}`);
    const resource = nodeByTitle(page, title);
    await settled(page);
    const heading = resource.getByRole('heading', { name: title });
    const before = await boxOf(heading, 'Title on the Display rect');
    await (
      await resourceControls(page, resource)
    )
      .getByRole('button', { name: `Edit Resource ${title}`, exact: true })
      .click();
    await expect(
      resource.getByRole('textbox', { name: `${label} source of ${title}` }),
    ).toBeFocused();
    await expect
      .poll(async () => (await boxOf(heading, 'Title above the source')).height)
      .toBeGreaterThan(before.height);
    const inside = await boxOf(
      resource.locator('.canvas-resource__plugin'),
      'inside the Resource frame',
    );
    const shortcuts = await boxOf(
      resource.locator('.markdown-resource-body__shortcut-hint'),
      'source editor shortcuts',
    );
    expect(shortcuts.x + shortcuts.width).toBeLessThanOrEqual(inside.x + inside.width + 1);
    expect(shortcuts.y + shortcuts.height).toBeLessThanOrEqual(inside.y + inside.height + 1);
  });
}
