import type { ReactNode } from 'react';
import type { Story } from '@ladle/react';
import { StartPage } from '#components/StartPage';
import { storyStartShell } from '../support/start-shell-fixture';

/**
 * The production Start window page (Storage ST-131, UI-111) with Recent
 * filled in. The shell hands the page no recent Space until ticket 03 of
 * `.scratch/start-window` keeps a history, so production cannot reach this
 * state yet, and it is staged here rather than in the stable catalogue; it
 * moves to `components/start-window.stories.tsx`, with its parity claim,
 * once 03 is built.
 */
export default { title: 'Review/Start Window Recent' };

const Window = ({ children }: { children: ReactNode }) => (
  <div className="h-[520px] w-[720px] overflow-hidden border border-border">{children}</div>
);

/**
 * Recent as the shell will hand it: each Space's Title over its folder, one
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
