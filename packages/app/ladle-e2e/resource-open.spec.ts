import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { resourceToolbar, selectResource } from '../e2e/graph';
import { expectPictureLoaded, HARBOUR_SIZE } from '../e2e/image';

const openCloseStory = '/?story=components--resource--open-and-close&mode=preview';
const markdownStory = '/?story=components--resource--editing--markdown&mode=preview';

/**
 * Where an ended edit returns focus: the Resource the plugin is drawn in, which
 * the host is told to focus when the plugin's last Claim goes (ADR 0064, ADR 0142).
 */
const returnedTo = (page: Page) => page.getByRole('group', { name: 'Strategies on the canvas' });
const resizeControlStory = '/?story=components--resource--resize-control&mode=preview';
const HARBOUR = readFileSync(
  new URL('../fixture/assets/fZoCiTSlSs9w9S87nrFeaOkPdKB4wvFrbWfaMn23ZOs.png', import.meta.url),
);
const openReferenceStory = '/?story=components--resource--open-reference-resource&mode=preview';

const open = async (page: Page, story: string): Promise<void> => {
  await page.goto(story);
  await expect(page.getByRole('article', { name: 'Strategies' }).first()).toBeVisible({
    timeout: 20_000,
  });
};

test(
  'Open Reference Resource story renders Target Markdown read-only under the Reference Resource Title',
  { tag: '@parity:open-reference-shows-target-markdown-read-only' },
  async ({ page }) => {
    await page.goto(openReferenceStory);
    const reference = page.getByRole('article', { name: 'Strategy overview' });
    await expect(reference.getByRole('heading', { name: 'Strategy overview' })).toBeVisible();
    // Exact, both of them. The Target's source has to reach the renderer as real
    // Markdown: a body carrying literal escapes draws one run-on heading that a
    // substring match still finds, which is the claim passing on the wrong page.
    await expect(reference.getByRole('heading', { name: 'Strategies', exact: true })).toBeVisible();
    await expect(reference.getByText('No strategy is privileged.', { exact: true })).toBeVisible();
    await expect(reference.getByRole('textbox')).toHaveCount(0);
    const node = page.locator('.react-flow__node');
    await selectResource(node);
    const toolbar = await resourceToolbar(page, node);
    await expect(toolbar.getByRole('button', { name: /Edit Resource/ })).toHaveCount(0);
    await expect(
      toolbar.getByRole('button', { name: 'Close Resource Strategy overview' }),
    ).toBeVisible();
    // The Target's plugin draws the Reference's Title, once, as it draws its
    // own: above the Target's text, as an Open Markdown Resource draws it
    // (ADR 0070, ADR 0142).
    await expect(reference.getByRole('heading', { name: 'Strategy overview' })).toHaveCount(1);
    const titleBox = await reference
      .getByRole('heading', { name: 'Strategy overview' })
      .boundingBox();
    const contentBox = await reference
      .getByRole('heading', { name: 'Strategies', exact: true })
      .boundingBox();
    if (contentBox === null || titleBox === null)
      throw new Error('Open Reference Resource drew no content');
    expect(titleBox.y + titleBox.height).toBeLessThanOrEqual(contentBox.y + 1);
  },
);

