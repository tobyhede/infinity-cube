import type { ReactNode } from 'react';
import type { Story } from '@ladle/react';
import { StartPage } from '#components/StartPage';
import { storyStartShell } from '../support/start-shell-fixture';

/**
 * The desktop application's Start window (Storage ST-131, UI-111): the page
 * the shell builds as `start.html`, drawn here with a stand-in for the
 * shell's invoke commands (`support/start-shell-fixture.ts`). The window is
 * the page, so each story fills its own frame at about the size the shell
 * opens it.
 */
export default { title: 'Components/Start Window' };

const Window = ({ children }: { children: ReactNode }) => (
  <div className="h-[520px] w-[720px] overflow-hidden border border-border">{children}</div>
);

/**
 * A launch with nothing to open and nothing kept: New Space the default
 * button, Open Folder… beside it, and Recent's empty state. New Space opens
 * the form on Documents; a name with `/` is refused beside it, and the name
 * `Disk full` stands in for a write that fails.
 */
export const FirstLaunch: Story = () => (
  <Window>
    <StartPage shell={storyStartShell([])} />
  </Window>
);
FirstLaunch.meta = { iframed: true };

/**
 * Recent as the shell hands it: each Space's Title over its folder, one
 * open in a window, and one that did not open at launch with its reason and
 * Try again. (Remove is offered once the shell keeps a history to remove
 * from.)
 */
export const WithRecentSpaces: Story = () => (
  <Window>
    <StartPage
      shell={storyStartShell([
        { title: 'Quarterly review', folder: '/Users/ada/Documents/Quarterly review', open: true },
        { title: 'Untitled Space', folder: '/Users/ada/Documents/Untitled Space' },
        {
          title: 'Design system tour',
          folder: '/Users/ada/Projects/design-system-tour',
          problem: {
            kind: 'failed',
            reason: 'This Space didn’t open because one of its files couldn’t be read.',
          },
        },
      ])}
    />
  </Window>
);
WithRecentSpaces.meta = { iframed: true };
