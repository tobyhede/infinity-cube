import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StartPage } from '../src/components/StartPage';
import type { NewSpaceDefaults, NotCreated, RecentSpace, StartShell } from '../src/start-shell';

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
    /** Hold each answer to `view` until `answerView` gives it. */
    readonly holdViews?: boolean;
  } = {},
) {
  const asked: Asked[] = [];
  let finishCreate: ((answer: NotCreated | null) => void) | undefined;
  const view = { recents: options.recents ?? [], newSpace: options.defaults ?? DOCUMENTS };
  const heldViews: { readonly answer: () => void; readonly fail: () => void }[] = [];
  const shell: StartShell = {
    view: () =>
      options.holdViews === true
        ? new Promise((resolve, reject) => {
            heldViews.push({
              answer: () => resolve(view),
              fail: () => reject(new Error('The shell could not answer')),
            });
          })
        : Promise.resolve(view),
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
  return {
    shell,
    asked,
    finishCreate: (answer: NotCreated | null) => finishCreate?.(answer),
    /** Give the oldest held answer to `view`, or the newest. */
    answerView: async (which: 'oldest' | 'newest' = 'oldest') => {
      await act(async () => {
        (which === 'oldest' ? heldViews.shift() : heldViews.pop())?.answer();
        await Promise.resolve();
      });
    },
    /** Fail the oldest held request to `view`. */
    failView: async () => {
      await act(async () => {
        heldViews.shift()?.fail();
        await Promise.resolve();
      });
    },
  };
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
        create: () => ({ of: 'name', rule: 'not-a-folder-name' }),
      }).shell,
    );

    fireEvent.change(nameField(), { target: { value: 'Q3/Q4' } });
    fireEvent.click(createButton());

    const reason = await screen.findByText(/^A name is one folder name:/u);
    expect(nameField()).toHaveProperty('value', 'Q3/Q4');
    expect(nameField().getAttribute('aria-invalid')).toBe('true');
    expect(nameField().getAttribute('aria-describedby')).toContain(reason.id);
    expect(screen.getByText('Choose a name to see the folder it creates.')).toBeTruthy();

    fireEvent.change(nameField(), { target: { value: 'Q3 review' } });
    expect(screen.queryByText(/^A name is one folder name:/u)).toBeNull();
    expect(nameField().getAttribute('aria-invalid')).toBe('false');
  });

  it('refuses a folder that holds something on Name, naming the Location and the name, and asks for a name in the folder line', async () => {
    await openForm(fakeShell({ create: () => ({ of: 'folder' }) }).shell);

    fireEvent.click(createButton());

    const reason = await screen.findByText(
      'Documents already has a folder called Untitled Space with files in it. Choose another name.',
    );
    expect(nameField().getAttribute('aria-invalid')).toBe('true');
    expect(nameField().getAttribute('aria-describedby')).toContain(reason.id);
    expect(screen.getByText('Choose a name to see the folder it creates.')).toBeTruthy();
    expect(screen.queryByText(/Creates the folder/u)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Details' })).toBeNull();
  });

  it('shows a cause another Location fixes on Location, its system words behind a closed Details', async () => {
    const { shell, finishCreate } = fakeShell();
    await openForm(shell);
    fireEvent.change(nameField(), { target: { value: 'Board deck' } });

    fireEvent.click(createButton());
    await screen.findByRole('status');
    act(() =>
      finishCreate({ of: 'no-permission', detail: 'Permission denied (os error 13): /home/ada' }),
    );

    const reason = await screen.findByText(
      'You don’t have permission to create folders in Documents. Choose another Location.',
    );
    expect(locationField().getAttribute('aria-invalid')).toBe('true');
    expect(locationField().getAttribute('aria-describedby')).toContain(reason.id);
    expect(screen.getByRole('button', { name: 'Browse…' }).getAttribute('aria-describedby')).toBe(
      reason.id,
    );
    expect(nameField().getAttribute('aria-invalid')).toBe('false');
    expect(screen.queryByText(/Creates the folder/u)).toBeNull();
    expect(nameField()).toHaveProperty('value', 'Board deck');
    expect(createButton()).toBeTruthy();

    const details = screen.getByRole('button', { name: 'Details' });
    expect(details.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Permission denied (os error 13): /home/ada')).toBeNull();
    fireEvent.click(details);
    expect(await screen.findByText('Permission denied (os error 13): /home/ada')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hide details' }).getAttribute('aria-expanded')).toBe(
      'true',
    );
  });

  it('makes Browse… the default button after a cause on Location, so Enter chooses a Location rather than creating again', async () => {
    const { shell, asked } = fakeShell({
      create: () => ({ of: 'no-permission', detail: 'Permission denied (os error 13)' }),
    });
    await openForm(shell);
    fireEvent.click(createButton());
    await screen.findByText(/You don’t have permission/u);

    // Enter in a field activates the form's default button: its first submit
    // button in tree order (HTML's implicit submission).
    const form = screen.getByRole('form', { name: 'New Space' });
    const defaultButton = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(defaultButton?.textContent).toBe('Browse…');
    if (defaultButton !== null) fireEvent.click(defaultButton);

    await waitFor(() =>
      expect(asked.at(-1)).toEqual({ kind: 'browse', location: '/home/ada/Documents' }),
    );
    expect(asked.filter((each) => each.kind === 'create')).toHaveLength(1);
  });

  it('words each cause another Location fixes, naming the Location’s last folder', async () => {
    const cases: readonly [NotCreated, string][] = [
      [
        { of: 'read-only', detail: 'Read-only file system (os error 30)' },
        'Documents is read-only, so nothing can be created there. Choose another Location.',
      ],
      [
        { of: 'location-gone', detail: 'Not a directory (os error 20)' },
        'Documents can’t be found. It may have been moved, or its disk removed. Choose another Location.',
      ],
    ];
    for (const [answer, sentence] of cases) {
      const { unmount } = render(<StartPage shell={fakeShell({ create: () => answer }).shell} />);
      fireEvent.click(await screen.findByRole('button', { name: 'New Space' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Create Space' }));
      const reason = await screen.findByText(sentence);
      expect(locationField().getAttribute('aria-describedby')).toContain(reason.id);
      unmount();
    }
  });

  it('clears a Location cause when a new Location is chosen with Browse…, and a notice when the name changes', async () => {
    const answers: NotCreated[] = [
      { of: 'read-only', detail: 'Read-only file system (os error 30)' },
      { of: 'disk-full', detail: 'No space left on device (os error 28)', kept: false },
    ];
    await openForm(
      fakeShell({
        create: () => answers.shift() ?? null,
        browse: { location: '/srv/decks', name: 'Untitled Space', separator: '/' },
      }).shell,
    );

    fireEvent.click(createButton());
    await screen.findByText(/is read-only/u);
    fireEvent.click(screen.getByRole('button', { name: 'Browse…' }));
    await waitFor(() => expect(locationField()).toHaveProperty('value', '/srv/decks'));
    expect(screen.queryByText(/is read-only/u)).toBeNull();
    expect(locationField().getAttribute('aria-invalid')).toBe('false');

    fireEvent.click(createButton());
    await screen.findByText(/There isn’t enough space on the disk/u);
    fireEvent.change(nameField(), { target: { value: 'Smaller deck' } });
    expect(screen.queryByText(/There isn’t enough space on the disk/u)).toBeNull();
  });

  it('shows a failure no field fixes as a notice above the buttons, the form kept', async () => {
    const { shell, finishCreate } = fakeShell({
      browse: { location: '/srv/decks', name: 'Untitled Space', separator: '/' },
    });
    await openForm(shell);
    fireEvent.click(screen.getByRole('button', { name: 'Browse…' }));
    await waitFor(() => expect(locationField()).toHaveProperty('value', '/srv/decks'));
    fireEvent.change(nameField(), { target: { value: 'Board deck' } });

    fireEvent.click(createButton());
    await screen.findByRole('status');
    act(() =>
      finishCreate({
        of: 'disk-full',
        detail: 'No space left on device (os error 28)',
        kept: false,
      }),
    );

    const notice = await screen.findByRole('alert');
    expect(notice.textContent).toContain(
      'There isn’t enough space on the disk to create the Space. Nothing was kept.',
    );
    expect(nameField().getAttribute('aria-invalid')).toBe('false');
    expect(locationField().getAttribute('aria-invalid')).toBe('false');
    expect(within(notice).queryByText('No space left on device (os error 28)')).toBeNull();
    fireEvent.click(within(notice).getByRole('button', { name: 'Details' }));
    expect(await within(notice).findByText('No space left on device (os error 28)')).toBeTruthy();
    expect(nameField()).toHaveProperty('value', 'Board deck');
    expect(locationField()).toHaveProperty('value', '/srv/decks');
    expect(createButton()).toBeTruthy();
  });

  it('says anything else failed in a notice, and that part was left only when it was', async () => {
    await openForm(
      fakeShell({
        create: () => ({ of: 'failed', detail: 'Input/output error (os error 5)', kept: true }),
      }).shell,
    );

    fireEvent.click(createButton());

    const notice = await screen.findByRole('alert');
    expect(notice.textContent).toContain(
      'The Space couldn’t be created, and part of it was left in the folder Untitled Space. Choose another name or Location.',
    );
    expect(within(notice).getByRole('button', { name: 'Details' })).toBeTruthy();
  });

  it('offers to open the folder of a Space written and not opened', async () => {
    const { shell, asked } = fakeShell({
      create: () => ({
        of: 'not-opened',
        folder: '/home/ada/Documents/Untitled Space',
        detail: 'Could not open it',
      }),
    });
    await openForm(shell);

    fireEvent.click(createButton());

    const notice = await screen.findByRole('alert');
    expect(notice.textContent).toContain(
      'The Space was created but couldn’t be opened. Its folder is kept.',
    );
    fireEvent.click(within(notice).getByRole('button', { name: 'Open Folder…' }));
    expect(asked.at(-1)).toEqual({
      kind: 'open-recent',
      folder: '/home/ada/Documents/Untitled Space',
    });
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

  it('draws no form from a late answer once Cancel has returned to the start screen', async () => {
    const { shell, answerView } = fakeShell({ holdViews: true });
    render(<StartPage shell={shell} />);
    await answerView();
    const newSpace = await screen.findByRole('button', { name: 'New Space' });

    fireEvent.click(newSpace);
    fireEvent.click(newSpace);
    await answerView('newest');
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await answerView();

    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.getByRole('button', { name: 'New Space' })).toBeTruthy();
  });

  it('draws no form from a late answer once Create Space shows the opening status', async () => {
    const { shell, answerView } = fakeShell({ holdViews: true });
    render(<StartPage shell={shell} />);
    await answerView();
    const newSpace = await screen.findByRole('button', { name: 'New Space' });

    fireEvent.click(newSpace);
    fireEvent.click(newSpace);
    await answerView('newest');
    fireEvent.click(await screen.findByRole('button', { name: 'Create Space' }));
    await answerView();

    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Opening Untitled Space…');
  });

  it('shows no failure from a late refusal once Cancel has returned to the start screen', async () => {
    const { shell, answerView, failView } = fakeShell({ holdViews: true });
    render(<StartPage shell={shell} />);
    await answerView();
    const newSpace = await screen.findByRole('button', { name: 'New Space' });

    fireEvent.click(newSpace);
    fireEvent.click(newSpace);
    await answerView('newest');
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await failView();

    expect(screen.queryByText('The Start window could not load')).toBeNull();
    expect(screen.getByRole('button', { name: 'New Space' })).toBeTruthy();
  });

  it('shows no failure from a late refusal once Create Space shows the opening status', async () => {
    const { shell, answerView, failView } = fakeShell({ holdViews: true });
    render(<StartPage shell={shell} />);
    await answerView();
    const newSpace = await screen.findByRole('button', { name: 'New Space' });

    fireEvent.click(newSpace);
    fireEvent.click(newSpace);
    await answerView('newest');
    fireEvent.click(await screen.findByRole('button', { name: 'Create Space' }));
    await failView();

    expect(screen.queryByText('The Start window could not load')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Opening Untitled Space…');
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
