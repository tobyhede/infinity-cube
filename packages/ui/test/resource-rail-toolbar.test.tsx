import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PluginResource, type PluginHostClaim } from '../src';

/**
 * The Resource rail's keyboard contract (ADR 0073).
 *
 * These assert what the roving-tabindex toolbar buys and what a plain group of
 * buttons could not: one tab stop for a rail however many commands it carries,
 * and arrow traversal inside it.
 *
 * They also assert the rail's groups, which are what stops "whose command is
 * this?" being answered by where a control happens to have been typed: a
 * plugin's own commands are its kind's group, and the Map embedding's commands
 * the host draws beside it are not (ADR 0142).
 *
 * They draw a Space Resource, whose plugin has commands of its own: Edit and
 * Done, and Open and Close.
 */

const SPACE_CONTENT = {
  spaceId: '00000000-0000-4000-8000-0000000000aa',
  map: '00000000-0000-4000-8000-0000000000ab',
  graph: '00000000-0000-4000-8000-0000000000ac',
};

const railActions = () => screen.getByTestId('canvas-resource-actions');
const railButtons = () => Array.from(railActions().querySelectorAll('button'));
const tabStops = () => railButtons().filter((button) => button.tabIndex === 0);

/** A host Claim that is always granted and always released. */
const grantedClaim = (): PluginHostClaim => ({
  release: () => undefined,
  exclusively: (work) => work({}),
  unmount: () => undefined,
});

const spaceResource = (open = true) => (
  <PluginResource
    resourceId="a"
    kind="space"
    title={{ title: 'A', readOnly: false, onReturnFocus: () => undefined }}
    content={SPACE_CONTENT}
    mapContent={{ open }}
    outline="rectangle"
    state="rest"
    graphColor="#ffc53d"
    readOnly={false}
    operations={{
      kind: 'space',
      commitMap: () => Promise.resolve('completed'),
      claim: grantedClaim,
    }}
  />
);

describe('the Resource rail is one toolbar', () => {
  it("names the Resource it commands, so its controls are heard as that Resource's", () => {
    render(spaceResource());

    const toolbar = screen.getByRole('toolbar', { name: 'Resource A' });
    expect(toolbar).toContainElement(railActions());
    expect(toolbar).toHaveAttribute('aria-orientation', 'horizontal');
  });

  it('costs one tab stop however many commands it carries', async () => {
    render(spaceResource());

    expect(railButtons()).toHaveLength(2);
    expect(tabStops()).toHaveLength(1);

    // The same rail while its Map is edited: Done and Close, still one tab
    // stop — which is the whole argument, because a canvas draws many
    // Resources and each one has a rail.
    fireEvent.click(screen.getByRole('button', { name: 'Edit Resource A' }));
    await screen.findByRole('button', { name: 'Done Resource A' });

    expect(railButtons()).toHaveLength(2);
    expect(railButtons()[0]).toHaveAccessibleName('Done Resource A');
    expect(tabStops()).toHaveLength(1);
  });

  it('moves between its commands on the arrow keys', async () => {
    render(spaceResource());

    const edit = screen.getByRole('button', { name: 'Edit Resource A' });
    const close = screen.getByRole('button', { name: 'Close Resource A' });

    edit.focus();
    expect(edit).toHaveFocus();

    fireEvent.keyDown(edit, { key: 'ArrowRight' });
    await waitFor(() => expect(close).toHaveFocus());

    fireEvent.keyDown(close, { key: 'ArrowLeft' });
    await waitFor(() => expect(edit).toHaveFocus());
  });

  it('keeps an arrow pressed on the rail off the canvas behind it', async () => {
    const onKeyDown = vi.fn();
    render(<div onKeyDown={onKeyDown}>{spaceResource()}</div>);

    const edit = screen.getByRole('button', { name: 'Edit Resource A' });
    const close = screen.getByRole('button', { name: 'Close Resource A' });
    edit.focus();
    fireEvent.keyDown(edit, { key: 'ArrowRight' });
    await waitFor(() => expect(close).toHaveFocus());

    // The toolbar handled it, and nothing above the Resource saw it. React Flow
    // subscribes its own keys around the canvas this Resource is drawn on.
    expect(close).toHaveFocus();
    expect(onKeyDown).not.toHaveBeenCalled();
  });
});

const kindGroup = () =>
  within(railActions()).getByRole('group', { name: 'Space Resource commands' });

describe('the rail says whose command each one is', () => {
  it("puts the plugin's own commands in its kind's group, Open and Close among them", () => {
    render(spaceResource());

    expect(kindGroup()).toContainElement(screen.getByRole('button', { name: 'Edit Resource A' }));
    expect(kindGroup()).toContainElement(screen.getByRole('button', { name: 'Close Resource A' }));
    const groups = within(railActions()).getAllByRole('group');
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual([
      'Space Resource commands',
    ]);
  });

  it("draws the Map embedding's commands outside the plugin's group, before it", () => {
    render(
      <PluginResource
        {...spaceResource().props}
        operations={{
          kind: 'space',
          commitMap: () => Promise.resolve('completed'),
          mapRail: <button type="button">Choose Map</button>,
        }}
      />,
    );

    const choose = screen.getByRole('button', { name: 'Choose Map' });
    expect(railActions()).toContainElement(choose);
    expect(kindGroup()).not.toContainElement(choose);
    expect(railButtons()[0]).toBe(choose);
  });

  it('draws no Map embedding commands on a read-only Resource', () => {
    render(
      <PluginResource
        {...spaceResource().props}
        readOnly
        operations={{ kind: 'space', mapRail: <button type="button">Choose Map</button> }}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Choose Map' })).toBeNull();
  });

  it('draws Open alone on a Closed Space Resource, with no Edit', () => {
    render(spaceResource(false));

    expect(railButtons().map((button) => button.getAttribute('aria-label'))).toEqual([
      'Open Resource A',
    ]);
  });

  it('groups the commands without dividing the keyboard', async () => {
    render(spaceResource());

    const edit = screen.getByRole('button', { name: 'Edit Resource A' });
    const close = screen.getByRole('button', { name: 'Close Resource A' });
    edit.focus();
    fireEvent.keyDown(edit, { key: 'ArrowRight' });
    await waitFor(() => expect(close).toHaveFocus());
    expect(tabStops()).toHaveLength(1);
  });
});
