import { useLayoutEffect, useRef, useState } from 'react';
import { COLLAPSED_RESOURCE_SIZE, type ResourceSize } from '@project/core';
import { Button, PresentedResource } from '@project/ui';
import { CanvasResourceNodeSpecimen } from '../support/ReactFlowCanvas';
import { storyText } from '../support/story-assets';

function EditTrial({ initial, overlay }: { initial: string; overlay: boolean }) {
  const [size, setSize] = useState<ResourceSize>(COLLAPSED_RESOURCE_SIZE);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const canvas = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const editing = draft !== null;
  useLayoutEffect(() => {
    if (!editing) return;
    const modal = dialog.current;
    const origin = trigger.current;
    modal?.showModal();
    editor.current?.focus();
    return () => {
      modal?.close();
      origin?.focus();
    };
  }, [editing]);

  const start = () => {
    const rect = canvas.current?.querySelector('.react-flow__node')?.getBoundingClientRect();
    if (!overlay && rect && dialog.current) {
      Object.assign(dialog.current.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
    }
    setPreview(false);
    setDraft(saved);
  };
  const save = () => {
    if (draft !== null) setSaved(draft);
    setDraft(null);
  };
  const name = overlay ? 'Focused overlay' : 'Edit in place';
  const title = 'Ridge walk';
  return (
    <section aria-label={name}>
      <h2 className="mb-2 text-lg font-semibold">{name}</h2>
      <div className="mb-2 flex items-center gap-3">
        <Button ref={trigger} onClick={start}>
          Edit note
        </Button>
        <output>
          {size.width} × {size.height} · {open ? 'Showing content' : 'Title only'}
        </output>
      </div>
      <div ref={canvas}>
        <CanvasResourceNodeSpecimen
          selected
          zoom={1}
          title={title}
          open={open}
          nodeSize={size}
          stageClassName="prototype-markdown-canvas"
          content={{ kind: 'markdown', via: 'self', content: { url: storyText(saved) } }}
          onResize={setSize}
          onOpenChange={(next) => {
            setOpen(next);
            return 'completed';
          }}
        />
      </div>
      <dialog
        ref={dialog}
        className="prototype-markdown-editor"
        data-overlay={overlay}
        aria-label={name + ' — ' + title}
        onCancel={(event) => {
          event.preventDefault();
          setDraft(null);
        }}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            save();
          }
        }}
      >
        {draft !== null && (
          <>
            <div className="flex items-center gap-1 border-b p-1">
              {overlay && (
                <Button size="compact" aria-pressed={preview} onClick={() => setPreview(!preview)}>
                  {preview ? 'Source' : 'Preview'}
                </Button>
              )}
              <Button size="compact" onClick={save}>
                Save
              </Button>
              <Button size="compact" onClick={() => setDraft(null)}>
                Cancel
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {preview ? (
                <PresentedResource
                  title={title}
                  content={{ kind: 'markdown', via: 'self', content: { url: storyText(draft) } }}
                />
              ) : (
                <textarea
                  className="block h-full w-full resize-none p-3 font-mono text-sm"
                  ref={editor}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  aria-label="Markdown source"
                />
              )}
            </div>
          </>
        )}
      </dialog>
    </section>
  );
}

export function EditingComparison({ initial }: { initial: string }) {
  const [round, reset] = useState(0);
  return (
    <main className="p-4">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Button onClick={() => reset(round + 1)}>Reset both notes</Button>
        <p>
          Use the note’s Open or Close control to change its display. Drag its bottom-right corner
          to resize.
        </p>
      </div>
      <div key={round} className="prototype-markdown-trials">
        <EditTrial initial={initial} overlay={false} />
        <EditTrial initial={initial} overlay />
      </div>
    </main>
  );
}
