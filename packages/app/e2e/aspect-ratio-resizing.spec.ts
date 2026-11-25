import { encodeCompactUuid } from '@project/core';
import { seedPositionedMap } from './seed';
import { expect, test } from './fixtures';
import {
  boxOf,
  nodeByTitle,
  selectCanvas,
  selectResource,
  openResourcePersisted,
  positionOf,
  zoomCamera,
} from './graph';

test('Shift at resize start preserves the rect proportions after Shift is released', async ({
  page,
}) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const resource = nodeByTitle(page, 'A').first();
  const revision = await openResourcePersisted(resource, 'A');
  const neighbour = nodeByTitle(page, 'B').first();
  const neighbourPosition = await positionOf(neighbour);
  const origin = await positionOf(resource);
  await resource.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  await selectResource(resource);
  const before = await resource.evaluate((element) => ({
    width: Number.parseFloat(getComputedStyle(element).width),
    height: Number.parseFloat(getComputedStyle(element).height),
  }));
  await zoomCamera(page, 'Zoom in');
  const handle = await boxOf(
    resource.locator('.react-flow__resize-control.handle.bottom.right'),
    'resize control',
  );
  await page.keyboard.down('Shift');
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 80, handle.y + handle.height / 2 + 10, {
    steps: 3,
  });
  await expect
    .poll(() => resource.evaluate((element) => Number.parseFloat(getComputedStyle(element).width)))
    .toBeGreaterThan(before.width);
  await page.keyboard.up('Shift');
  await page.mouse.move(handle.x + handle.width / 2 + 160, handle.y + handle.height / 2 + 20, {
    steps: 5,
  });
  await expect
    .poll(() => resource.evaluate((element) => Number.parseFloat(getComputedStyle(element).width)))
    .toBeGreaterThan(before.width);

  expect(await positionOf(resource)).toEqual(origin);
  expect(await positionOf(neighbour)).toEqual(neighbourPosition);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute(
    'data-revision',
    String(revision),
  );
  await page.mouse.up();
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
  const after = await resource.evaluate((element) => ({
    width: Number.parseFloat(getComputedStyle(element).width),
    height: Number.parseFloat(getComputedStyle(element).height),
  }));
  expect(after.width).toBeGreaterThan(before.width);
  expect(after.width / after.height).toBeCloseTo(before.width / before.height, 2);
  expect(await positionOf(resource)).toEqual(origin);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute(
    'data-revision',
    String(revision + 1),
  );
  await page.reload();
  await selectCanvas(page, 'Collection 1');
  await expect(nodeByTitle(page, 'A').first()).toHaveCSS('width', `${after.width}px`);
});

for (const example of [
  { width: 400, height: 300, floorWidth: 260, floorHeight: 195 },
  { width: 600, height: 200, floorWidth: 438, floorHeight: 146 },
]) {
  test(`proportional Resize of ${example.width} by ${example.height} stops at both floors`, async ({
    page,
  }) => {
    await page.goto('/');
    const seeded = await seedPositionedMap(page, 'Proportions', (snapshot) => {
      const resource = snapshot.resources.find((candidate) => candidate.document.title === 'A');
      if (resource === undefined) throw new Error('Fixture Resource A is missing');
      return {
        [resource.id]: { x: 100, y: 100, size: { width: example.width, height: example.height } },
      };
    });
    await page.goto(`/spaces/${encodeCompactUuid(seeded.snapshot.id)}`);
    const resource = nodeByTitle(page, 'A').first();
    await selectResource(resource);
    await resource.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
    const status = page.getByTestId('persistence-status');
    await expect(status).toHaveText('Persisted');
    const revision = Number(await status.getAttribute('data-revision'));
    const handle = await boxOf(
      resource.locator('.react-flow__resize-control.handle.bottom.right'),
      'resize control',
    );
    await page.keyboard.down('Shift');
    await page.mouse.move(handle.x + 24, handle.y + 24);
    await page.mouse.down();
    await page.mouse.move(handle.x - 1000, handle.y - 1000, { steps: 6 });
    await expect(resource).toHaveCSS('width', `${example.floorWidth}px`);
    await expect(resource).toHaveCSS('height', `${example.floorHeight}px`);
    await page.mouse.up();
    await page.keyboard.up('Shift');
    // The seed already reads Persisted, so only the revision moving shows the
    // Resize Edit has landed before the reload.
    await expect(status).toHaveAttribute('data-revision', String(revision + 1));
    await expect(status).toHaveText('Persisted');
    await page.reload();
    await expect(nodeByTitle(page, 'A').first()).toHaveCSS('width', `${example.floorWidth}px`);
    await expect(nodeByTitle(page, 'A').first()).toHaveCSS('height', `${example.floorHeight}px`);
  });
}