test(
  'Open and Close retain one Resource and Title treatment',
  { tag: '@parity:markdown-resource-opens-and-closes-in-place' },
  async ({ page }) => {
    await open(page, openCloseStory);
    const specimen = page.getByRole('region', { name: 'Interactive Resource' });
    const resource = specimen.getByRole('article', { name: 'Strategies' });
    const handles = specimen.locator('.rf-resource-node__authoring-handle');
    await expect(handles).toHaveCount(8);
    const title = resource.getByRole('heading', { name: 'Strategies' });
    const closedClass = await title.getAttribute('class');
    const titleStyle = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      return {
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        paddingInline: style.paddingInline,
      };
    };
    const closedStyle = await title.evaluate(titleStyle);
    const titleLeftInset = async () => {
      const resourceBox = await resource.boundingBox();
      const titleBox = await title.boundingBox();
      if (resourceBox === null || titleBox === null)
        throw new Error('Resource title geometry is unavailable');
      return titleBox.x - resourceBox.x;
    };
    const closedInset = await titleLeftInset();
    const titleBottomInset = async () => {
      const resourceBox = await resource.boundingBox();
      const titleBox = await title.boundingBox();
      if (resourceBox === null || titleBox === null)
        throw new Error('Resource title geometry is unavailable');
      return resourceBox.y + resourceBox.height - (titleBox.y + titleBox.height);
    };
    const closedBottomInset = await titleBottomInset();

    const node = specimen.locator('.react-flow__node');
    await selectResource(node);
    const toolbar = await resourceToolbar(page, node);
    await expect(specimen.locator('.rf-resource-node__authoring-handle--source').first()).toHaveCSS(
      'opacity',
      '1',
    );
    await toolbar.getByRole('button', { name: 'Open Resource Strategies' }).click();
    await expect(resource.getByRole('heading', { name: 'Placement is authored' })).toBeVisible();
    await expect(toolbar.getByRole('button', { name: 'Close Resource Strategies' })).toBeVisible();
    await expect(title).toHaveAttribute('class', closedClass ?? '');
    expect(await title.evaluate(titleStyle)).toEqual(closedStyle);
    expect(await titleLeftInset()).toBeCloseTo(closedInset, 0);
    // Its plugin draws the text as soon as its Map content says Open, and none
    // of it once Closed, with the Title where it was Closed (ADR 0142).
    await expect(resource.locator('.canvas-resource__plugin [data-open="true"]')).toHaveCount(1);
    await toolbar.getByRole('button', { name: 'Close Resource Strategies' }).click();
    await expect(resource.getByRole('heading', { name: 'Placement is authored' })).toHaveCount(0);
    await expect(resource.locator('.canvas-resource__plugin [data-open="false"]')).toHaveCount(1);
    expect(await titleLeftInset()).toBeCloseTo(closedInset, 0);
    expect(await titleBottomInset()).toBeCloseTo(closedBottomInset, 0);

    const transitionDuration = (element: Element, property: string) => {
      const style = getComputedStyle(element);
      const properties = style.transitionProperty.split(',').map((value) => value.trim());
      const durations = style.transitionDuration.split(',').map((value) => value.trim());
      const index = properties.indexOf(property);
      const duration = durations[index] ?? durations[0];
      if (duration === undefined) return null;
      return duration.endsWith('ms')
        ? Number.parseFloat(duration)
        : Number.parseFloat(duration) * 1000;
    };

    // Deselected, the Resource's Edge handles quiet once the pointer leaves it.
    await specimen.locator('.react-flow__pane').click({ position: { x: 2, y: 2 } });
    await page.mouse.move(0, 0);
    await expect(node).not.toHaveClass(/\bselected\b/);
    const sourceHandle = specimen.locator('.rf-resource-node__authoring-handle--source').first();
    await expect(sourceHandle).toHaveCSS('opacity', '0');
    expect(await sourceHandle.evaluate(transitionDuration, 'opacity')).toBe(120);

    const leavingContent = resource.locator('.canvas-resource__content');
    await expect(leavingContent).toHaveCount(0);
    await expect(resource).toHaveAttribute('data-open', 'false');
    await selectResource(node);
    await expect(toolbar.getByRole('button', { name: 'Open Resource Strategies' })).toBeVisible();
    const longResource = page.getByRole('region', { name: 'Long Markdown Resource' });
    await expect(longResource).toBeVisible();
    const longNode = longResource.locator('.react-flow__node');
    await selectResource(longNode);
    const longToolbar = await resourceToolbar(page, longNode);
    await longToolbar.getByRole('button', { name: 'Close Resource Long Markdown' }).click();
    await expect(longResource.getByRole('heading', { name: 'Placement is authored' })).toHaveCount(
      0,
    );
    await expect(
      longToolbar.getByRole('button', { name: 'Open Resource Long Markdown' }),
    ).toBeVisible();
  },
);

test(
  'the Resource fills a React Flow node whose rect differs from the collapsed default',
  { tag: '@parity:canvas-resource-fills-authored-node-rect' },
  async ({ page }) => {
    await page.goto(resizeControlStory);
    const openRegion = page.getByRole('region', { name: 'Open Resource', exact: true });
    const node = openRegion.locator('.react-flow__node');
    const resource = node.getByRole('article', { name: 'Strategies' });
    await expect(resource).toBeVisible({ timeout: 20_000 });

    const boxes = await node.evaluate((element) => {
      const resourceElement = element.querySelector('.canvas-resource');
      if (resourceElement === null)
        throw new Error('The React Flow node contains no CanvasResource');
      const nodeBox = element.getBoundingClientRect();
      const resourceBox = resourceElement.getBoundingClientRect();
      return {
        node: { width: nodeBox.width, height: nodeBox.height },
        resource: { width: resourceBox.width, height: resourceBox.height },
      };
    });
    expect(boxes.node.width).not.toBeCloseTo(260, 0);
    expect(boxes.node.height).not.toBeCloseTo(146, 0);
    expect(boxes.resource).toEqual(boxes.node);
  },
);

