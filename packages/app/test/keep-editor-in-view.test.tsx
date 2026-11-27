import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { uuidSchema, type ResourceId } from '@project/core';
import { Placement } from '@project/graph';
import { editorToShow, useKeepEditorInView, type EditorToShow } from '../src/keep-editor-in-view';

const RESOURCE = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const OTHER = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const AREA = { width: 1000, height: 800 };
const CAP = { width: 904, height: 704 };

/** An editor at the bottom-right of the visible canvas, reaching past it. */
const PAST: EditorToShow = {
  resourceId: RESOURCE,
  rect: { x: 600, y: 500, width: 500, height: 400 },
};

function camera() {
  const viewport = { x: 0, y: 0, zoom: 1 };
  return {
    getViewport: () => viewport,
    setViewport: vi.fn((_next: { x: number; y: number; zoom: number }) => undefined),
  };
}

interface Props {
  readonly editor: EditorToShow | undefined;
  readonly cap: typeof CAP | undefined;
}

function keepInView(flow: ReturnType<typeof camera>) {
  const initialProps: Props = { editor: undefined, cap: CAP };
  return renderHook(
    ({ editor, cap }: Props) => {
      useKeepEditorInView({ editor, cap, area: AREA, ...flow });
    },
    { initialProps },
  );
}

describe('keeping an editor in view (ADR 0178)', () => {
  it('pans the least distance when an edit begins that reaches past the visible canvas', () => {
    const flow = camera();
    const { rerender } = keepInView(flow);
    expect(flow.setViewport).not.toHaveBeenCalled();
    rerender({ editor: PAST, cap: CAP });
    expect(flow.setViewport.mock.calls).toEqual([[{ x: -148, y: -148, zoom: 1 }]]);
  });

  it('does not pan when a resize or a drag changes the editor’s rect', () => {
    const flow = camera();
    const { rerender } = keepInView(flow);
    rerender({
      editor: { resourceId: RESOURCE, rect: { x: 100, y: 100, width: 300, height: 200 } },
      cap: CAP,
    });
    expect(flow.setViewport).not.toHaveBeenCalled();
    // Resized past the right and bottom, then dragged past the left.
    rerender({
      editor: { resourceId: RESOURCE, rect: { x: 100, y: 100, width: 1200, height: 900 } },
      cap: CAP,
    });
    rerender({
      editor: { resourceId: RESOURCE, rect: { x: -400, y: 100, width: 1200, height: 900 } },
      cap: CAP,
    });
    expect(flow.setViewport).not.toHaveBeenCalled();
  });

  it('pans when the cap changes', () => {
    const flow = camera();
    const { rerender } = keepInView(flow);
    rerender({
      editor: { resourceId: RESOURCE, rect: { x: 100, y: 100, width: 300, height: 200 } },
      cap: CAP,
    });
    rerender({ editor: PAST, cap: CAP });
    expect(flow.setViewport).not.toHaveBeenCalled();
    rerender({ editor: PAST, cap: { width: 800, height: 600 } });
    expect(flow.setViewport).toHaveBeenCalledTimes(1);
  });

  it('pans again when another edit begins', () => {
    const flow = camera();
    const { rerender } = keepInView(flow);
    rerender({ editor: PAST, cap: CAP });
    rerender({ editor: undefined, cap: CAP });
    rerender({ editor: PAST, cap: CAP });
    rerender({ editor: { ...PAST, resourceId: OTHER }, cap: CAP });
    expect(flow.setViewport).toHaveBeenCalledTimes(3);
  });

  it('pans nothing on a canvas not yet measured', () => {
    const flow = camera();
    const { rerender } = keepInView(flow);
    rerender({ editor: PAST, cap: undefined });
    expect(flow.setViewport).not.toHaveBeenCalled();
  });

  it('shows the first editor the placement places, at its drawn rect', () => {
    const drawn = Placement.fromEntries([
      [OTHER, { x: 10, y: 20, size: { width: 640, height: 360 } }],
    ]);
    const editors = new Map<ResourceId, unknown>([
      [RESOURCE, {}],
      [OTHER, {}],
    ]);
    expect(editorToShow(drawn, editors)).toEqual({
      resourceId: OTHER,
      rect: { x: 10, y: 20, width: 640, height: 360 },
    });
    expect(editorToShow(drawn, new Map())).toBeUndefined();
  });
});
