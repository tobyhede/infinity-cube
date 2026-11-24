import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StartPage } from '../src/components/StartPage';
import type {
  NewSpaceDefaults,
  NotCreated,
  RecentSpace,
  StartShell,
} from '../src/components/start-shell';

const DOCUMENTS: NewSpaceDefaults = {
  location: '/home/ada/Documents',
  name: 'Untitled Space',
  separator: '/',
};

/** What the page asked the shell, in order. */
type Asked =
  | { readonly kind: 'create'; readonly location: string; readonly name: string }
  | { readonly kind: 'browse'; readonly location: string }
  | { readonly kind: 'open-folder' }
  | { readonly kind: 'open-recent'; readonly folder: string }
  | { readonly kind: 'close' };

/** A shell that answers as told and records what it was asked. */
function fakeShell(
  options: {
    readonly recents?: readonly RecentSpace[];
    readonly defaults?: NewSpaceDefaults;
    readonly create?: (location: string, name: string) => NotCreated | null;
    readonly browse?: NewSpaceDefaults | null;
  } = {},
) {
  const asked: Asked[] = [];
  let finishCreate: ((answer: NotCreated | null) => void) | undefined;
  const shell: StartShell = {
    view: () =>
      Promise.resolve({
        recents: options.recents ?? [],
        newSpace: options.defaults ?? DOCUMENTS,
      }),
    browse: (location) => {
      asked.push({ kind: 'browse', location });
      return Promise.resolve(options.browse ?? null);
    },
    createSpace: (location, name) => {
      asked.push({ kind: 'create', location, name });
      if (options.create !== undefined) return Promise.resolve(options.create(location, name));
      return new Promise((resolve) => {
        finishCreate = resolve;
      });
    },
    openFolder: () => asked.push({ kind: 'open-folder' }),
    openRecent: (folder) => asked.push({ kind: 'open-recent', folder }),
    close: () => asked.push({ kind: 'close' }),
  };
  return { shell, asked, finishCreate: (answer: NotCreated | null) => finishCreate?.(answer) };
}

const nameField = () => screen.getByRole('textbox', { name: 'Name' });
const locationField = () => screen.getByRole('textbox', { name: 'Location' });
const createButton = () => screen.getByRole('button', { name: 'Create Space' });

afterEach(() => {
  window.history.replaceState(null, '', '/start.html');
});