test(
  'a selected Resource, Open or Closed, exposes one bottom-right resize control; an unselected Resource exposes none',
  { tag: '@parity:selected-resource-offers-one-resize-control' },
  async ({ page }) => {
    await page.goto(resizeControlStory);
    const openRegion = page.getByRole('region', { name: 'Open Resource', exact: true });
    const closedRegion = page.getByRole('region', { name: 'Closed Resource', exact: true });
    const unselectedRegion = page.getByRole('region', { name: 'Unselected Resource' });
    await expect(openRegion.getByRole('article', { name: 'Strategies' })).toBeVisible({
      timeout: 20_000,
    });

    const openControl = openRegion.locator('.react-flow__resize-control');
    await expect(openControl).toHaveCount(1);
    await expect(openControl).toHaveClass(/\bbottom\b/);
    await expect(openControl).toHaveClass(/\bright\b/);
    await expect(closedRegion.locator('.react-flow__resize-control')).toHaveCount(1);
    await expect(unselectedRegion.locator('.react-flow__resize-control')).toHaveCount(0);

    // Selection is the reveal: the control stays up with the pointer away.
    await page.mouse.move(0, 0);
    await expect(openControl).toHaveCSS('opacity', '1');
    await expect(closedRegion.locator('.react-flow__resize-control')).toHaveCSS('opacity', '1');
    await expect(openRegion.locator('.rf-resource-node__resize-frame')).toHaveCount(0);

    const node = openRegion.locator('.react-flow__node');
    const before = await node.boundingBox();
    if (before === null) throw new Error('The Open Resource node has no box.');
    const box = await openControl.boundingBox();
    if (box === null) throw new Error('The Open resize control has no box.');

    // The hit target, asserted as a size rather than left to the drag below.
    // React Flow's own `.react-flow__resize-control.handle` declares a 5px box
    // and outranks a rule naming one class, so a drag alone would pass with a
    // control too small for a pointer to find — Playwright hits 5px exactly and
    // a hand does not. The mark stays smaller than the target it sits in.
    expect(box.width).toBe(48);
    expect(box.height).toBe(48);
    const markLocator = openRegion.locator('.rf-resource-node__resize-mark');
    const mark = await markLocator.boundingBox();
    if (mark === null) throw new Error('The Open resize control draws no mark.');
    expect(mark.width).toBe(20);
    expect(mark.height).toBe(20);
    expect(mark.x - box.x).toBe(33);
    expect(mark.y - box.y).toBe(33);
    expect(mark.x + mark.width - (before.x + before.width)).toBe(5);
    expect(mark.y + mark.height - (before.y + before.height)).toBe(5);
    await expect(markLocator).toHaveCSS('background-color', 'rgb(0, 0, 0)');

    // The interactive control stays inside the Resource so its invisible state
    // cannot receive an unannounced touch over the pane. Only its inert mark
    // straddles the bottom-right edge by 5px on each axis.
    expect(box.x).toBeGreaterThanOrEqual(before.x);
    expect(box.y).toBeGreaterThanOrEqual(before.y);
    expect(box.x + box.width).toBeLessThanOrEqual(before.x + before.width + 0.5);
    expect(box.y + box.height).toBeLessThanOrEqual(before.y + before.height + 0.5);

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 80, { steps: 6 });
    await page.mouse.up();
    // The node's own CSS transitions width/height/transform (`.rf-resource-node`),
    // so the released rect is reached only once that settles.
    await node.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });

    const after = await node.boundingBox();
    if (after === null) throw new Error('The Open Resource node has no box after resizing.');
    expect(after.width).toBeGreaterThan(before.width);
    expect(after.height).toBeGreaterThan(before.height);
    expect(after.x).toBeCloseTo(before.x, 0);
    expect(after.y).toBeCloseTo(before.y, 0);
  },
);

test(
  'a selected Shape frames its rect, and its resize control sits on the frame’s bottom-right corner',
  { tag: '@parity:selected-shape-frames-its-rect-for-resize' },
  async ({ page }) => {
    await page.goto(resizeControlStory);
    const region = page.getByRole('region', { name: 'Selected Shape' });
    const resource = region.getByRole('article', { name: 'Strategies' });
    await expect(resource).toBeVisible({ timeout: 20_000 });
    await expect(resource).toHaveAttribute('data-resource-shape', 'diamond');

    const frame = region.locator('.rf-resource-node__resize-frame');
    await expect(frame).toHaveCount(1);
    await expect(frame).toHaveCSS('border-top-width', '1px');
    const node = await region.locator('.react-flow__node').boundingBox();
    const frameBox = await frame.boundingBox();
    const mark = await region.locator('.rf-resource-node__resize-mark').boundingBox();
    if (node === null || frameBox === null || mark === null)
      throw new Error('The selected Shape draws no frame, mark or node.');
    expect(frameBox).toEqual(node);
    expect(mark.x + mark.width - (frameBox.x + frameBox.width)).toBe(5);
    expect(mark.y + mark.height - (frameBox.y + frameBox.height)).toBe(5);
  },
);

