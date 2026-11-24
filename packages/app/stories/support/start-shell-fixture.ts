import type { NewSpaceDefaults, NotCreated, RecentSpace, StartShell } from '#src/start-shell';

/**
 * Answers in the desktop shell's place for the Start window's stories,
 * through the same `StartShell` interface the shell's own invoke commands
 * implement. What it refuses stands in for `new_space_folder`'s rules
 * (`packages/desktop/src-tauri/src/new_space_folder.rs`), whose own tests
 * hold them; a name with a separator is refused as the shell refuses it,
 * the name `Disk full` fails its write after both fields were accepted, and
 * every other Create Space is left opening, as the shell leaves it once it
 * closes the window.
 */
export function storyStartShell(recents: readonly RecentSpace[]): StartShell {
  const documents: NewSpaceDefaults = {
    location: '/Users/ada/Documents',
    name: recents.some((recent) => recent.folder === '/Users/ada/Documents/Untitled Space')
      ? 'Untitled Space 2'
      : 'Untitled Space',
    separator: '/',
  };
  return {
    view: () => Promise.resolve({ recents, newSpace: documents }),
    browse: () => Promise.resolve({ ...documents, location: '/Users/ada/Desktop' }),
    createSpace: (_location, name): Promise<NotCreated | null> => {
      if (name === '' || name.includes('/') || name.includes('\\')) {
        return Promise.resolve({
          of: 'name',
          message: 'A name is one folder name: it can’t be empty, . or .., or hold / or \\.',
        });
      }
      if (name === 'Disk full') {
        return Promise.resolve({
          of: 'failed',
          message: `Could not create a Space in /Users/ada/Documents/${name}: No space left on device (os error 28)`,
        });
      }
      return new Promise(() => undefined);
    },
    openFolder: () => undefined,
    openRecent: () => undefined,
    close: () => undefined,
  };
}
