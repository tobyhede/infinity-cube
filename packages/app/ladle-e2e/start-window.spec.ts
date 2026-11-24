import { expect, test } from '@playwright/test';

const story = (name: string): string => `/?story=components--start-window--${name}&mode=preview`;

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
    await expect(name).toHaveAccessibleDescription(/A name is one folder name/u);
    await expect(name).toHaveValue('Q3/Q4');
    await expect(page.getByText('Choose a name to see the folder it creates.')).toBeVisible();

    await name.fill('Q3 review');
    await expect(name).toHaveAttribute('aria-invalid', 'false');
    await expect(page.getByText('/Users/ada/Documents/Q3 review')).toBeVisible();
  },
);

test(
  'a failed write is announced and the form keeps the name and Location',
  { tag: '@parity:start-window-keeps-the-form-when-the-write-fails' },
  async ({ page }) => {
    await page.goto(story('first-launch'));
    await page.getByRole('button', { name: 'New Space' }).click();
    await page.getByRole('button', { name: 'Browse…' }).click();
    const location = page.getByRole('textbox', { name: 'Location' });
    await expect(location).toHaveValue('/Users/ada/Desktop');
    await page.getByRole('textbox', { name: 'Name' }).fill('Disk full');

    await page.getByRole('button', { name: 'Create Space' }).click();

    await expect(page.getByRole('alert')).toContainText('The Space could not be created');
    const detail = page.getByRole('region', { name: 'Why the Space could not be created' });
    await detail.focus();
    await expect(detail).toBeFocused();
    await expect(detail).toContainText('No space left on device');
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Disk full');
    await expect(location).toHaveValue('/Users/ada/Desktop');
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  },
);
