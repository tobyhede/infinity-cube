import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { uuidSchema, type ResourceContent } from '@project/core';
import { CanvasResource, CLOSED_DISPLAY } from '../src';

/**
 * The Resource rail's keyboard contract (ADR 0073).
 *
 * These assert what the roving-tabindex toolbar buys and what a plain group of
 * buttons could not: one tab stop for a rail however many commands it carries,
 * and arrow traversal inside it.
 *
 * They also assert the rail's two groups, which are what stops "whose command
 * is this?" being answered by where a control happens to have been typed.
 *
 * They draw a Space Resource, the kind `CanvasResource` draws that has a
 * command of its own: its portal's Edit and Done. Markdown and Image
 * Resources are plugins', drawn by `PluginResource` (ADR 0142).
 */

const SPACE_CONTENT: ResourceContent = {
  kind: 'space',
  view: {
    spaceId: uuidSchema.parse('00000000-0000-4000-8000-0000000000aa'),
    map: uuidSchema.parse('00000000-0000-4000-8000-0000000000ab'),
    graph: uuidSchema.parse('00000000-0000-4000-8000-0000000000ac'),
    framing: undefined,
  },
  via: 'self',
};
const openSpace = { shown: 'open', content: SPACE_CONTENT } as const;

const railActions = () => screen.getByTestId('canvas-resource-actions');
const railButtons = () => Array.from(railActions().querySelectorAll('button'));
const tabStops = () => railButtons().filter((button) => button.tabIndex === 0);

const spaceResource = (editing = false) => (
  <CanvasResource
    kindOperations={{ kind: 'space', portal: { editing, onEditingChange: vi.fn() } }}
    onOpenChange={vi.fn()}
    display={openSpace}
    state="rest"
    title="A"
    graphColor="#ffc53d"
  />
);

describe('the Resource rail is one toolbar', () => {
  it("names the Resource it commands, so its controls are heard as that Resource's", () => {
    render(spaceResource());

    const toolbar = screen.getByRole('toolbar', { name: 'Resource A' });
    expect(toolbar).toContainElement(railActions());
    expect(toolbar).toHaveAttribute('aria-orientation', 'horizontal');
  });

  it('costs one tab stop however many commands it carries', () => {
    const { rerender } = render(spaceResource());

    expect(railButtons()).toHaveLength(2);
    expect(tabStops()).toHaveLength(1);

    // The same rail while its Map is edited: Done and Close, still one tab
    // stop — which is the whole argument, because a canvas draws many
    // Resources and each one has a rail.
    rerender(spaceResource(true));

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

const kindGroup = (name: string) => within(railActions()).getByRole('group', { name });
const sharedGroup = () => within(railActions()).getByRole('group', { name: 'Resource commands' });

describe('the rail says whose command each one is', () => {
  it("puts a kind's own command in that kind's group", () => {
    render(spaceResource());

    const edit = screen.getByRole('button', { name: 'Edit Resource A' });
    expect(kindGroup('Space Resource commands')).toContainElement(edit);
    expect(sharedGroup()).not.toContainElement(edit);
  });

  it('puts Open and Close in the shared group, because every Resource has them', () => {
    render(spaceResource());

    const close = screen.getByRole('button', { name: 'Close Resource A' });
    expect(sharedGroup()).toContainElement(close);
    // Open and Close trail the rail, so Close is in the same place whatever
    // kind of Resource it is drawn on.
    const groups = within(railActions()).getAllByRole('group');
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual([
      'Space Resource commands',
      'Resource commands',
    ]);
  });

  it("keeps the shared group while an edit replaces the kind's own command", () => {
    render(spaceResource(true));

    // Done ends the edit and belongs with Edit, which it replaces while the
    // Map is edited. Close is still the Resource's.
    const space = kindGroup('Space Resource commands');
    expect(within(space).getByRole('button', { name: 'Done Resource A' })).toBeInTheDocument();
    expect(sharedGroup()).toContainElement(
      screen.getByRole('button', { name: 'Close Resource A' }),
    );
  });

  it('draws Reference Resource Open in the shared Resource command group', () => {
    render(
      <CanvasResource
        kindOperations={{ kind: 'reference' }}
        onOpenChange={() => 'completed'}
        display={CLOSED_DISPLAY}
        state="rest"
        title="A"
        graphColor="#ffc53d"
      />,
    );

    const groups = within(railActions()).getAllByRole('group');
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual(['Resource commands']);
    expect(groups[0]).toContainElement(screen.getByRole('button', { name: 'Open Resource A' }));
  });

  it('groups the commands without dividing the keyboard', async () => {
    render(spaceResource());

    const edit = screen.getByRole('button', { name: 'Edit Resource A' });
    const close = screen.getByRole('button', { name: 'Close Resource A' });
    expect(kindGroup('Space Resource commands')).toContainElement(edit);
    expect(sharedGroup()).toContainElement(close);

    // One arrow crosses the group boundary, because the roving tabindex is the
    // toolbar root's and a group is semantics rather than a second composite.
    edit.focus();
    fireEvent.keyDown(edit, { key: 'ArrowRight' });
    await waitFor(() => expect(close).toHaveFocus());
    expect(tabStops()).toHaveLength(1);
  });
});
