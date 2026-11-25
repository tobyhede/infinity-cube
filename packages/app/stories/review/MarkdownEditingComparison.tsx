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
  readonly editSize: ResourceSize;
  readonly open: boolean;
}
const initialMap = (): MapSettings => ({
  size: COLLAPSED_RESOURCE_SIZE,
  editSize: { width: 640, height: 360 },
  open: false,
});

export function EditingComparison({ initial }: { initial: string }) {
  const name = 'Temporary edit size';
  const [shownMap, setShownMap] = useState<'A' | 'B'>('A');
  const [maps, setMaps] = useState({ A: initialMap(), B: initialMap() });
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
      // A Closed edit first commits Open. That commit and its Claim share the
      // preceding visibility, which is restored when the edit ends.
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
          Map {shownMap} · Canvas {current.size.width} × {current.size.height} · Edit{' '}
          {current.editSize.width} × {current.editSize.height} · {current.open ? 'Full' : 'Title'}
        </output>
      </div>
      <CanvasResourceNodeSpecimen
        selected
        zoom={1}
        title="Ridge walk"
        open={current.open || editing}
        nodeSize={editing ? current.editSize : current.size}
        stageClassName="inv-resource-node-stage--large prototype-markdown-canvas"
        content={{ kind: 'markdown', via: 'self', content: { url } }}
        operations={operations}
        onResize={(size: ResourceSize) => patch(editing ? { editSize: size } : { size })}
      />
    </section>
  );
}