test(
  'an active Resource resize does not animate its dimensions behind the pointer',
  { tag: '@parity:active-resource-resize-tracks-pointer-without-dimension-animation' },
  async ({ page }) => {
    await page.goto(resizeControlStory);
    const openRegion = page.getByRole('region', { name: 'Open Resource', exact: true });
    const resource = openRegion.getByRole('article', { name: 'Strategies' });
    const node = openRegion.locator('.react-flow__node');
    const control = openRegion.locator('.react-flow__resize-control');
    await expect(resource).toBeVisible({ timeout: 20_000 });
    await resource.hover();

    const box = await control.boundingBox();
    if (box === null) throw new Error('The Open resize control has no box.');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 45, box.y + box.height / 2 + 35, {
      steps: 2,
    });
    await expect(node.locator('.rf-resource-node__inner')).toHaveAttribute('data-resizing', 'true');

    const dimensionAnimationRunning = await node.evaluate((element) =>
      element.getAnimations().some((animation) => {
        if (!(animation instanceof CSSTransition) || animation.playState !== 'running') {
          return false;
        }
        return (
          animation.transitionProperty === 'width' || animation.transitionProperty === 'height'
        );
      }),
    );
    expect(dimensionAnimationRunning).toBe(false);
    await page.mouse.up();
  },
);

test('the open Resource rail offers its edit action before Close', async ({ page }) => {
  await open(page, markdownStory);
  const resource = page.getByRole('article', { name: 'Strategies' });
  const edit = resource.getByRole('button', { name: 'Edit Resource Strategies' });

  await resource.hover();
  await expect(edit).toBeVisible();
  const labels = await resource
    .getByTestId('canvas-resource-actions')
    .getByRole('button')
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')));
  expect(labels[0]).toBe('Edit Resource Strategies');
  await edit.focus();
  await edit.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Markdown source of Strategies' })).toBeFocused();
});

test('a selected Open Resource offers only Edit and Close, and its body begins the edit', async ({
  page,
}) => {
  await open(page, markdownStory);
  const resource = page.getByRole('article', { name: 'Strategies' });

  const labels = await resource
    .getByTestId('canvas-resource-actions')
    .getByRole('button')
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')));
  expect(labels).toEqual(['Edit Resource Strategies', 'Close Resource Strategies']);
  const bodyTarget = resource.getByRole('button', { name: 'Edit Markdown source of Strategies' });
  await expect(bodyTarget).toHaveCSS('opacity', '0');
  await expect(bodyTarget.locator('svg')).toHaveCount(0);
  await bodyTarget.click();
  await expect(page.getByRole('textbox', { name: 'Markdown source of Strategies' })).toBeFocused();
});

test('the rail replaces its Edit action with the two ends of a running edit', async ({ page }) => {
  await open(page, markdownStory);
  const resource = page.getByRole('article', { name: 'Strategies' });
  const actions = resource.getByTestId('canvas-resource-actions');
  await page.getByRole('button', { name: 'Edit Resource Strategies' }).click();
  await expect(page.getByRole('textbox', { name: 'Markdown source of Strategies' })).toBeFocused();

  expect(
    await actions
      .getByRole('button')
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label'))),
  ).toEqual([
    'Save Resource Strategies',
    'Cancel editing Resource Strategies',
    'Close Resource Strategies',
  ]);
  await expect(resource.getByRole('button', { name: 'Edit Resource Strategies' })).toHaveCount(0);
  // Closing mid-edit would drop the Resource's box out from under a live caret, so
  // the control keeps its slot and says it is unavailable.
  await expect(resource.getByRole('button', { name: 'Close Resource Strategies' })).toBeDisabled();
  // Three controls, one treatment: a commit control with its own box or its own
  // type would read as a different kind of control to the Close button beside it.
  const boxes = await actions.getByRole('button').evaluateAll((buttons) =>
    buttons.map((button) => {
      const style = getComputedStyle(button);
      return { width: style.width, height: style.height, border: style.borderTopWidth };
    }),
  );
  expect(boxes[0]).toEqual(boxes[2]);
  expect(boxes[1]).toEqual(boxes[2]);
  // The rail hides its actions at rest and reveals them with the Resource. A running
  // edit is not a hover, so the way out has to be up without one.
  await expect(actions).toHaveCSS('opacity', '1');
});

test('the rail is one toolbar: one tab stop, and its commands under the arrows', async ({
  page,
}) => {
  await open(page, markdownStory);
  const resource = page.getByRole('article', { name: 'Strategies' });
  const toolbar = resource.getByRole('toolbar', { name: 'Resource Strategies' });
  await expect(toolbar).toHaveAttribute('aria-orientation', 'horizontal');

  // One tab stop for the whole rail, whatever it carries. A canvas draws many
  // Resources and each rail carries several commands, so a stop apiece would put
  // the Resources themselves behind their own actions (ADR 0073).
  await resource.hover();
  const edit = resource.getByRole('button', { name: 'Edit Resource Strategies' });
  const close = resource.getByRole('button', { name: 'Close Resource Strategies' });
  expect(
    await toolbar
      .getByRole('button')
      .evaluateAll((buttons) => buttons.filter((button) => button.tabIndex === 0).length),
  ).toBe(1);

  await edit.focus();
  await edit.press('ArrowRight');
  await expect(close).toBeFocused();
  await close.press('ArrowLeft');
  await expect(edit).toBeFocused();
});