describe('the Start window', () => {
  it('offers New Space and Open Folder…, and says Recent is empty when nothing is kept', async () => {
    render(<StartPage shell={fakeShell().shell} />);

    expect(await screen.findByRole('button', { name: 'New Space' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open Folder…' })).toBeTruthy();
    const recent = screen.getByRole('region', { name: 'Recent Spaces' });
    expect(within(recent).getByText('No recent Spaces yet')).toBeTruthy();
    expect(within(recent).queryByRole('list')).toBeNull();
  });

  it('lists each recent Space by Title over folder, and opens one when it is chosen', async () => {
    const { shell, asked } = fakeShell({
      recents: [
        { title: 'Quarterly review', folder: '/home/ada/Documents/Quarterly review' },
        { title: 'Keynote', folder: '/home/ada/Keynote', open: true },
      ],
    });
    render(<StartPage shell={shell} />);

    const list = await screen.findByRole('list');
    expect(list.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(list.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Select a Space to open it',
    );
    fireEvent.click(within(list).getByRole('button', { name: /Quarterly review/u }));
    expect(
      within(list).getByRole('button', { name: 'Keynote, already open. Show its window' }),
    ).toBeTruthy();

    expect(asked).toEqual([
      { kind: 'open-recent', folder: '/home/ada/Documents/Quarterly review' },
    ]);
  });

  it('names Try again and Remove for an entry that did not open by their visible text', async () => {
    render(
      <StartPage
        shell={
          fakeShell({
            recents: [
              {
                title: 'Design tour',
                folder: '/home/ada/tour',
                problem: { kind: 'failed', reason: 'One of its files could not be read.' },
              },
            ],
          }).shell
        }
      />,
    );

    const retry = await screen.findByRole('button', { name: /^Try again/u });
    expect(retry.textContent).toBe('Try again');
    expect(screen.getByText('One of its files could not be read.')).toBeTruthy();
  });

  it('asks the shell for its folder chooser from Open Folder…', async () => {
    const { shell, asked } = fakeShell();
    render(<StartPage shell={shell} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Open Folder…' }));

    expect(asked).toEqual([{ kind: 'open-folder' }]);
  });
});

describe('New Space', () => {
  async function openForm(shell: StartShell): Promise<void> {
    render(<StartPage shell={shell} />);
    fireEvent.click(await screen.findByRole('button', { name: 'New Space' }));
    await screen.findByRole('form', { name: 'New Space' });
  }

  it('starts with the defaults, the name focused, and names the folder Create Space makes', async () => {
    await openForm(fakeShell().shell);

    expect(nameField()).toHaveProperty('value', 'Untitled Space');
    expect(document.activeElement).toBe(nameField());
    expect(locationField()).toHaveProperty('value', '/home/ada/Documents');
    expect(locationField()).toHaveProperty('readOnly', true);
    expect(screen.getByText('/home/ada/Documents/Untitled Space')).toBeTruthy();
  });

  it('shows one status naming the Space while it is written and opened', async () => {
    const { shell, asked } = fakeShell();
    await openForm(shell);

    fireEvent.click(createButton());

    expect(asked).toEqual([
      { kind: 'create', location: '/home/ada/Documents', name: 'Untitled Space' },
    ]);
    const status = await screen.findByRole('status');
    expect(status.textContent).toContain('Opening Untitled Space…');
    expect(screen.queryByRole('form')).toBeNull();
  });

  it('refuses a name beside the field, keeping the draft, and asks for a name in the folder line', async () => {
    await openForm(
      fakeShell({
        create: () => ({ of: 'name', message: 'A name is one folder name.' }),
      }).shell,
    );

    fireEvent.change(nameField(), { target: { value: 'Q3/Q4' } });
    fireEvent.click(createButton());

    const reason = await screen.findByText('A name is one folder name.');
    expect(nameField()).toHaveProperty('value', 'Q3/Q4');
    expect(nameField().getAttribute('aria-invalid')).toBe('true');
    expect(nameField().getAttribute('aria-describedby')).toContain(reason.id);
    expect(screen.getByText('Choose a name to see the folder it creates.')).toBeTruthy();

    fireEvent.change(nameField(), { target: { value: 'Q3 review' } });
    expect(screen.queryByText('A name is one folder name.')).toBeNull();
    expect(nameField().getAttribute('aria-invalid')).toBe('false');
  });

  it('refuses a folder that holds something beside the name, still naming the folder', async () => {
    await openForm(
      fakeShell({
        create: () => ({ of: 'folder', message: 'That folder is not empty.' }),
      }).shell,
    );

    fireEvent.click(createButton());

    expect(await screen.findByText('That folder is not empty.')).toBeTruthy();
    expect(screen.getByText('/home/ada/Documents/Untitled Space')).toBeTruthy();
  });

  it('announces a write that failed and returns to the form with the name and Location kept', async () => {
    const { shell, finishCreate } = fakeShell({
      browse: { location: '/srv/decks', name: 'Untitled Space', separator: '/' },
    });
    await openForm(shell);
    fireEvent.click(screen.getByRole('button', { name: 'Browse…' }));
    await waitFor(() => expect(locationField()).toHaveProperty('value', '/srv/decks'));
    fireEvent.change(nameField(), { target: { value: 'Board deck' } });

    fireEvent.click(createButton());
    await screen.findByRole('status');
    act(() => finishCreate({ of: 'failed', message: 'Could not create a Space: disk full' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Could not create a Space: disk full');
    expect(nameField()).toHaveProperty('value', 'Board deck');
    expect(locationField()).toHaveProperty('value', '/srv/decks');
    expect(createButton()).toBeTruthy();
  });

  it('takes the defaults of a Location chosen with Browse…, keeping a name already typed', async () => {
    const { shell, asked } = fakeShell({
      browse: { location: '/srv/decks', name: 'Untitled Space 2', separator: '/' },
    });
    await openForm(shell);

    fireEvent.click(screen.getByRole('button', { name: 'Browse…' }));
    await waitFor(() => expect(nameField()).toHaveProperty('value', 'Untitled Space 2'));
    expect(asked).toEqual([{ kind: 'browse', location: '/home/ada/Documents' }]);

    fireEvent.change(nameField(), { target: { value: 'Mine' } });
    fireEvent.click(screen.getByRole('button', { name: 'Browse…' }));
    await waitFor(() => expect(asked).toHaveLength(2));
    expect(nameField()).toHaveProperty('value', 'Mine');
  });

  it('returns to the start screen on Cancel or Escape', async () => {
    await openForm(fakeShell().shell);

    fireEvent.keyDown(nameField(), { key: 'Escape' });
    expect(await screen.findByRole('button', { name: 'New Space' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'New Space' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('button', { name: 'New Space' })).toBeTruthy();
  });

  it('opens on the form File › New Space… asks for, where Cancel closes the window', async () => {
    window.history.replaceState(null, '', '/start.html#new-space');
    const { shell, asked } = fakeShell();
    render(<StartPage shell={shell} />);

    await screen.findByRole('form', { name: 'New Space' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(asked).toEqual([{ kind: 'close' }]);
  });

  it('moves to the form when the shell asks for it while the start screen shows', async () => {
    render(<StartPage shell={fakeShell().shell} />);
    await screen.findByRole('button', { name: 'New Space' });

    act(() => {
      window.location.hash = 'new-space';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(await screen.findByRole('form', { name: 'New Space' })).toBeTruthy();
  });
});
