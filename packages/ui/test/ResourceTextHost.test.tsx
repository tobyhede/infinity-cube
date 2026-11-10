import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { HostRenderedMarkdown, HostSourceEditor } from '../src/ResourceTextHost';

describe('the text components a host gives a plugin (ADR 0142)', () => {
  it('draws a press target over rendered text only where the plugin offers an edit', () => {
    const begin = vi.fn();
    const { rerender, container } = render(<HostRenderedMarkdown markdown="Body" />);
    // Inside the surface whose values the rendered text's rules read.
    expect(
      container.querySelector('.markdown-resource-body > .markdown-resource-body__rendered'),
    ).not.toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<HostRenderedMarkdown markdown="Body" edit={{ label: 'Edit Notes', begin }} />);
    const target = screen.getByRole('button', { name: 'Edit Notes' });
    expect(target).toHaveAttribute('tabindex', '-1');
    // Outside the plugin's own region, so the wheel over the text stays the canvas's.
    expect(target.closest('.nowheel')).toBeNull();
    fireEvent.click(target);
    expect(begin).toHaveBeenCalledTimes(1);
  });

  it('hands Escape and Mod-Enter in the source editor to the edit’s Cancel and Save, and nothing further', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    const outside = vi.fn();
    const { container } = render(
      <div onKeyDown={outside}>
        <HostSourceEditor
          value="Body"
          onValueChange={() => undefined}
          ariaLabel="Markdown source of Notes"
          onSave={onSave}
          onCancel={onCancel}
        />
      </div>,
    );
    const editor = container.querySelector('.markdown-resource-body--editing');
    if (editor === null) throw new Error('The source editor was not drawn.');
    fireEvent.keyDown(editor, { key: 'Escape' });
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(editor, { key: 'Enter', metaKey: true });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(outside).not.toHaveBeenCalled();
    fireEvent.keyDown(editor, { key: 'Enter' });
    expect(outside).toHaveBeenCalledTimes(1);
  });
});