test('an unavailable rail command keeps its place under the arrows', async ({ page }) => {
  await open(page, markdownStory);
  const resource = page.getByRole('article', { name: 'Strategies' });
  await page.getByRole('button', { name: 'Edit Resource Strategies' }).click();
  await expect(page.getByRole('textbox', { name: 'Markdown source of Strategies' })).toBeFocused();

  const save = resource.getByRole('button', { name: 'Save Resource Strategies' });
  const cancel = resource.getByRole('button', { name: 'Cancel editing Resource Strategies' });
  const close = resource.getByRole('button', { name: 'Close Resource Strategies' });

  // Unavailable through `aria-disabled`, so it is still there to arrow to. The
  // native property would draw the control and take it off the keyboard, making
  // ADR 0064's "keeps its slot" a promise to the eye only.
  await expect(close).toHaveAttribute('aria-disabled', 'true');

  // **And it says so, which is the half an attribute assertion cannot make.**
  // `disabled:` utilities never match a toolbar item, so without its own rule an
  // unavailable command draws at full ink and still takes the hover fill —
  // operable to the eye and inert to the press. Both are read here: quieter than the command beside it,
  // and unmoved by a pointer that cannot use it (`Button.tsx`).
  const ink = (locator: typeof close) =>
    locator.evaluate((element) => {
      const style = getComputedStyle(element);
      return { opacity: style.opacity, background: style.backgroundColor, cursor: style.cursor };
    });
  const unavailable = await ink(close);
  expect(Number(unavailable.opacity)).toBeLessThan(Number((await ink(cancel)).opacity));
  expect(unavailable.cursor).toBe('not-allowed');
  await close.hover();
  expect((await ink(close)).background).toBe(unavailable.background);
  await save.focus();
  await save.press('ArrowRight');
  await expect(cancel).toBeFocused();
  await cancel.press('ArrowRight');
  await expect(close).toBeFocused();

  // Reachable is not runnable: the Resource must not collapse out from under the
  // caret and the draft it is holding.
  await close.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Markdown source of Strategies' })).toBeVisible();
});

/**
 * An Open Resource hides its redundant kind glyph while its commands stay live
 * during an Edit. This story mounts `PluginResource` without React Flow, so its
 * toolbar is drawn inline in the rail band rather than in a `NodeToolbar`, and is
 * drawn whether or not the pointer is on the Resource.
 */
test('an Open Resource running an edit keeps its commands drawn, however it is left', async ({
  page,
}) => {
  await open(page, markdownStory);
  const resource = page.getByRole('article', { name: 'Strategies' });
  const commands = resource.getByTestId('canvas-resource-actions');

  await page.mouse.move(0, 0);
  await expect(resource.locator('.resource-rail__kind')).toHaveCount(0);
  await expect(commands).toBeVisible();

  await page.getByRole('button', { name: 'Edit Resource Strategies' }).click();
  await expect(page.getByRole('textbox', { name: 'Markdown source of Strategies' })).toBeFocused();
  // Nothing is hovering the Resource and the caret is in its body, so the Edit
  // itself must keep Save, Cancel and Close visible.
  await page.mouse.move(0, 0);
  for (const name of [
    'Save Resource Strategies',
    'Cancel editing Resource Strategies',
    'Close Resource Strategies',
  ]) {
    await expect(commands.getByRole('button', { name, exact: true })).toBeVisible();
  }

  await resource.getByRole('button', { name: 'Cancel editing Resource Strategies' }).click();
  await page.mouse.move(0, 0);
  await expect(returnedTo(page)).toBeFocused();
  await expect(commands).toBeVisible();
});

test(
  'the two ends are the only way out, and a press on one keeps the caret',
  {
    tag: '@parity:open-markdown-resource-owns-its-editing-lifecycle',
  },
  async ({ page }) => {
    await open(page, markdownStory);
    const resource = page.getByRole('article', { name: 'Strategies' });
    const editor = page.getByRole('textbox', { name: 'Markdown source of Strategies' });

    await page.getByRole('button', { name: 'Edit Resource Strategies' }).click();
    await editor.pressSequentially('Abandoned. ');
    // Clicking away is not an exit: the draft is still there and the editor is
    // still up. Four exits and no more — two keys and the two controls.
    await page.getByRole('heading', { name: 'Strategies', exact: true }).click();
    await expect(editor).toHaveCount(1);
    await expect(editor).toContainText('Abandoned.');

    await resource.getByRole('button', { name: 'Cancel editing Resource Strategies' }).click();
    await expect(editor).toHaveCount(0);
    await expect(resource).not.toContainText('Abandoned.');
    await expect(returnedTo(page)).toBeFocused();

    await resource.getByRole('button', { name: 'Edit Resource Strategies' }).click();
    await editor.pressSequentially('Kept. ');
    await resource.getByRole('button', { name: 'Save Resource Strategies' }).click();
    await expect(editor).toHaveCount(0);
    await expect(resource).toContainText('Kept.');
    await expect(returnedTo(page)).toBeFocused();

    await resource.getByRole('button', { name: 'Edit Resource Strategies' }).click();
    await editor.press('Escape');
    await expect(returnedTo(page)).toBeFocused();

    await resource.getByRole('button', { name: 'Edit Resource Strategies' }).click();
    await editor.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
    await expect(returnedTo(page)).toBeFocused();
  },
);

