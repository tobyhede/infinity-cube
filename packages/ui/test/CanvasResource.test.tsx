import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { uuidSchema, type ResourceContent } from '@project/core';
import {
  CanvasResource,
  canvasResourceContentOverflow,
  CLOSED_DISPLAY,
  type KindOperations,
  type ResourceDisplay,
} from '../src';
import { WithTexts } from './markdown-texts';

const SPACE_CONTENT: ResourceContent = {
  kind: 'space',
  content: {
    spaceId: uuidSchema.parse('00000000-0000-4000-8000-0000000000aa'),
    map: uuidSchema.parse('00000000-0000-4000-8000-0000000000ab'),
    graph: uuidSchema.parse('00000000-0000-4000-8000-0000000000ac'),
  },
  via: 'self',
};

/** An Open display drawing `content`. */
const opened = (content: ResourceContent): ResourceDisplay => ({ shown: 'open', content });

it('takes a Reference Resource’s content-area layout from what it shows, including its Close fade', async () => {
  const props = {
    kindOperations: { kind: 'reference' as const },
    state: 'rest' as const,
    title: 'A',
    graphColor: '#ffc53d',
  };
  const { rerender } = render(
    <CanvasResource {...props} display={opened({ kind: 'ur', content: {}, via: 'target' })} />,
    { wrapper: WithTexts },
  );
  const resource = screen.getByRole('article', { name: 'A' });
  expect(resource).not.toHaveAttribute('data-content-area');
  rerender(<CanvasResource {...props} display={opened({ kind: 'unresolved', via: 'target' })} />);
  expect(resource).toHaveAttribute('data-content-area', 'true');
  expect(await screen.findByText('Target not found')).toBeVisible();
  rerender(<CanvasResource {...props} display={CLOSED_DISPLAY} />);
  expect(resource).toHaveAttribute('data-content-area', 'true');
  expect(resource).toHaveTextContent('Target not found');
});

/**
 * Base UI's menus position themselves by measuring, and jsdom ships no pointer
 * capture. The stubs are for the entity-action menus this file opens; the
 * `scrollIntoView` an item-aligned list calls is stubbed globally in
 * `vitest.setup.ts`.
 */
beforeAll(() => {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
});