test('cancelling a proportional Resize discards its preview', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const resource = nodeByTitle(page, 'A').first();
  await selectResource(resource);
  const revision = await page.getByTestId('persistence-status').getAttribute('data-revision');
  const before = await resource.evaluate((element) => ({
    width: getComputedStyle(element).width,
    height: getComputedStyle(element).height,
  }));
  const handle = await boxOf(
    resource.locator('.react-flow__resize-control.handle.bottom.right'),
    'resize control',
  );
  await page.keyboard.down('Shift');
  await page.mouse.move(handle.x + 24, handle.y + 24);
  await page.mouse.down();
  await page.mouse.move(handle.x + 180, handle.y + 90, { steps: 4 });
  await expect(resource).not.toHaveCSS('width', before.width);
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel')));
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(resource).toHaveCSS('width', before.width);
  await expect(resource).toHaveCSS('height', before.height);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute(
    'data-revision',
    revision ?? '',
  );
});

test('a Shift-click on the resize control keeps the Resource selected and makes no Edit', async ({
  page,
}) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const resource = nodeByTitle(page, 'A').first();
  await selectResource(resource);
  const revision = await page.getByTestId('persistence-status').getAttribute('data-revision');
  const before = await resource.evaluate((element) => ({
    width: getComputedStyle(element).width,
    height: getComputedStyle(element).height,
  }));
  const control = resource.locator('.react-flow__resize-control.handle.bottom.right');
  const handle = await boxOf(control, 'resize control');
  // Shift is also the canvas's multi-selection key (Navigation NV-9).
  await page.keyboard.down('Shift');
  await page.mouse.click(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.keyboard.up('Shift');
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );

  await expect(resource).toHaveClass(/\bselected\b/);
  await expect(control).toBeVisible();
  await expect(resource).toHaveCSS('width', before.width);
  await expect(resource).toHaveCSS('height', before.height);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute(
    'data-revision',
    revision ?? '',
  );
});

test('pressing Shift after a free Resize starts keeps that drag free', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const resource = nodeByTitle(page, 'A').first();
  await selectResource(resource);
  const status = page.getByTestId('persistence-status');
  const revision = Number(await status.getAttribute('data-revision'));
  const before = await resource.evaluate((element) => ({
    width: Number.parseFloat(getComputedStyle(element).width),
    height: Number.parseFloat(getComputedStyle(element).height),
  }));
  const handle = await boxOf(
    resource.locator('.react-flow__resize-control.handle.bottom.right'),
    'resize control',
  );
  await page.mouse.move(handle.x + 24, handle.y + 24);
  await page.mouse.down();
  await page.mouse.move(handle.x + 104, handle.y + 34, { steps: 3 });
  await expect(resource).not.toHaveCSS('width', `${before.width}px`);
  await page.keyboard.down('Shift');
  await page.mouse.move(handle.x + 184, handle.y + 44, { steps: 3 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(status).toHaveAttribute('data-revision', String(revision + 1));
  const after = await resource.evaluate((element) => ({
    width: Number.parseFloat(getComputedStyle(element).width),
    height: Number.parseFloat(getComputedStyle(element).height),
  }));
  expect(after.width / after.height).toBeGreaterThan(before.width / before.height + 0.1);
});