test('the body editor shows its shortcut hint only with actual focus', async ({ page }) => {
  await open(page, markdownStory);
  await page.getByRole('button', { name: 'Edit Resource Strategies' }).click();
  const editor = page.getByRole('textbox', { name: 'Markdown source of Strategies' });
  // Located by its own element, not its copy: the keys are drawn by the shared
  // `Kbd` primitive, so the hint is several nodes and the text between them is
  // the design system's to change.
  const hint = page.locator('.markdown-resource-body__shortcut-hint');
  const pairs = hint.locator('.markdown-resource-body__shortcut');
  await expect(pairs).toHaveCount(2);
  await expect(pairs.first()).toContainText('Save');
  await expect(pairs.last()).toContainText('Cancel');
  await expect(editor).toBeFocused();
  await expect(hint).toHaveCSS('opacity', '1');
  // A row of its own under the editor, never over the author's first line.
  const firstLine = await editor.locator('.cm-line').first().boundingBox();
  const hintBox = await hint.boundingBox();
  if (firstLine === null || hintBox === null) throw new Error('missing line or hint');
  expect(hintBox.y).toBeGreaterThanOrEqual(firstLine.y + firstLine.height);
  const caps = hint.locator('[data-slot="kbd"]');
  await expect(caps).toHaveCount(3);
  // A cap is an object, not set-back type: it is outlined, and outlined only —
  // no fill on the cap and no panel behind the line, both of which read as grey
  // boxes floated over the document rather than as keys named beside it.
  const drawn = await hint.evaluate((element) => {
    const cap = element.querySelector('[data-slot="kbd"]');
    if (cap === null) throw new Error('missing key cap');
    return {
      capBorder: getComputedStyle(cap).borderTopWidth,
      capFill: getComputedStyle(cap).backgroundColor,
      panel: getComputedStyle(element).backgroundColor,
    };
  });
  expect(Number.parseFloat(drawn.capBorder)).toBeGreaterThan(0);
  expect(drawn.capFill).toBe('rgba(0, 0, 0, 0)');
  expect(drawn.panel).toBe('rgba(0, 0, 0, 0)');

  // Each key is drawn as a cap — its own bordered, filled box — rather than as
  // glyphs set into the muted line, which is what made this legible. And the
  // grouping is a gap rule: a cap sits close to its own word, the two pairs
  // further apart, so the line reads as two elements rather than one run.
  const gaps = await hint.evaluate((element) => {
    const pair = element.querySelector('.markdown-resource-body__shortcut');
    if (pair === null) throw new Error('missing shortcut pair');
    return {
      betweenPairs: getComputedStyle(element).columnGap,
      withinPair: getComputedStyle(pair).columnGap,
    };
  });
  expect(Number.parseFloat(gaps.betweenPairs)).toBeGreaterThan(Number.parseFloat(gaps.withinPair));

  // The edit is still running with the caret elsewhere: the hint goes.
  const cancel = page.getByRole('button', { name: 'Cancel editing Resource Strategies' });
  await cancel.focus();
  await expect(hint).toHaveCSS('opacity', '0');
  await cancel.click();
  await expect(page.getByRole('heading', { name: 'Placement is authored' })).toBeVisible();
});

test('rendered and source modes keep one content column', async ({ page }) => {
  await open(page, markdownStory);
  const renderedBox = await page
    .getByRole('heading', { name: 'Placement is authored' })
    .boundingBox();
  await page.getByRole('button', { name: 'Edit Resource Strategies' }).click();
  const firstLine = page.locator('.cm-line').first();
  await expect(firstLine).toBeVisible();
  const sourceBox = await firstLine.boundingBox();
  expect(sourceBox?.x).toBeCloseTo(renderedBox?.x ?? 0, 0);
  expect(sourceBox?.y).toBeCloseTo(renderedBox?.y ?? 0, 0);
});

test(
  'Open and Close keep the Resource selected and its toolbar drawn, by pointer or keyboard',
  { tag: '@parity:resource-toolbar-survives-open-and-close' },
  async ({ page }) => {
    await open(page, openCloseStory);
    const resource = page
      .getByRole('region', { name: 'Interactive Resource' })
      .locator('.react-flow__node');
    await selectResource(resource);
    const toolbar = await resourceToolbar(page, resource);
    const actions = toolbar.getByTestId('canvas-resource-actions');
    for (const operation of ['Open', 'Close']) {
      await toolbar
        .getByRole('button', { name: `${operation} Resource Strategies`, exact: true })
        .click();
      // Moving the pointer away changes nothing: hover reveals no command.
      await page.mouse.move(1, 1);
      await expect(resource).toHaveClass(/\bselected\b/);
      await expect(actions).toBeVisible();
    }
    // Keyboard activation operates the same toolbar and keeps focus on the
    // command across both transitions.
    const openControl = toolbar.getByRole('button', {
      name: 'Open Resource Strategies',
      exact: true,
    });
    await openControl.focus();
    await openControl.press('Enter');
    const close = toolbar.getByRole('button', { name: 'Close Resource Strategies', exact: true });
    await expect(close).toBeFocused();
    await expect(resource).toHaveClass(/\bselected\b/);
    await expect(actions).toBeVisible();
    await close.press('Enter');
    await expect(openControl).toBeFocused();
    await expect(resource).toHaveClass(/\bselected\b/);
    await expect(actions).toBeVisible();
  },
);

