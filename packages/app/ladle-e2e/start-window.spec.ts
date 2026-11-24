import { expect, test, type Locator, type Page } from '@playwright/test';

const story = (name: string): string => `/?story=components--start-window--${name}&mode=preview`;

// The size the shell opens the Start window at (`start.rs`), so the page's
// full-height layout measures as it does there and "Create Space in view"
// means in view in that window.
test.use({ viewport: { width: 720, height: 520 } });

test(
  'New Space opens on the defaults and shows one status while the Space opens',
  { tag: '@parity:start-window-makes-a-new-space-from-the-defaults' },
  async ({ page }) => {
    await page.goto(story('first-launch'));
    await expect(page.getByText('No recent Spaces yet')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open Folder…' })).toBeVisible();

    await page.getByRole('button', { name: 'New Space' }).click();
    const name = page.getByRole('textbox', { name: 'Name' });
    await expect(name).toBeFocused();
    await expect(name).toHaveValue('Untitled Space');
    await expect(page.getByRole('textbox', { name: 'Location' })).toHaveAttribute('readonly', '');
    await expect(page.getByText('/Users/ada/Documents/Untitled Space')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'New Space' })).toBeVisible();

    await page.getByRole('button', { name: 'New Space' }).click();
    await page.getByRole('button', { name: 'Create Space' }).click();
    await expect(page.getByRole('status')).toHaveText('Opening Untitled Space…');
    await expect(page.getByRole('form', { name: 'New Space' })).toHaveCount(0);
  },
);

test(
  'a name that is not one folder name is refused beside the field',
  { tag: '@parity:start-window-refuses-a-name-beside-the-field' },
  async ({ page }) => {
    await page.goto(story('first-launch'));
    await page.getByRole('button', { name: 'New Space' }).click();
    const name = page.getByRole('textbox', { name: 'Name' });

    await name.fill('Q3/Q4');
    await page.getByRole('button', { name: 'Create Space' }).click();

    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(name).toHaveAccessibleDescription(
      /A name can’t hold “\/”, because it separates folders\. Try a dash instead\./u,
    );
    await expect(name).toHaveValue('Q3/Q4');
    await expect(page.getByText('Choose a name to see the folder it creates.')).toBeVisible();

    await name.fill('Q3 review');
    await expect(name).toHaveAttribute('aria-invalid', 'false');
    await expect(page.getByText('/Users/ada/Documents/Q3 review')).toBeVisible();
  },
);

test(
  'a failed write is a notice whose Details open by keyboard, and the form keeps the name and Location',
  { tag: '@parity:start-window-keeps-the-form-when-the-write-fails' },
  async ({ page }) => {
    await page.goto(story('first-launch'));
    await page.getByRole('button', { name: 'New Space' }).click();
    await page.getByRole('button', { name: 'Browse…' }).click();
    const location = page.getByRole('textbox', { name: 'Location' });
    await expect(location).toHaveValue('/Users/ada/Desktop');
    await page.getByRole('textbox', { name: 'Name' }).fill('Disk full');

    await page.getByRole('button', { name: 'Create Space' }).click();

    const notice = page.getByRole('alert');
    await expect(notice).toHaveText(
      /The disk is full, so the Space wasn’t created\. Free up some space and try again\./u,
    );
    const detail = page.getByRole('region', { name: 'What the system said' });
    await expect(detail).toHaveCount(0);
    await notice.getByRole('button', { name: 'Details' }).focus();
    await page.keyboard.press('Enter');
    await detail.focus();
    await expect(detail).toBeFocused();
    await expect(detail).toContainText('No space left on device');
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Disk full');
    await expect(location).toHaveValue('/Users/ada/Desktop');
    await expect(page.getByRole('button', { name: 'Create Space' })).toBeInViewport();
  },
);

test(
  'a name that is not one folder name shows on Name',
  { tag: '@parity:start-window-shows-a-name-refusal-on-name' },
  async ({ page }) => {
    await page.goto(story('name-not-a-folder-name'));
    const name = page.getByRole('textbox', { name: 'Name' });
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(name).toHaveAccessibleDescription(
      /A name can’t hold “\/”, because it separates folders\. Try a dash instead\./u,
    );
    await expect(page.getByRole('button', { name: 'Details' })).toHaveCount(0);
  },
);

