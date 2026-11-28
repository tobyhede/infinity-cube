import { useMemo, useState } from 'react';
import { useReactFlow, useStore } from '@xyflow/react';
import type { MapPosition } from '@project/core';
import type { EmbeddedBounds } from './embedded-map';
import type { CanvasRendering } from './canvas-rendering';
import {
  editorToShow,
  panToEditor,
  useKeepEditorInView,
  type EditorShown,
} from './keep-editor-in-view';
import { visibleCanvasCap } from './visible-canvas-cap';

interface Camera {
  readonly offset: MapPosition;
  readonly zoom: number;
}

const ORIGIN = { x: 0, y: 0 };

/** Embedded zoom scales positions. React Flow draws each child at its own width and height. */
export function useEmbeddedEditorCamera(
  bounds: EmbeddedBounds,
  absolute: MapPosition,
  authored: Camera,
  rendering: Pick<CanvasRendering, 'drawnPlacement' | 'editors' | 'editorCap'>,
) {
  const zoom = useStore((flow) => flow.transform[2]);
  const width = useStore((flow) => flow.width);
  const height = useStore((flow) => flow.height);
  const { getViewport, setViewport } = useReactFlow();
  const windowWidth = (bounds.right - bounds.left) * zoom;
  const windowHeight = (bounds.bottom - bounds.top) * zoom;
  const cap = useMemo(
    () =>
      width > 0 && height > 0 && windowWidth > 0 && windowHeight > 0
        ? visibleCanvasCap(
            { width: Math.min(width, windowWidth), height: Math.min(height, windowHeight) },
            zoom,
          )
        : undefined,
    [width, height, windowWidth, windowHeight, zoom],
  );
  const editing = editorToShow(rendering.drawnPlacement, rendering.editors);
  const editor = editing && {
    resourceId: editing.resourceId,
    rect: {
      ...editing.rect,
      x: editing.rect.x * authored.zoom + authored.offset.x,
      y: editing.rect.y * authored.zoom + authored.offset.y,
    },
  };
  const [local, setLocal] = useState<{ shown: EditorShown | undefined; offset: MapPosition }>({
    shown: undefined,
    offset: ORIGIN,
  });
  const pan = panToEditor(
    local.shown,
    editor,
    rendering.editorCap,
    {
      x: -bounds.left * zoom,
      y: -bounds.top * zoom,
      zoom,
    },
    { width: windowWidth, height: windowHeight },
  );
  if (pan.shown !== local.shown) {
    setLocal({
      shown: pan.shown,
      offset: pan.pan ? { x: pan.pan.x / zoom, y: pan.pan.y / zoom } : ORIGIN,
    });
  }
  const camera = useMemo(
    () => ({
      zoom: authored.zoom,
      offset: { x: authored.offset.x + local.offset.x, y: authored.offset.y + local.offset.y },
    }),
    [authored, local.offset],
  );
  useKeepEditorInView({
    editor: editor && {
      resourceId: editor.resourceId,
      rect: {
        ...editor.rect,
        x: absolute.x + local.offset.x + editor.rect.x,
        y: absolute.y + local.offset.y + editor.rect.y,
      },
    },
    cap: rendering.editorCap,
    area: { width, height },
    getViewport,
    setViewport,
  });
  return { camera, cap };
}
