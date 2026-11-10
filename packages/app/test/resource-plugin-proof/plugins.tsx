/**
 * THROWAWAY (issue 01): four plugins written only against `./api`, importing
 * nothing else of the application, as a bundled plugin must (ADR 0142).
 */
import { useEffect, useState } from 'react';
import type { SpaceView } from '@project/core';
import type { Answer, AssetRef, Claim, PluginView, Size, Surface } from './api';
import { blobText } from './api';

const said = (answer: Answer | 'busy' | undefined): string | null =>
  answer === undefined || typeof answer === 'string' ? null : answer.refused;

// ---------------------------------------------------------------- Image
export interface ImageContent {
  url: AssetRef | `https://${string}`;
  naturalSize?: Size;
}
type Empty = Record<string, never>;

function ImageView({ surface }: { surface: Surface<ImageContent, Empty> }) {
  const [note, setNote] = useState<string | null>(null);
  const { content, title, claim, assets } = surface;
  // Replace is offered exactly when the surface offers what it needs: a content
  // commit, a Claim, a picker and a store. No surface name is consulted.
  const canReplace =
    content.commit !== undefined && claim !== undefined && assets.pick !== undefined;
  const replace = () => {
    // In the press: the picker opens before any await.
    const picking = assets.pick?.('image/*');
    if (picking === undefined) return;
    void picking.then(async (files) => {
      const [file] = files;
      if (file === undefined) return;
      const held = surface.claim?.();
      if (held === undefined) return setNote('claim-unavailable');
      const answer = await held.exclusively(async (own) => {
        const stored = await own.store?.(file);
        if (stored === undefined) return { refused: 'store withdrawn' };
        if (typeof stored !== 'string') return stored;
        return (await own.content?.({ url: stored })) ?? { refused: 'content withdrawn' };
      });
      held.release();
      setNote(answer === 'busy' ? 'busy' : said(answer));
    });
  };
  return (
    <figure data-testid={`image:${surface.resource.id}`}>
      <img alt={title.value} src={assets.url(content.value.url)} />
      {canReplace ? (
        <button type="button" onClick={replace}>
          Replace
        </button>
      ) : null}
      {note === null ? null : <p role="status">{note}</p>}
    </figure>
  );
}
export const imagePlugin: PluginView<ImageContent, Empty> = {
  kind: 'image',
  mapContent: { default: {} },
  View: ImageView,
  creates: {
    from: 'dock',
    run: (host) => {
      const picking = host.assets.pick?.('image/*');
      if (picking === undefined) return;
      return picking.then(async (files) => {
        const items = [];
        for (const file of files) {
          const ref = await host.assets.store?.(file);
          if (typeof ref !== 'string') return;
          items.push({ content: { url: ref } });
        }
        await host.create(items);
      });
    },
  },
};

// ---------------------------------------------------------------- Reference
interface ReferenceContent {
  target: string;
}
interface OpenMap {
  open: boolean;
}
function ReferenceView({ surface }: { surface: Surface<ReferenceContent, OpenMap> }) {
  const { Embed } = surface;
  // The Reference passes its own Title, with its own rename, to the Target.
  return <Embed resource={surface.content.value.target} title={surface.title} />;
}
export const referencePlugin: PluginView<ReferenceContent, OpenMap> = {
  kind: 'reference',
  mapContent: { default: { open: false }, withoutMap: { open: true } },
  View: ReferenceView,
};

// ---------------------------------------------------------------- Space
function SpaceView_({ surface }: { surface: Surface<SpaceView, OpenMap> }) {
  const [entered, setEntered] = useState<Claim | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const { Embed, map, title } = surface;
  return (
    <section data-testid={`space:${surface.resource.id}`}>
      <h3>{title.value}</h3>
      {map.commit === undefined ? null : (
        <button
          type="button"
          onClick={() => void map.commit?.({ open: !map.value.open }).then((a) => setNote(said(a)))}
        >
          {map.value.open ? 'Close' : 'Open'}
        </button>
      )}
      {surface.claim === undefined || entered !== null ? null : (
        <button type="button" onClick={() => setEntered(surface.claim?.() ?? null)}>
          Enter
        </button>
      )}
      {entered === null ? null : (
        <button type="button" onClick={() => entered.release() && setEntered(null)}>
          Leave
        </button>
      )}
      {map.value.open ? (
        entered === null ? (
          <Embed map={surface.content.value} />
        ) : (
          <Embed map={surface.content.value} claim={entered} />
        )
      ) : null}
      {note === null ? null : <p role="status">{note}</p>}
    </section>
  );
}
export const spacePlugin: PluginView<SpaceView, OpenMap> = {
  kind: 'space',
  mapContent: { default: { open: false }, withoutMap: { open: true } },
  View: SpaceView_,
  creates: {
    from: 'dock',
    run: (host) =>
      void host.create([
        {
          newSpace: true,
          content: (s) => ({ spaceId: s.spaceId, map: s.map, graph: s.graph }),
        },
      ]),
  },
};

// ---------------------------------------------------------------- Markdown
interface MarkdownContent {
  text: AssetRef;
}
/** What the plugin asks for on Open: a reading width, and a line height per line of text. */
export const READING = { width: 640, line: 24, chrome: 56 };
export const hintFor = (text: string): Size => ({
  width: READING.width,
  height: READING.chrome + READING.line * Math.max(1, text.split('\n').length),
});

function MarkdownView({ surface }: { surface: Surface<MarkdownContent, OpenMap> }) {
  const [text, setText] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const { assets, content, map, title } = surface;
  useEffect(() => {
    let live = true;
    void assets.read(content.value.text).then(async (read) => {
      if (!live) return;
      if (read instanceof Blob) {
        const decoded = await blobText(read);
        if (live) setText(decoded);
      } else setNote(read.refused);
    });
    return () => {
      live = false;
    };
  }, [assets, content.value.text]);
  const open = async () => {
    // Reads before committing Open, and carries the hint on that one commit.
    const read = text ?? (await assets.read(content.value.text).then((b) => (b instanceof Blob ? blobText(b) : '')));
    setNote(said(await map.commit?.({ open: true }, { sizeHint: hintFor(read) })));
  };
  return (
    <article data-testid={`markdown:${surface.resource.id}`}>
      <h3>{title.value}</h3>
      {map.value.open ? (
        <pre data-testid="body">{text ?? ''}</pre>
      ) : map.commit === undefined ? null : (
        <button type="button" onClick={() => void open()}>
          Open
        </button>
      )}
      {note === null ? null : <p role="status">{note}</p>}
    </article>
  );
}
export const markdownPlugin: PluginView<MarkdownContent, OpenMap> = {
  kind: 'markdown',
  mapContent: { default: { open: false }, withoutMap: { open: true } },
  View: MarkdownView,
};

export const plugins = [imagePlugin, referencePlugin, spacePlugin, markdownPlugin];
