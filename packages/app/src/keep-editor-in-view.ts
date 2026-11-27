import { useEffect, useRef } from 'react';
import { resourceSize, type ResourceId, type ResourceSize } from '@project/core';
import type { Placement } from '@project/graph';
import { leastPanToShow } from './visible-canvas-cap';

/** What the camera last showed an editor for: the editor and the cap it was drawn at. */
export interface EditorShown {
  readonly resourceId: ResourceId;
  readonly cap: ResourceSize;
}

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface Viewport {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export interface EditorToShow {
  readonly resourceId: ResourceId;
  /** The editor's drawn rect, in Map coordinates. */
  readonly rect: Rect;
}

/**
 * The first editor `drawn` places, at the rect it is drawn at, or none.
 */
export function editorToShow(
  drawn: Placement,
  editors: ReadonlyMap<ResourceId, unknown>,
): EditorToShow | undefined {
  for (const resourceId of editors.keys()) {
    const at = drawn.get(resourceId);
    if (at !== undefined) return { resourceId, rect: { x: at.x, y: at.y, ...resourceSize(at) } };
  }
  return undefined;
}

/** What `panToEditor` decides: what the camera now shows, and the pan, if any. */
export interface EditorPan {
  readonly shown: EditorShown | undefined;
  readonly pan?: { readonly x: number; readonly y: number };
}

/**
 * Whether the camera pans to an editor, and by how much (ADR 0178): only when
 * an edit begins or the cap changes, so a resize or a drag of the editor,
 * which changes its rect alone, never pans. `shown` is what the camera showed
 * last; the answer carries what it shows now.
 */
export function panToEditor(
  shown: EditorShown | undefined,
  editor: EditorToShow | undefined,
  cap: ResourceSize | undefined,
  viewport: Viewport,
  area: { readonly width: number; readonly height: number },
): EditorPan {
  if (editor === undefined || cap === undefined) return { shown: undefined };
  if (
    shown?.resourceId === editor.resourceId &&
    shown.cap.width === cap.width &&
    shown.cap.height === cap.height
  )
    return { shown };
  const pan = leastPanToShow(editor.rect, viewport, area);
  const next = { resourceId: editor.resourceId, cap };
  return pan.x === 0 && pan.y === 0 ? { shown: next } : { shown: next, pan };
}

/**
 * Pans the camera the least distance that shows `editor` when an edit begins
 * and when `cap` changes (`panToEditor`). A pan is not an Edit.
 */
export function useKeepEditorInView({
  editor,
  cap,
  area,
  getViewport,
  setViewport,
}: {
  readonly editor: EditorToShow | undefined;
  /** The visible canvas cap, absent while the canvas is not measured. */
  readonly cap: ResourceSize | undefined;
  readonly area: { readonly width: number; readonly height: number };
  readonly getViewport: () => Viewport;
  readonly setViewport: (viewport: Viewport) => Promise<boolean>;
}): void {
  const shown = useRef<EditorShown | undefined>(undefined);
  useEffect(() => {
    const decided = panToEditor(shown.current, editor, cap, getViewport(), area);
    shown.current = decided.shown;
    if (decided.pan === undefined) return;
    const viewport = getViewport();
    void setViewport({
      x: viewport.x + decided.pan.x,
      y: viewport.y + decided.pan.y,
      zoom: viewport.zoom,
    });
  }, [editor, cap, area, getViewport, setViewport]);
}