test(
  'a folder holding files shows on Name, naming the Location and the name',
  { tag: '@parity:start-window-shows-a-folder-with-files-on-name' },
  async ({ page }) => {
    await page.goto(story('name-folder-holds-files'));
    const name = page.getByRole('textbox', { name: 'Name' });
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(name).toHaveAccessibleDescription(
      /Documents already has a folder called “Untitled Space” with files in it\. Choose another name\./u,
    );
    await expect(page.getByRole('button', { name: 'Details' })).toHaveCount(0);
  },
);

/** A cause on Location: the field invalid and described by it, Browse… too and focused, Details closed. */
async function expectOnLocation(page: Page, sentence: RegExp, detail: string): Promise<void> {
  await expect(page.getByRole('button', { name: 'Browse…' })).toBeFocused();
  const location = page.getByRole('textbox', { name: 'Location' });
  await expect(location).toHaveAttribute('aria-invalid', 'true');
  await expect(location).toHaveAccessibleDescription(sentence);
  await expect(page.getByRole('button', { name: 'Browse…' })).toHaveAccessibleDescription(sentence);
  await expect(page.getByText(/Creates the folder/u)).toHaveCount(0);
  const details = page.getByRole('button', { name: 'Details' });
  await expect(details).toHaveAttribute('aria-expanded', 'false');
  await details.click();
  await expect(page.getByRole('region', { name: 'What the system said' })).toContainText(detail);
  await expect(page.getByRole('button', { name: 'Hide details' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create Space' })).toBeInViewport();
}

test(
  'no permission in the Location shows on Location',
  { tag: '@parity:start-window-shows-no-permission-on-location' },
  async ({ page }) => {
    await page.goto(story('location-no-permission'));
    await expectOnLocation(
      page,
      /You can’t create folders in Documents\. Choose another location\./u,
      'Permission denied (os error 13)',
    );
  },
);

test(
  'a read-only Location shows on Location',
  { tag: '@parity:start-window-shows-a-read-only-location-on-location' },
  async ({ page }) => {
    await page.goto(story('location-read-only'));
    await expectOnLocation(
      page,
      /Archive is read-only\. Choose another location\./u,
      'Read-only file system (os error 30)',
    );
  },
);

test(
  'a Location that is gone shows on Location',
  { tag: '@parity:start-window-shows-a-location-gone-on-location' },
  async ({ page }) => {
    await page.goto(story('location-gone'));
    await expectOnLocation(
      page,
      /Slides can’t be found\. It may have been moved, or its disk removed\. Choose another location\./u,
      'Not a directory (os error 20)',
    );
  },
);

/** A notice above the buttons, neither field invalid, Details closed until pressed. */
async function expectNotice(page: Page, sentence: RegExp, detail: string): Promise<Locator> {
  const notice = page.getByRole('alert');
  await expect(notice).toHaveText(sentence);
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveAttribute(
    'aria-invalid',
    'false',
  );
  await expect(page.getByRole('textbox', { name: 'Location' })).toHaveAttribute(
    'aria-invalid',
    'false',
  );
  await expect(page.getByRole('region', { name: 'What the system said' })).toHaveCount(0);
  await notice.getByRole('button', { name: 'Details' }).click();
  await expect(page.getByRole('region', { name: 'What the system said' })).toContainText(detail);
  await expect(page.getByRole('button', { name: 'Create Space' })).toBeInViewport();
  return notice;
}

test(
  'a full disk is a notice above the buttons',
  { tag: '@parity:start-window-shows-a-full-disk-as-a-notice' },
  async ({ page }) => {
    await page.goto(story('disk-full'));
    await expectNotice(
      page,
      /The disk is full, so the Space wasn’t created\. Free up some space and try again\./u,
      'No space left on device (os error 28)',
    );
  },
);

test(
  'a Space created and not opened is a notice offering Open Folder…',
  { tag: '@parity:start-window-offers-the-folder-of-a-space-not-opened' },
  async ({ page }) => {
    await page.goto(story('created-not-opened'));
    const notice = await expectNotice(
      page,
      /The Space was created but couldn’t be opened\./u,
      'the window could not be built',
    );
    await expect(notice.getByRole('button', { name: 'Open Folder…' })).toBeVisible();
  },
);

test(
  'anything else is a notice above the buttons',
  { tag: '@parity:start-window-shows-anything-else-as-a-notice' },
  async ({ page }) => {
    await page.goto(story('anything-else'));
    await expectNotice(
      page,
      /The Space couldn’t be created\. Try again, or choose another name or location\./u,
      'Input/output error (os error 5)',
    );
  },
);