test(
  'at rest a Resource draws no toolbar; selected, its commands are drawn with Open last, and its kind glyph stays at its top-right corner',
  { tag: '@parity:resource-toolbar-draws-on-selection-with-open-last' },
  async ({ page }) => {
    await open(page, openCloseStory);
    const resource = page
      .getByRole('region', { name: 'Interactive Resource' })
      .locator('.react-flow__node');
    const toolbar = await resourceToolbar(page, resource);
    const glyph = resource.getByRole('img', { name: 'Markdown Resource', exact: true });

    await page.mouse.move(1, 1);
    await expect(toolbar).toHaveCount(0);
    await expect(glyph).toBeVisible();
    // Hover reveals no command either.
    await resource.hover({ position: { x: 10, y: 10 } });
    await expect(toolbar).toHaveCount(0);

    await selectResource(resource);
    const commands = toolbar.getByTestId('canvas-resource-actions');
    await expect(commands).toBeVisible();
    const labels = await commands
      .getByRole('button')
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')));
    expect(labels.at(-1)).toBe('Open Resource Strategies');
    await expect(commands.getByRole('img', { name: 'Markdown Resource' })).toHaveCount(0);

    // The glyph is the Resource's own, in the top-right quarter of its face.
    const face = await resource.locator('.canvas-resource').boundingBox();
    const mark = await glyph.boundingBox();
    if (face === null || mark === null) throw new Error('Resource geometry unavailable');
    expect(mark.x).toBeGreaterThan(face.x + face.width / 2);
    expect(mark.x + mark.width).toBeLessThanOrEqual(face.x + face.width);
    expect(mark.y).toBeGreaterThanOrEqual(face.y);
    expect(mark.y + mark.height).toBeLessThan(face.y + face.height / 2);
  },
);

const imageStory = '/?story=components--resource--image-resource&mode=preview';

/** The picture's box and the region the host gives its plugin, in screen pixels. */
const boxesOf = async (section: Locator, title: string) => {
  const node = section.locator('.canvas-resource__plugin');
  const picture = section.getByRole('img', { name: title });
  await expectPictureLoaded(picture, HARBOUR_SIZE.width);
  return {
    node: await node.boundingBox(),
    picture: await picture.boundingBox(),
    pictureElement: picture,
  };
};

/**
 * An Image Resource is its picture (ADR 0142): drawn over the whole region its
 * host gives it inside its rect, fitted
 * whole by `object-fit: contain` and never cropped, at any size, named by its
 * Title and with no drawn Title. At rest the canvas strokes no border; selected,
 * it strokes its border and ring.
 */
test(
  'an Image Resource draws its picture whole into its rect, bare at rest and bordered when selected',
  { tag: '@parity:image-resource-draws-its-picture-bare' },
  async ({ page }) => {
    await page.goto(imageStory);
    for (const [region, title] of [
      ['At rest', 'Harbour'],
      ['Selected', 'Harbour, selected'],
      ['Wider', 'Harbour, wider'],
    ] as const) {
      const section = page.getByRole('region', { name: region, exact: true });
      const { node, picture, pictureElement } = await boxesOf(section, title);
      await expect(pictureElement).toHaveCSS('object-fit', 'contain');
      expect(picture?.width).toBeCloseTo(node?.width ?? 0, 0);
      expect(picture?.height).toBeCloseTo(node?.height ?? 0, 0);
      await expect(section.getByRole('heading')).toHaveCount(0);
    }

    const rest = page.getByRole('region', { name: 'At rest', exact: true }).getByRole('article');
    await expect(rest).toHaveAttribute('data-bare', 'true');
    await expect(rest).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
    const selected = page
      .getByRole('region', { name: 'Selected', exact: true })
      .getByRole('article');
    await expect(selected).toHaveAttribute('data-bare', 'false');
    await expect(selected).not.toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
  },
);

/** A picture that will not load names its URL in the Resource's rect (ADR 0106). */
test(
  'an Image Resource whose picture does not load names its URL',
  { tag: '@parity:image-resource-shows-failed-state' },
  async ({ page }) => {
    await page.goto(imageStory);
    const resource = page
      .getByRole('region', { name: 'Failed image' })
      .getByRole('article', { name: 'Missing' });
    await expect(resource.getByText('Image did not load')).toBeVisible();
    await expect(
      resource.getByText('/assets/MISSINGpictureMISSINGpictureMISSINGpicture0'),
    ).toBeVisible();
    await expect(resource.getByRole('img', { name: 'Missing' })).toHaveCount(0);
  },
);

