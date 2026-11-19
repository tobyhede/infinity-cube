import { useRef, useState } from 'react';
import type { Story } from '@ladle/react';
import { z } from 'zod';
import { COLLAPSED_RESOURCE_SIZE, type ResourceSize } from '@project/core';
import { assetRefSchema } from '@project/resource-api/domain';
import type { PluginOperations } from '@project/ui';
import { capSizeHint, visibleCanvasCap } from '#src/visible-canvas-cap';
import { CanvasResourceNodeSpecimen } from '../support/ReactFlowCanvas';
import { storeStoryText, storyText } from '../support/story-assets';
import '../support/inventory.css';
import './markdown-resize-prototype.css';

export default { title: 'Review/Markdown prototype' };

const note = storyText(`## Walking the ridge

Leave the track at the saddle. From here the ridge is wide enough to walk two abreast, and the first cairn is visible against the sky.

At the second cairn, turn east. The creek below is easier to hear than to see. Follow its sound until the path meets the old timber bridge.

### The return route

Cross the bridge and follow the marked trail through the trees. The last clearing gives you a view back to both cairns.`);

const mapContent = z.object({ open: z.boolean() });
const markdownContent = z.object({ url: assetRefSchema });

function Trial({ reveal }: { reveal: boolean }) {
  const frame = useRef<HTMLDivElement>(null);
  const [size, resize] = useState<ResourceSize>(COLLAPSED_RESOURCE_SIZE);
  const sized = useRef(false);
  const [explicitOpen, setOpen] = useState(false);
  const [url, setUrl] = useState(note);
  const [editing, setEditing] = useState(false);
  const open = reveal ? size.height > COLLAPSED_RESOURCE_SIZE.height : explicitOpen;
  const operations: PluginOperations = {
    kind: 'markdown',
    commitMap: (next, options) => {
      if (!reveal) setOpen(mapContent.parse(next).open);
      const hint = options?.sizeHint;
      if (hint && frame.current && (reveal || !sized.current)) {
        sized.current = true;
        const cap = visibleCanvasCap(frame.current.getBoundingClientRect(), 1);
        const wanted = capSizeHint(hint, cap);
        resize((previous) => ({
          width: Math.max(previous.width, wanted.width),
          height: Math.max(previous.height, wanted.height),
        }));
      }
      return Promise.resolve('completed');
    },
    commitContent: (next) => {
      setUrl(markdownContent.parse(next).url);
      return Promise.resolve('completed');
    },
    commitStore: storeStoryText,
    claim: () => {
      setEditing(true);
      return {
        release: () => setEditing(false),
        exclusively: (work) => work({ content: operations.commitContent, store: storeStoryText }),
        unmount: () => undefined,
      };
    },
  };
  const name = reveal ? 'Resize reveals content' : 'Current Open and Edit';
  return (
    <section aria-label={name} data-reveal={reveal}>
      <h2 className="text-lg font-semibold">{name}</h2>
      <p className="mb-3 text-sm">
        {reveal
          ? 'Increase the height to reveal the note. Width alone keeps the title.'
          : 'Open shows the note. Resize changes how much of it fits.'}
      </p>
      <div ref={frame}>
        <CanvasResourceNodeSpecimen
          title="Ridge walk"
          content={{ kind: 'markdown', via: 'self', content: { url } }}
          selected
          zoom={1}
          stageClassName="prototype-markdown-canvas"
          nodeSize={size}
          open={open}
          operations={operations}
          onResize={(next) => {
            sized.current = true;
            resize(
              reveal && editing
                ? { ...next, height: Math.max(next.height, COLLAPSED_RESOURCE_SIZE.height + 1) }
                : next,
            );
          }}
        />
      </div>
      <output className="text-sm">
        {size.width} × {size.height} ·{' '}
        {editing ? 'Editing' : open ? 'Showing Markdown' : 'Title only'}
      </output>
    </section>
  );
}

// Does the author want to choose visibility independently of the Resource's height?
export const Comparison: Story = () => {
  const [round, reset] = useState(0);
  return (
    <main className="p-4">
      <button type="button" className="mb-4 underline" onClick={() => reset(round + 1)}>
        Reset both notes
      </button>
      <div key={round} className="prototype-markdown-trials">
        <Trial reveal={false} />
        <Trial reveal />
      </div>
    </main>
  );
};