describe('CanvasResource kind and interaction state', () => {
  it('does not expose entity actions when every supplied group is empty', () => {
    render(
      <CanvasResource
        kindOperations={{ kind: 'markdown' }}
        display={CLOSED_DISPLAY}
        state="selected"
        title="Empty"
        graphColor="#ffc53d"
        entityActions={[[], []]}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Actions for Resource Empty' }),
    ).not.toBeInTheDocument();
  });

  it('leaves the native context menu and the article role alone when no action is offered', () => {
    render(
      <CanvasResource
        kindOperations={{ kind: 'markdown' }}
        display={CLOSED_DISPLAY}
        state="selected"
        title="Empty"
        graphColor="#ffc53d"
        entityActions={[]}
      />,
    );

    const article = screen.getByRole('article', { name: 'Empty' });
    expect(article).not.toHaveAttribute('aria-disabled');
    // `fireEvent` answers false when a handler prevented the default: an empty
    // menu must not swallow the browser's own.
    expect(fireEvent.contextMenu(article)).toBe(true);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('draws a creation ghost as a Markdown Resource offering nothing', () => {
    render(
      <CanvasResource
        kindOperations={{ kind: 'markdown' }}
        display={CLOSED_DISPLAY}
        state="rest"
        title="Resource 2"
        graphColor="#ffc53d"
      />,
    );

    expect(screen.getByRole('article', { name: 'Resource 2' })).toHaveAttribute(
      'data-kind',
      'markdown',
    );
    expect(screen.getByRole('img', { name: 'Markdown Resource' })).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('presents a Reference Resource by its kind alone', () => {
    render(
      <CanvasResource
        kindOperations={{ kind: 'reference' }}
        onOpenChange={vi.fn(() => 'completed' as const)}
        display={CLOSED_DISPLAY}
        state="selected"
        title="Opening, again"
        graphColor="#35d6c3"
      />,
    );

    const resource = screen.getByRole('article', { name: 'Opening, again' });
    expect(resource).toHaveAttribute('data-kind', 'reference');
    expect(resource).toHaveAttribute('data-state', 'selected');
    expect(screen.getByRole('img', { name: 'Reference Resource' })).toBeVisible();
  });

  it('offers a Reference Resource the shared Open operation', () => {
    const onOpenChange = vi.fn(() => 'completed' as const);
    render(
      <CanvasResource
        kindOperations={{ kind: 'reference' }}
        onOpenChange={onOpenChange}
        display={CLOSED_DISPLAY}
        state="selected"
        title="Return"
        graphColor="#ffc53d"
      />,
    );

    screen.getByRole('button', { name: 'Open Resource Return' }).click();
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('button', { name: 'Close Resource Return' })).not.toBeInTheDocument();
  });

  it('draws an unresolved Target as a notice, not an empty document', () => {
    render(
      <CanvasResource
        kindOperations={{ kind: 'reference' }}
        onOpenChange={() => 'completed'}
        display={opened({ kind: 'unresolved', via: 'target' })}
        state="rest"
        title="Dangling"
        graphColor="#ffc53d"
      />,
    );

    const resource = screen.getByRole('article', { name: 'Dangling' });
    expect(resource).toHaveAttribute('data-open', 'true');
    expect(screen.getByTestId('unresolved-content')).toHaveTextContent('Target not found');
    expect(resource.querySelector('.markdown-resource-body')).toBeNull();
    expect(resource).toHaveAttribute('data-content-area', 'true');
  });

  it('reflects dragging as its own external state, distinct from selected', () => {
    render(
      <CanvasResource
        kindOperations={{ kind: 'reference' }}
        display={opened({ kind: 'ur', content: {}, via: 'target' })}
        state="dragging"
        title="Closing"
        graphColor="#ffc53d"
      />,
    );

    expect(screen.getByRole('article', { name: 'Closing' })).toHaveAttribute(
      'data-state',
      'dragging',
    );
  });
});

describe('CanvasResource Open and Close operation', () => {
  it('owns its read-only state and withholds supplied authoring operations', () => {
    render(
      <CanvasResource
        readOnly
        kindOperations={{ kind: 'reference' }}
        onOpenChange={vi.fn(() => 'completed' as const)}
        display={CLOSED_DISPLAY}
        state="selected"
        title="A"
        graphColor="#ffc53d"
        onBeginTitleEdit={vi.fn()}
        entityActions={[[{ id: 'remove', label: 'Remove from Map', onSelect: vi.fn() }]]}
      />,
    );

    expect(screen.queryByRole('button', { name: /Resource A$/ })).not.toBeInTheDocument();
    fireEvent.contextMenu(screen.getByRole('article', { name: 'A' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('offers no action when neither operation is supplied', () => {
    render(
      <CanvasResource
        kindOperations={{ kind: 'markdown' }}
        display={CLOSED_DISPLAY}
        state="selected"
        title="A"
        graphColor="#ffc53d"
      />,
    );

    expect(screen.queryByRole('button', { name: /Resource A$/ })).not.toBeInTheDocument();
  });

  it('names and draws the same working operation for each open state', () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <CanvasResource
        kindOperations={{ kind: 'markdown' }}
        onOpenChange={onOpenChange}
        display={CLOSED_DISPLAY}
        state="selected"
        title="A"
        graphColor="#ffc53d"
      />,
    );

    const open = screen.getByRole('button', { name: 'Open Resource A' });
    expect(open.querySelector('svg')).toHaveClass('lucide-maximize-2');
    open.click();
    expect(onOpenChange).toHaveBeenCalledWith(true);

    rerender(
      <CanvasResource
        kindOperations={{ kind: 'reference' }}
        onOpenChange={onOpenChange}
        display={opened({ kind: 'ur', content: {}, via: 'target' })}
        state="selected"
        title="A"
        graphColor="#ffc53d"
      />,
    );
    const close = screen.getByRole('button', { name: 'Close Resource A' });
    expect(close.querySelector('svg')).toHaveClass('lucide-minimize-2');
    close.click();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('hides both actions while the title is being edited', () => {
    render(
      <CanvasResource
        kindOperations={{ kind: 'markdown' }}
        onOpenChange={() => 'completed'}
        display={CLOSED_DISPLAY}
        state="editing"
        title="A"
        graphColor="#ffc53d"
        onCompleteTitleEdit={() => null}
        onCancelTitleEdit={() => undefined}
        onReturnFocus={() => undefined}
      />,
    );

    expect(screen.queryByRole('button', { name: /Resource A$/ })).not.toBeInTheDocument();
  });

  it('hides both actions while dragging', () => {
    render(
      <CanvasResource
        kindOperations={{ kind: 'markdown' }}
        onOpenChange={() => 'completed'}
        display={CLOSED_DISPLAY}
        state="dragging"
        title="A"
        graphColor="#ffc53d"
      />,
    );

    expect(screen.queryByRole('button', { name: /Resource A$/ })).not.toBeInTheDocument();
  });
});

describe('CanvasResource title', () => {
  it('draws a heading, not an editor, when no title-edit operation is supplied', () => {
    render(
      <CanvasResource
        kindOperations={{ kind: 'markdown' }}
        display={CLOSED_DISPLAY}
        state="rest"
        title="A"
        graphColor="#ffc53d"
      />,
    );

    const heading = screen.getByRole('heading', { name: 'A' });
    expect(heading.closest('.canvas-resource__title')).toHaveAttribute('data-editable', 'false');
    fireEvent.click(heading);
    expect(screen.queryByRole('textbox', { name: 'Resource title' })).not.toBeInTheDocument();
  });

  it('wraps its heading in the Title’s one-activation control', () => {
    const onBeginTitleEdit = vi.fn();
    render(
      <CanvasResource
        kindOperations={{ kind: 'markdown' }}
        display={CLOSED_DISPLAY}
        state="rest"
        title="A"
        graphColor="#ffc53d"
        onBeginTitleEdit={onBeginTitleEdit}
      />,
    );

    const heading = screen.getByRole('heading', { name: 'A' });
    expect(heading.closest('.canvas-resource__title')).toHaveAttribute('data-editable', 'true');
    expect(heading).toHaveAccessibleName('A');
    const control = screen.getByRole('button', { name: 'Edit Title A' });
    // The control wraps the heading and not the other way round. An accessible
    // name comes from an element's own label first and its content second, so a
    // heading *containing* a labelled control is named by that control and the
    // Title Lines are reachable through nothing (ADR 0065, ADR 0083).
    expect(control).toContainElement(heading);

    fireEvent.click(control);
    expect(onBeginTitleEdit).toHaveBeenCalledOnce();
  });

  /**
   * ADR 0065: the Title is its own control. Its pointer and keyboard events
   * must not also become the Resource body's selection or Opening gestures.
   */
  it('does not let Title activation reach the Resource around it', () => {
    const onBeginTitleEdit = vi.fn();
    const selectedResource = vi.fn();
    const pressedResource = vi.fn();
    render(
      <div onClick={selectedResource} onKeyDown={pressedResource}>
        <CanvasResource
          kindOperations={{ kind: 'markdown' }}
          display={CLOSED_DISPLAY}
          state="rest"
          title="A"
          graphColor="#ffc53d"
          onBeginTitleEdit={onBeginTitleEdit}
        />
      </div>,
    );

    const control = screen.getByRole('button', { name: 'Edit Title A' });
    fireEvent.click(control);
    fireEvent.keyDown(control, { key: 'Enter' });
    expect(onBeginTitleEdit).toHaveBeenCalledOnce();
    expect(selectedResource).not.toHaveBeenCalled();
    expect(pressedResource).not.toHaveBeenCalled();
  });
});

/**
 * The Title ladder (ADR 0083). What the DOM has to say is the structure — a
 * block element per Title Line, carrying the role the domain gave it — and the
 * typography that structure hangs off is held by
 * `canvas-resource-title-ladder.test.ts`, because jsdom computes no CSS.
 *
 * The distinction every one of these is protecting: a break the **author typed**
 * starts a rung; a break the **box chose** does not. jsdom cannot wrap text, so
 * the second half is proved where wrapping is real — the Ladle suite's
 * `markdown · long title` specimen, whose long single-line Title must stay one
 * `title`-role element however many visual lines it takes.
 */
describe('CanvasResource Title ladder', () => {
  const ladder = (): readonly { role: string | null; text: string }[] =>
    [...screen.getByRole('heading').querySelectorAll('.canvas-resource__title-line')].map(
      (line) => ({
        role: line.getAttribute('data-role'),
        text: line.textContent,
      }),
    );

  it('draws a Title with no break as one element at the title role', () => {
    render(
      <CanvasResource
        kindOperations={{ kind: 'markdown' }}
        display={CLOSED_DISPLAY}
        state="rest"
        title="Strategies"
        graphColor="#ffc53d"
      />,
    );

    expect(ladder()).toEqual([{ role: 'title', text: 'Strategies' }]);
  });

  /** Line one names the Resource; line two qualifies it; line three and after repeat. */
  it('gives each authored line its role, and every line past the third the last one', () => {
    render(
      <CanvasResource
        kindOperations={{ kind: 'markdown' }}
        display={CLOSED_DISPLAY}
        state="rest"
        title={'Strategies\nNo strategy is privileged\nADR 0014\nADR 0041'}
        graphColor="#ffc53d"
      />,
    );

    expect(ladder()).toEqual([
      { role: 'title', text: 'Strategies' },
      { role: 'subtitle', text: 'No strategy is privileged' },
      { role: 'caption', text: 'ADR 0014' },
      { role: 'caption', text: 'ADR 0041' },
    ]);
  });

  /** An interior blank line is a gap the author meant, and it keeps its rung. */
  it('keeps an interior blank line as a line of its own', () => {
    render(
      <CanvasResource
        kindOperations={{ kind: 'markdown' }}
        display={CLOSED_DISPLAY}
        state="rest"
        title={'Strategies\n\nADR 0014'}
        graphColor="#ffc53d"
      />,
    );

    expect(ladder()).toEqual([
      { role: 'title', text: 'Strategies' },
      { role: 'subtitle', text: '' },
      { role: 'caption', text: 'ADR 0014' },
    ]);
  });

  /**
   * A Title that changed shape when a Resource opened would teach an author that
   * Opening edits it, so Open and Closed draw the same ladder — and so does
   * every kind, the drawn Resource being the one surface that draws one at all.
   */
  it('draws the same ladder Open and Closed, on every Resource kind', () => {
    const title = 'Strategies\nNo strategy is privileged\nADR 0014';
    const cases: readonly (readonly [KindOperations, ResourceDisplay])[] = [
      [{ kind: 'reference' }, CLOSED_DISPLAY],
      [{ kind: 'reference' }, opened({ kind: 'ur', content: {}, via: 'target' })],
      [{ kind: 'space' }, CLOSED_DISPLAY],
      [{ kind: 'space' }, opened(SPACE_CONTENT)],
      [{ kind: 'ur' }, CLOSED_DISPLAY],
      [{ kind: 'ur' }, opened({ kind: 'ur', content: {}, via: 'self' })],
      [{ kind: 'reference' }, opened({ kind: 'ur', content: {}, via: 'target' })],
    ];

    for (const [kindOperations, display] of cases) {
      const { unmount } = render(
        <CanvasResource
          kindOperations={kindOperations}
          display={display}
          state="rest"
          title={title}
          graphColor="#ffc53d"
        />,
      );
      expect(ladder(), kindOperations.kind).toEqual([
        { role: 'title', text: 'Strategies' },
        { role: 'subtitle', text: 'No strategy is privileged' },
        { role: 'caption', text: 'ADR 0014' },
      ]);
      unmount();
    }
  });

  /**
   * ADR 0065's one-activation control covers the whole Title rather than its
   * first line: the editor it opens edits the whole string, and a control over
   * the name alone would say otherwise. One control, and the ladder inside it,
   * which is also what puts the hover and focus treatment across the ladder.
   *
   * Its **accessible name** is the Resource's name all the same (ADR 0083): what
   * the control covers and what it is called are different questions, and a
   * screen reader announcing three lines as one control's name is worse than
   * announcing the name and leaving the rest to be read.
   */
  it('puts the whole ladder inside the one Title control', () => {
    render(
      <CanvasResource
        kindOperations={{ kind: 'markdown' }}
        display={CLOSED_DISPLAY}
        state="rest"
        title={'Strategies\nNo strategy is privileged\nADR 0014'}
        graphColor="#ffc53d"
        onBeginTitleEdit={() => undefined}
      />,
    );

    const control = screen.getByRole('button', { name: 'Edit Title Strategies' });
    const lines = control.querySelectorAll('.canvas-resource__title-line');
    expect(lines).toHaveLength(3);
    expect(
      screen.getByRole('heading').querySelectorAll('.canvas-resource__title-line'),
    ).toHaveLength(3);
  });

  /**
   * Every **control** on the Resource is named by the Resource's name (ADR 0083), and
   * the heading is named by the Title Lines it draws.
   *
   * Read as one render rather than a case apiece, because the claim is about
   * the set: the Resource, its rail, each command on it and the heading are the
   * whole of what a Title names here, and a label added later that reached for
   * the whole Title would leave every other one saying something different
   * about the same Resource. A screen reader hearing three lines as one control's
   * name is worse than hearing the name and reading the rest.
   */
  it('names the Resource and its every control by the Resource’s name', () => {
    const title = 'Strategies\nNo strategy is privileged\nADR 0014';
    const resource = (open: boolean) => (
      <CanvasResource
        kindOperations={{ kind: 'reference' }}
        onOpenChange={() => 'completed' as const}
        display={open ? opened({ kind: 'ur', content: {}, via: 'target' }) : CLOSED_DISPLAY}
        state="selected"
        title={title}
        graphColor="#ffc53d"
        onBeginTitleEdit={() => undefined}
        entityActions={[[{ id: 'copy-link', label: 'Copy link', onSelect: () => 'done' as const }]]}
      />
    );

    const { unmount } = render(resource(false));
    for (const name of [
      'Resource Strategies',
      'Open Resource Strategies',
      'Actions for Resource Strategies',
      'Edit Title Strategies',
    ]) {
      expect(screen.getAllByLabelText(name), name).not.toHaveLength(0);
    }

    // The heading carries no label of its own, so it is named by the Title
    // Lines it draws and a reader reaches every one of them. The name a browser
    // computes from them is asserted in `ladle-e2e/resource.spec.ts`: jsdom and
    // Chromium join the rungs differently, and only one of them is the truth.
    expect(screen.getByRole('heading')).not.toHaveAttribute('aria-label');
    expect(screen.getByRole('heading').textContent).toBe(
      'StrategiesNo strategy is privilegedADR 0014',
    );
    // And no control took the whole Title on the way to that.
    expect(screen.queryByLabelText(/No strategy is privileged/u)).toBeNull();
    unmount();

    // Opening changes Open to Close, which grows no Title Line.
    render(resource(true));
    for (const name of ['Close Resource Strategies']) {
      expect(screen.getAllByLabelText(name), name).not.toHaveLength(0);
    }
  });
});

describe('CanvasResource title editor', () => {
  it('focuses and selects the draft on mount', () => {
    render(
      <CanvasResource
        kindOperations={{ kind: 'markdown' }}
        display={CLOSED_DISPLAY}
        state="editing"
        title="A"
        graphColor="#ffc53d"
        onCompleteTitleEdit={() => null}
        onCancelTitleEdit={() => undefined}
        onReturnFocus={() => undefined}
      />,
    );

    const input = screen.getByRole('textbox', { name: 'Resource title' });
    expect(input).toHaveFocus();
    expect(input).toHaveValue('A');
  });

  it('keeps a refused draft field-local and completes a valid one with Enter', () => {
    const onCompleteTitleEdit = vi.fn((title: string) =>
      title.length === 0 ? 'A Resource title is required.' : null,
    );
    const onReturnFocus = vi.fn();
    render(
      <CanvasResource
        kindOperations={{ kind: 'markdown' }}
        display={CLOSED_DISPLAY}
        state="editing"
        title="A"
        graphColor="#ffc53d"
        onCompleteTitleEdit={onCompleteTitleEdit}
        onCancelTitleEdit={() => undefined}
        onReturnFocus={onReturnFocus}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Resource title' });

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('alert')).toHaveTextContent('A Resource title is required.');
    expect(onCompleteTitleEdit).toHaveBeenLastCalledWith('');
    expect(onReturnFocus).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'Renamed A' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCompleteTitleEdit).toHaveBeenLastCalledWith('Renamed A');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onReturnFocus).toHaveBeenCalledOnce();
  });

  it('restores focus to a title draft refused on blur', () => {
    render(
      <CanvasResource
        kindOperations={{ kind: 'markdown' }}
        display={CLOSED_DISPLAY}
        state="editing"
        title="A"
        graphColor="#ffc53d"
        onCompleteTitleEdit={() => 'A Resource title is required.'}
        onCancelTitleEdit={() => undefined}
        onReturnFocus={() => undefined}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Resource title' });

    act(() => input.blur());

    expect(input).toHaveFocus();
  });

  it('completes on blur, cancels and returns focus on Escape, and leaks no editor event', () => {
    const onCompleteTitleEdit = vi.fn(() => null);
    const onCancelTitleEdit = vi.fn();
    const onReturnFocus = vi.fn();
    const leakedClick = vi.fn();
    const leakedPointer = vi.fn();
    const leakedKey = vi.fn();
    render(
      <div onClick={leakedClick} onPointerDown={leakedPointer} onKeyDown={leakedKey}>
        <CanvasResource
          kindOperations={{ kind: 'markdown' }}
          display={CLOSED_DISPLAY}
          state="editing"
          title="A"
          graphColor="#ffc53d"
          onCompleteTitleEdit={onCompleteTitleEdit}
          onCancelTitleEdit={onCancelTitleEdit}
          onReturnFocus={onReturnFocus}
        />
      </div>,
    );
    const input = screen.getByRole('textbox', { name: 'Resource title' });

    fireEvent.change(input, { target: { value: 'Blurred A' } });
    fireEvent.pointerDown(input);
    fireEvent.click(input);
    fireEvent.blur(input);
    expect(onCompleteTitleEdit).toHaveBeenCalledWith('Blurred A');
    // A blur is the author clicking elsewhere; taking focus back would be a steal.
    expect(onReturnFocus).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCancelTitleEdit).toHaveBeenCalledOnce();
    expect(onReturnFocus).toHaveBeenCalledOnce();
    expect(leakedClick).not.toHaveBeenCalled();
    expect(leakedPointer).not.toHaveBeenCalled();
    expect(leakedKey).not.toHaveBeenCalled();
  });

  /**
   * `closingByKey` suppresses the blur that a key exit's own focus move
   * produces, so one completion is not counted twice. It is cleared by that
   * blur — and a caller whose `onReturnFocus` moves no focus (React Flow
   * declines to focus a node it is not making focusable) produces none, so the
   * flag stays raised over an editor that is still open and still being typed
   * into. Editing again is what says the exit did not happen, so it re-arms
   * blur completion rather than waiting for a blur that never came.
   */
  it('still completes on blur after further editing when a key exit moved no focus', () => {
    const onCompleteTitleEdit = vi.fn(() => null);
    render(
      <CanvasResource
        kindOperations={{ kind: 'markdown' }}
        display={CLOSED_DISPLAY}
        state="editing"
        title="A"
        graphColor="#ffc53d"
        onCompleteTitleEdit={onCompleteTitleEdit}
        onCancelTitleEdit={vi.fn()}
        onReturnFocus={() => {
          /* a caller with nothing to focus: no blur follows */
        }}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Resource title' });

    fireEvent.change(input, { target: { value: 'Renamed' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCompleteTitleEdit).toHaveBeenCalledOnce();
    expect(onCompleteTitleEdit).toHaveBeenCalledWith('Renamed');

    // The caller left the editor open, so the author keeps typing and clicks away.
    fireEvent.change(input, { target: { value: 'Renamed again' } });
    fireEvent.blur(input);
    expect(onCompleteTitleEdit).toHaveBeenCalledTimes(2);
    expect(onCompleteTitleEdit).toHaveBeenLastCalledWith('Renamed again');
  });

  /**
   * The drawn Resource is the surface that asks for Title Lines (ADR 0083).
   *
   * `InlineTitleEditor.test.tsx` holds the capability itself; what is proved
   * here is that this component opts into it, which is the half a component
   * reading `variant` would not have needed and a Dock's name field must not
   * gain.
   */
  it('writes a Title on more than one line and completes it whole', () => {
    const onCompleteTitleEdit = vi.fn(() => null);
    render(
      <CanvasResource
        kindOperations={{ kind: 'markdown' }}
        display={CLOSED_DISPLAY}
        state="editing"
        title="Auth"
        graphColor="#ffc53d"
        onCompleteTitleEdit={onCompleteTitleEdit}
        onCancelTitleEdit={() => undefined}
        onReturnFocus={() => undefined}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Resource title' });
    expect(input).toBeInstanceOf(HTMLTextAreaElement);

    // Shift+Enter is the textarea's own line, so the edit is still running.
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(onCompleteTitleEdit).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'Auth\nThe service, not the screen' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCompleteTitleEdit).toHaveBeenCalledWith('Auth\nThe service, not the screen');
  });
});

describe('CanvasResource Open Reference Resource', () => {
  it('repeats transition durations cyclically when timing the opacity exit', async () => {
    const { rerender } = render(
      <CanvasResource
        kindOperations={{ kind: 'reference' }}
        display={{
          shown: 'open',
          content: { kind: 'unresolved', via: 'target' },
        }}
        state="rest"
        title="Strategies"
        graphColor="#ffc53d"
      />,
      { wrapper: WithTexts },
    );
    // The text is read before the clock is faked, so the read is not held by it.
    expect(await screen.findByText('Target not found')).toBeInTheDocument();
    vi.useFakeTimers();
    const computed = document.createElement('div').style;
    computed.transitionProperty = 'color, transform, width, opacity';
    computed.transitionDuration = '10ms, 100ms';
    const style = vi.spyOn(window, 'getComputedStyle').mockReturnValue(computed);

    rerender(
      <CanvasResource
        kindOperations={{ kind: 'reference' }}
        display={CLOSED_DISPLAY}
        state="rest"
        title="Strategies"
        graphColor="#ffc53d"
      />,
    );
    await act(() => vi.advanceTimersByTime(99));
    expect(screen.getByText('Target not found')).toBeInTheDocument();
    await act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText('Target not found')).not.toBeInTheDocument();

    style.mockRestore();
    vi.useRealTimers();
  });

  it('draws nothing below its Title while authored closed state says so', () => {
    render(
      <CanvasResource
        kindOperations={{ kind: 'markdown' }}
        display={CLOSED_DISPLAY}
        state="rest"
        title="Strategies"
        graphColor="#ffc53d"
      />,
    );

    expect(screen.getByRole('article', { name: 'Strategies' })).toHaveAttribute(
      'data-open',
      'false',
    );
  });

  it('draws no body on a closed Reference Resource', () => {
    render(
      <CanvasResource
        kindOperations={{ kind: 'reference' }}
        display={CLOSED_DISPLAY}
        state="rest"
        title="Strategy overview"
        graphColor="#35d6c3"
      />,
    );

    expect(screen.getByRole('article', { name: 'Strategy overview' })).toHaveAttribute(
      'data-open',
      'false',
    );
  });

  it('holds its content area open while the Title is being renamed', async () => {
    render(
      <CanvasResource
        kindOperations={{ kind: 'reference' }}
        display={{
          shown: 'open',
          content: { kind: 'unresolved', via: 'target' },
        }}
        state="editing"
        title="Strategies"
        graphColor="#ffc53d"
        onCompleteTitleEdit={() => null}
        onCancelTitleEdit={vi.fn()}
        onReturnFocus={vi.fn()}
      />,
      { wrapper: WithTexts },
    );
    expect(await screen.findByText('Target not found')).toBeVisible();

    // Open is what the Map authored and the caret is a gesture, so the
    // two are independent rather than exclusive (ADR 0064).
    expect(screen.getByRole('textbox', { name: 'Resource title' })).toBeVisible();
    expect(screen.getByText('Target not found')).toBeVisible();
  });
});

describe('how far an Open Resource overflows', () => {
  it('answers the most any element of its content would scroll, and nothing outside one', async () => {
    const { container } = render(
      <CanvasResource
        kindOperations={{ kind: 'reference' }}
        display={opened({ kind: 'unresolved', via: 'target' })}
        state="rest"
        title="Strategies"
        graphColor="#ffc53d"
      />,
      { wrapper: WithTexts },
    );

    const text = await screen.findByText('Target not found');
    Object.defineProperty(text, 'scrollHeight', { value: 420 });
    Object.defineProperty(text, 'clientHeight', { value: 100 });

    expect(canvasResourceContentOverflow(container)).toBe(320);
    expect(canvasResourceContentOverflow(document.createElement('div'))).toBe(0);
  });
});

describe('CanvasResource Close fade', () => {
  function leavingContent(): HTMLElement {
    const article = screen.getByRole('article', { name: 'A' });
    const content = article.querySelector<HTMLElement>('.canvas-resource__content');
    if (content === null) throw new Error('The content area is not mounted.');
    expect(content).toHaveAttribute('data-presence', 'leaving');
    return content;
  }

  it('keeps what it last drew while the content fades out', async () => {
    const { rerender } = render(
      <CanvasResource
        kindOperations={{ kind: 'reference' }}
        display={{
          shown: 'open',
          content: { kind: 'unresolved', via: 'target' },
        }}
        state="rest"
        title="A"
        graphColor="#ffc53d"
      />,
      { wrapper: WithTexts },
    );
    expect(await screen.findByText('Target not found')).toBeVisible();
    rerender(
      <CanvasResource
        kindOperations={{ kind: 'reference' }}
        display={CLOSED_DISPLAY}
        state="rest"
        title="A"
        graphColor="#ffc53d"
      />,
    );

    expect(leavingContent()).toHaveTextContent('Target not found');
  });
});

/**
 * An Ur Resource is drawn by its plugin (ADR 0142, `PluginResource.test.tsx`);
 * a Reference Resource to one is still drawn here, and an Ur Resource's
 * content draws no content area.
 */
describe('CanvasResource Reference to an Ur Resource', () => {
  it('draws an Open Reference Resource to an Ur Resource the same, read-only', () => {
    render(
      <CanvasResource
        kindOperations={{ kind: 'reference' }}
        onOpenChange={() => 'completed'}
        display={opened({ kind: 'ur', content: {}, via: 'target' })}
        state="selected"
        title="Gateway, again"
        graphColor="#ffc53d"
      />,
    );

    const resource = screen.getByRole('article', { name: 'Gateway, again' });
    expect(resource).toHaveAttribute('data-kind', 'reference');
    expect(resource).toHaveAttribute('data-content-kind', 'ur');
    expect(resource.querySelector('.canvas-resource__content')).toBeNull();
    expect(resource).toHaveTextContent(/^Gateway, again$/u);
    expect(screen.getByRole('button', { name: 'Close Resource Gateway, again' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Edit Resource Gateway, again' })).toBeNull();
  });
});