const openImageReferenceStory =
  '/?story=components--resource--open-image-reference-resource&mode=preview';
const IMAGE_REFERENCE_HARBOUR_URL = 'https://example.com/harbour.png';
const IMAGE_REFERENCE_MISSING_URL = 'https://missing.invalid/picture.png';

/**
 * A Reference Resource to an Image Resource is its Target's picture, read-only
 * (ADR 0070, ADR 0106, ADR 0142): named by its own Title, which its rail
 * renames, the picture at its own size in a Resource sized to it, Close and no
 * Replace, and no Replace in the failed-image state either. The story's Space
 * holds the Image Resource Targets, and this test serves Harbour's picture.
 */
test(
  "an Open Reference Resource draws its Image Resource Target's picture read-only",
  { tag: '@parity:open-reference-draws-target-image-read-only' },
  async ({ page }) => {
    await page.route(IMAGE_REFERENCE_HARBOUR_URL, (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: HARBOUR }),
    );
    await page.goto(openImageReferenceStory);
    const loaded = page.getByRole('region', { name: 'Image Target', exact: true });
    const resource = loaded.getByRole('article', { name: 'Harbour, again' });
    await expect(resource).toHaveAttribute('data-kind', 'reference');
    const picture = resource.getByRole('img', { name: 'Harbour, again' });
    await expect(picture).toHaveAttribute('src', IMAGE_REFERENCE_HARBOUR_URL);
    await expectPictureLoaded(picture, HARBOUR_SIZE.width);
    await expect(resource.locator('img')).toHaveCount(1);
    // The picture is named by the Reference's Title, so no Title is drawn over it.
    await expect(resource.getByRole('heading')).toHaveCount(0);
    // Fitted whole into the room the Reference gives it, never cropped.
    await expect(picture).toHaveCSS('object-fit', 'contain');
    const pictureBox = await picture.boundingBox();
    const resourceBox = await resource.boundingBox();
    if (pictureBox === null || resourceBox === null) throw new Error('The picture drew no box');
    expect(pictureBox.width).toBeGreaterThan(resourceBox.width - 16);
    expect(pictureBox.width).toBeLessThanOrEqual(resourceBox.width);
    expect(pictureBox.height).toBeLessThanOrEqual(resourceBox.height);

    const node = loaded.locator('.react-flow__node');
    await selectResource(node);
    const toolbar = await resourceToolbar(page, node);
    await expect(
      toolbar.getByRole('button', { name: 'Close Resource Harbour, again' }),
    ).toBeVisible();
    await expect(toolbar.getByRole('button', { name: /^Replace image of Resource/ })).toHaveCount(
      0,
    );
    await expect(toolbar.getByRole('button', { name: /^Edit Resource/ })).toHaveCount(0);
    // The rename on the rail is the Reference's own, passed with its Title.
    await expect(
      toolbar.getByRole('button', { name: 'Rename Resource Harbour, again' }),
    ).toBeVisible();

    const failed = page
      .getByRole('region', { name: 'Failed image Target' })
      .getByRole('article', { name: 'Missing, again' });
    await expect(failed.getByText('Image did not load')).toBeVisible();
    await expect(failed.getByText(IMAGE_REFERENCE_MISSING_URL)).toBeVisible();
    await expect(failed.getByRole('heading')).toHaveCount(0);
    await expect(failed.getByRole('button', { name: /Replace/ })).toHaveCount(0);
  },
);

/**
 * Until a picture arrives, the content area draws a skeleton in its place, a
 * status named Loading image, and the picture replaces it. A Reference Resource to an
 * Image Resource draws through the same picture as the Target's own content,
 * and this story's picture is one the test can hold back and then let through.
 */
test(
  'an Open Image Resource draws a skeleton until its picture loads',
  { tag: '@parity:open-image-resource-shows-skeleton-while-loading' },
  async ({ page }) => {
    const { promise: held, resolve: release } = Promise.withResolvers<null>();
    await page.route(IMAGE_REFERENCE_HARBOUR_URL, async (route) => {
      await held;
      await route.fulfill({ status: 200, contentType: 'image/png', body: HARBOUR });
    });
    await page.goto(openImageReferenceStory);
    const resource = page
      .getByRole('region', { name: 'Image Target', exact: true })
      .getByRole('article', { name: 'Harbour, again' });
    const skeleton = resource.getByRole('status', { name: 'Loading image' });
    await expect(skeleton).toBeVisible();
    // The picture is laid out but drawn transparent until it loads.
    await expect(resource.getByRole('img', { name: 'Harbour, again' })).toHaveCSS('opacity', '0');

    release(null);
    await expectPictureLoaded(
      resource.getByRole('img', { name: 'Harbour, again' }),
      HARBOUR_SIZE.width,
    );
    await expect(skeleton).toHaveCount(0);
  },
);
