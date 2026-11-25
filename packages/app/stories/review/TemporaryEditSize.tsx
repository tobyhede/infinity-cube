import { useRef, useState } from 'react';
import { z } from 'zod';
import { COLLAPSED_RESOURCE_SIZE, type ResourceSize } from '@project/core';
import { assetRefSchema } from '@project/resource-api/domain';
import { Button, type PluginOperations } from '@project/ui';
import { CanvasResourceNodeSpecimen } from '../support/ReactFlowCanvas';
import { storyText, storeStoryText } from '../support/story-assets';

const contentSchema = z.object({ url: assetRefSchema });
const mapSchema = z.object({ open: z.boolean() });

interface MapSettings {
  readonly size: ResourceSize;
  /** Absent, the editor draws at `size` (spec.md, The edit size is Map content). */
  readonly editSize?: ResourceSize | undefined;
  readonly open: boolean;
}

// Map A has an edit size remembered and Map B has none, so the story shows
// both the remembered size and the default.
const initialMaps = (): Record<'A' | 'B', MapSettings> => ({
  A: { size: COLLAPSED_RESOURCE_SIZE, editSize: { width: 640, height: 360 }, open: false },
  B: { size: COLLAPSED_RESOURCE_SIZE, open: false },
});

const sizeLabel = (size: ResourceSize) => `${size.width} × ${size.height}`;

/**
 * A stand-in for the interaction spec.md describes, not a model of it. This
 * harness does not show two things the design changes:
 *
 * - The Markdown plugin still commits Open before an Edit from Closed begins
 *   (UI-54; `plugin-markdown/test/markdown-plugin.test.tsx` › "offers Edit
 *   when Closed, which Opens it and then begins editing"), with its size hint
 *   ("Opens with one Map content commit carrying a size hint at least the
 *   reading width"), which `commitMap` here drops. The harness
 *   puts the earlier Open or Closed state back when the Claim is released, a
 *   second commit a real host would count as its own Edit. The spec has Edit
 *   commit nothing (open question 3).
 * - If the text cannot be read, the plugin takes no Claim, so nothing here
 *   restores the earlier state and the Resource stays Open.
 */
export function TemporaryEditSizeSpecimen({ initial }: { initial: string }) {
  const name = 'Temporary edit size';
  const [shownMap, setShownMap] = useState<'A' | 'B'>('A');
  const [maps, setMaps] = useState(initialMaps);
  const current = maps[shownMap];
  const patch = (next: Partial<MapSettings>) =>
    setMaps((previous) => ({ ...previous, [shownMap]: { ...previous[shownMap], ...next } }));
  const [url, setUrl] = useState(() => storyText(initial));
  const [editing, setEditing] = useState(false);
  const beforeOpen = useRef(false);
  const openForEdit = useRef<boolean | null>(null);
  const operations: PluginOperations = {
    kind: 'markdown',
    commitMap: (next) => {
      patch({ open: mapSchema.parse(next).open });
      return Promise.resolve('completed');
    },
    commitContent: (next) => {
      setUrl(contentSchema.parse(next).url);
      return Promise.resolve('completed');
    },
    commitStore: storeStoryText,
    claim: () => {
      // Whatever Open the plugin committed on its way here, the state recorded
      // before the press is the one to put back.
      openForEdit.current = beforeOpen.current;
      setEditing(true);
      return {
        release: () => {
          if (openForEdit.current !== null) patch({ open: openForEdit.current });
          openForEdit.current = null;
          setEditing(false);
        },
        exclusively: (work) => work({ content: operations.commitContent, store: storeStoryText }),
        unmount: () => undefined,
      };
    },
  };
  const editorSize = current.editSize ?? current.size;
  return (
    <section
      className="p-4"
      aria-label={name}
      onPointerDownCapture={() => {
        if (!editing) beforeOpen.current = current.open;
      }}
      onKeyDownCapture={() => {
        if (!editing) beforeOpen.current = current.open;
      }}
    >
      <h2 className="mb-2 text-lg font-semibold">{name}</h2>
      <div className="mb-3 flex items-center gap-3">
        <Button
          disabled={editing}
          onClick={() => {
            const other = shownMap === 'A' ? 'B' : 'A';
            setShownMap(other);
            beforeOpen.current = maps[other].open;
          }}
        >
          Switch Map
        </Button>
        <output>
          Map {shownMap} · Canvas {sizeLabel(current.size)} · Edit{' '}
          {current.editSize === undefined ? 'none (canvas size)' : sizeLabel(current.editSize)} ·{' '}
          {current.open ? 'Open' : 'Closed'}
        </output>
      </div>
      <CanvasResourceNodeSpecimen
        selected
        zoom={1}
        title="Ridge walk"
        open={current.open || editing}
        nodeSize={editing ? editorSize : current.size}
        stageClassName="inv-resource-node-stage--large temporary-edit-size-canvas"
        content={{ kind: 'markdown', via: 'self', content: { url } }}
        operations={operations}
        onResize={(size: ResourceSize) => patch(editing ? { editSize: size } : { size })}
      />
    </section>
  );
}
