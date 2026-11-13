import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MapTitleContext, MapTitleView, type MapTitle } from '../src/MapTitle';

const noop = (): void => undefined;

const drawTitle = (title: MapTitle) =>
  render(
    <MapTitleContext.Provider value={title}>
      <MapTitleView />
    </MapTitleContext.Provider>,
  );

describe('MapTitleView', () => {
  it('draws a heading, not a control, when no rename is offered', () => {
    drawTitle({ title: 'A', readOnly: false, onReturnFocus: noop });

    const heading = screen.getByRole('heading', { name: 'A' });
    expect(heading.closest('.canvas-resource__title')).toHaveAttribute('data-editable', 'false');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('draws a read-only Title as a heading even when a rename is offered', () => {
    drawTitle({
      title: 'A',
      readOnly: true,
      onBeginTitleEdit: vi.fn(),
      editor: { onComplete: () => null, onCancel: noop },
      onReturnFocus: noop,
    });

    expect(screen.getByRole('heading', { name: 'A' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('wraps its heading in the Title’s one-activation control', () => {
    const onBeginTitleEdit = vi.fn();
    drawTitle({ title: 'A', readOnly: false, onBeginTitleEdit, onReturnFocus: noop });

    const heading = screen.getByRole('heading', { name: 'A' });
    expect(heading.closest('.canvas-resource__title')).toHaveAttribute('data-editable', 'true');
    const control = screen.getByRole('button', { name: 'Edit Title A' });
    // A heading containing a labelled control would be named by that control,
    // and the Title Lines would be reachable through nothing (ADR 0065, ADR 0083).
    expect(control).toContainElement(heading);

    fireEvent.click(control);
    expect(onBeginTitleEdit).toHaveBeenCalledOnce();
  });

  it('does not let Title activation reach the Resource around it', () => {
    const onBeginTitleEdit = vi.fn();
    const selectedResource = vi.fn();
    const pressedResource = vi.fn();
    const pointedResource = vi.fn();
    render(
      <div onClick={selectedResource} onKeyDown={pressedResource} onPointerDown={pointedResource}>
        <MapTitleContext.Provider
          value={{ title: 'A', readOnly: false, onBeginTitleEdit, onReturnFocus: noop }}
        >
          <MapTitleView />
        </MapTitleContext.Provider>
      </div>,
    );

    const control = screen.getByRole('button', { name: 'Edit Title A' });
    fireEvent.pointerDown(control);
    fireEvent.click(control);
    fireEvent.keyDown(control, { key: 'Enter' });
    expect(onBeginTitleEdit).toHaveBeenCalledOnce();
    expect(selectedResource).not.toHaveBeenCalled();
    expect(pressedResource).not.toHaveBeenCalled();
    expect(pointedResource).not.toHaveBeenCalled();
  });

  it('draws the multiline Resource title editor while a rename is open', () => {
    const onComplete = vi.fn((_title: string) => null);
    drawTitle({
      title: 'A',
      readOnly: false,
      editor: { onComplete, onCancel: noop },
      onReturnFocus: noop,
    });

    const field = screen.getByRole('textbox', { name: 'Resource title' });
    expect(field).toBeInstanceOf(HTMLTextAreaElement);
    fireEvent.change(field, { target: { value: 'B' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onComplete).toHaveBeenCalledWith('B');
  });
});
