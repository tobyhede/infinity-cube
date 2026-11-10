import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { z } from 'zod';
import { Check, Maximize2, Minimize2, Pencil, StickyNote, X } from 'lucide-react';
import {
  isStoredAsset,
  titleName,
  type Answer,
  type AssetRef,
  type Size,
} from '@project/resource-api/domain';
import {
  definePluginView,
  Own,
  Rail,
  RenderedMarkdown,
  SourceEditor,
  Title,
  type Assets,
  type Claim,
  type PluginViewProps,
  type RailCommand,
} from '@project/resource-api/view';
import {
  MARKDOWN_MEDIA_TYPE,
  markdownPlugin,
  markdownText,
  type MarkdownContent,
  type MarkdownMapContent,
} from './domain';

/**
 * The Markdown plugin's view (ADR 0020, ADR 0064, ADR 0142). It draws its
 * Title, and its text once that asset is read, where its Map content says it
 * is Open. Open and Close are its rail commands, and Opening carries a size
 * hint for the text read at a reading width, which the canvas caps, floors or
 * ignores. Editing is its own mode: a Claim, the source editor, a draft, and
 * four ways out (Save, `Mod-Enter`, Cancel, `Escape`), Save storing the text
 * and committing its URL. A click elsewhere leaves the draft up.
 */

/** The width the size hint asks for at least, so a document reads at a line length. */
export const READING_WIDTH = 640;

/** The inset the text is drawn at inside the rect. */
const INSET = 12;

/**
 * The band along the top of the rect the canvas keeps clear of controls, as it
 * does for every Resource it draws: eight pixels, the kind glyph's row, eight
 * pixels. A press there selects the Resource rather than beginning a rename.
 */
const RAIL_BAND = 30;

/** The text of the asset at a URL, as far as it has been read. */
type Text =
  | { readonly state: 'reading' }
  | { readonly state: 'read'; readonly text: string }
  | { readonly state: 'refused'; readonly refused: string };

const READING: Text = { state: 'reading' };

/** What a note says where reading the text failed rather than being refused. */
const UNREAD = 'Reading it failed.';

/** What the status says where a Save failed rather than being refused. */
const UNSAVED = 'The text could not be saved. Your draft is kept; Save again to retry.';

/**
 * Read the text an asset holds, once per URL, starting from text this view
 * already knows. Nothing is read until the text is `wanted`: a Closed
 * Resource draws none of it.
 */
function useText(url: AssetRef, assets: Assets, known: Map<string, string>, wanted: boolean): Text {
  const [read, setRead] = useState<{ readonly url: string; readonly text: Text }>(() => ({
    url,
    text: READING,
  }));
  const readAsset = assets.read;
  useEffect(() => {
    if (!wanted || known.has(url)) return undefined;
    let live = true;
    const stillLive = (): boolean => live;
    void readAsset(url)
      .then(async (answer) => {
        if (!stillLive()) return;
        if (answer instanceof Blob) {
          const text = await textOf(answer);
          known.set(url, text);
          if (stillLive()) setRead({ url, text: { state: 'read', text } });
        } else {
          setRead({ url, text: { state: 'refused', refused: answer.refused } });
        }
      })
      // A read that fails outright, as a network failure or a timeout does,
      // is refused like any other: the text is drawn as a note, never awaited.
      .catch(() => {
        if (stillLive()) setRead({ url, text: { state: 'refused', refused: UNREAD } });
      });
    return () => {
      live = false;
    };
  }, [url, readAsset, known, wanted]);
  const already = textKnown(known, url);
  if (already.state === 'read') return already;
  return read.url === url ? read.text : READING;
}

/** What a reader asked for text answers. */
const readText = z.string();

/** A Blob's bytes as UTF-8 text. */
const textOf = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(readText.parse(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('The text could not be read.'));
    reader.readAsText(blob);
  });

const textKnown = (known: Map<string, string>, url: string): Text => {
  const text = known.get(url);
  return text === undefined ? READING : { state: 'read', text };
};

/** Whether a settled commit or store left the author's work where it was. */
const refusalOf = (answer: Answer): string | null =>
  answer === 'completed' || answer === 'unchanged' ? null : answer.refused;

/** A running edit: the draft, and whether a Save is under way. */
interface Editing {
  readonly draft: string;
  readonly saving: boolean;
}

const fill: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
};

/**
 * A Markdown Resource: its Title, its text where Open, and the source editor
 * while it is being edited.
 */
function MarkdownView({ surface }: PluginViewProps<MarkdownContent, MarkdownMapContent>) {
  const name = titleName(surface.title.value);
  const url = surface.content.value.url;
  const [known] = useState(() => new Map<string, string>());
  const open = surface.map.value.open;
  const [measuring, setMeasuring] = useState(false);
  const text = useText(url, surface.assets, known, open || measuring);
  const mapCommit = surface.map.commit;
  const contentCommit = surface.content.commit;
  const store = surface.assets.store;
  const takeClaim = surface.claim;
  const [refusal, setRefusal] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const claim = useRef<Claim | null>(null);
  const header = useRef<HTMLDivElement | null>(null);

  const release = useCallback(() => {
    claim.current?.release();
    claim.current = null;
  }, []);
  // Every way an edit ends releases its Claim, and an unmounted view holds
  // nothing; the host releases its Claims too.
  useEffect(() => {
    if (editing === null) release();
  }, [editing, release]);
  useEffect(() => release, [release]);

  const readable = text.state === 'read' ? text.text : null;
  const mayAuthor = contentCommit !== undefined && store !== undefined && takeClaim !== undefined;
  const mayEdit = open && readable !== null && mayAuthor;
  // Edit on a Closed Resource Opens it and then begins editing (ADR 0064):
  // what it Opens to is read only once it is Open, so the text decides then.
  const mayEditClosed = !open && mayAuthor && mapCommit !== undefined;
  const editWhenOpen = useRef(false);

  const beginEdit = useCallback(() => {
    if (!mayEdit || editing !== null) return;
    const held = takeClaim();
    if (held === undefined) return;
    claim.current = held;
    setRefusal(null);
    setEditing({ draft: readable, saving: false });
  }, [mayEdit, editing, takeClaim, readable]);

  const end = useCallback(() => setEditing(null), []);

  // A Resource Closed elsewhere while its draft was up has nowhere to draw it.
  if (editing !== null && !open) setEditing(null);

  // An Edit asked for while Closed begins once the Open it caused has landed
  // and the text is read, and is dropped where the text cannot be read.
  useEffect(() => {
    if (text.state === 'refused') editWhenOpen.current = false;
    if (!editWhenOpen.current || !open || text.state !== 'read') return;
    editWhenOpen.current = false;
    beginEdit();
  }, [open, text.state, beginEdit]);

  const save = useCallback(() => {
    if (editing === null || editing.saving || readable === null) return;
    if (contentCommit === undefined || store === undefined) return;
    const next = markdownText(editing.draft);
    if (next === readable) {
      end();
      return;
    }
    const saved = editing.draft;
    setEditing({ draft: saved, saving: true });
    // The editor stays live while a Save runs: text typed meanwhile is a new
    // draft, which a Save that lands leaves up rather than discarding.
    const settle = (refused: string | null): void => {
      setRefusal(refused);
      setEditing((now) =>
        now === null || (refused === null && now.draft === saved)
          ? null
          : { draft: now.draft, saving: false },
      );
    };
    void store(new Blob([next], { type: MARKDOWN_MEDIA_TYPE }))
      .then((answer) => {
        if (!isStoredAsset(answer)) return answer;
        known.set(answer, next);
        return contentCommit({ url: answer });
      })
      .then(
        (answer) => settle(refusalOf(answer)),
        // A store or commit that fails outright, as a network failure, a
        // server error or a timeout does, keeps the draft and Save, to retry.
        () => settle(UNSAVED),
      );
  }, [editing, readable, contentCommit, store, known, end]);

  const cancel = useCallback(() => {
    setRefusal(null);
    end();
  }, [end]);

  const commitMap = useCallback(
    (next: MarkdownMapContent, sizeHint?: Size) => {
      if (mapCommit === undefined) return;
      const committed = sizeHint === undefined ? mapCommit(next) : mapCommit(next, { sizeHint });
      void committed.then(
        (answer) => {
          const refused = refusalOf(answer);
          setRefusal(refused);
          if (refused !== null) editWhenOpen.current = false;
        },
        () => {
          editWhenOpen.current = false;
        },
      );
    },
    [mapCommit],
  );

  // Opening measures the text at a reading width first, once it is read, then
  // commits Open with what it measured as one size hint: asked once, for this
  // gesture. Text that cannot be read has no size to hint at. The measurer
  // measures as it is attached, and is drawn only until then.
  const measure = (element: HTMLDivElement | null): void => {
    if (element === null || !measuring) return;
    setMeasuring(false);
    if (text.state !== 'read') {
      commitMap({ open: true });
      return;
    }
    const width = Math.max(surface.size.width, READING_WIDTH);
    const height = (header.current?.offsetHeight ?? 0) + element.scrollHeight + 2 * INSET;
    commitMap({ open: true }, { width: Math.round(width), height: Math.round(height) });
  };

  const commands = useMemo((): readonly RailCommand[] => {
    if (editing !== null) {
      return [
        ...(contentCommit === undefined || store === undefined
          ? []
          : [
              {
                kind: 'action' as const,
                id: 'save',
                label: `Save Resource ${name}`,
                icon: <Check size={14} />,
                run: save,
                disabled: editing.saving,
                keyshortcuts: 'Meta+Enter Control+Enter',
              },
            ]),
        {
          kind: 'action',
          id: 'cancel',
          label: `Cancel editing Resource ${name}`,
          icon: <X size={14} strokeWidth={3} />,
          run: cancel,
          disabled: editing.saving,
          keyshortcuts: 'Escape',
        },
        ...(mapCommit === undefined
          ? []
          : [
              {
                kind: 'action' as const,
                id: 'close',
                label: `Close Resource ${name}`,
                icon: <Minimize2 size={14} />,
                run: () => undefined,
                // Closing mid-edit would take the draft's box away; the
                // control keeps its place and says it is unavailable.
                disabled: true,
              },
            ]),
      ];
    }
    const edit: RailCommand[] =
      mayEdit || mayEditClosed
        ? [
            {
              kind: 'action',
              id: 'edit',
              label: `Edit Resource ${name}`,
              icon: <Pencil size={14} />,
              run: mayEdit
                ? beginEdit
                : () => {
                    editWhenOpen.current = true;
                    setMeasuring(true);
                  },
            },
          ]
        : [];
    if (mapCommit === undefined) return edit;
    return [
      ...edit,
      open
        ? {
            kind: 'action',
            id: 'close',
            label: `Close Resource ${name}`,
            icon: <Minimize2 size={14} />,
            run: () => commitMap({ open: false }),
          }
        : {
            kind: 'action',
            id: 'open',
            label: `Open Resource ${name}`,
            icon: <Maximize2 size={14} />,
            run: () => setMeasuring(true),
          },
    ];
  }, [
    editing,
    contentCommit,
    store,
    name,
    save,
    cancel,
    mapCommit,
    mayEdit,
    mayEditClosed,
    beginEdit,
    open,
    commitMap,
  ]);

  // Like the disabled Cancel, Escape waits for a Save under way: a Save that
  // is refused leaves its draft up.
  const escape = (): void => {
    if (editing?.saving !== true) cancel();
  };

  return (
    <div
      // Closed, the Title sits at the foot of the rect, as every Closed
      // Resource's does.
      style={open ? fill : { ...fill, justifyContent: 'flex-end' }}
      data-open={open}
      data-editing={editing !== null}
    >
      <div
        ref={header}
        style={{ padding: `${RAIL_BAND}px ${INSET}px ${open ? 0 : 8}px`, minHeight: 0 }}
      >
        <Title />
      </div>
      {open && (
        <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'auto' }}>
          {editing !== null ? (
            <Own>
              <SourceEditor
                value={editing.draft}
                onValueChange={(draft) =>
                  setEditing((now) => (now === null ? now : { draft, saving: now.saving }))
                }
                ariaLabel={`Markdown source of ${name}`}
                autoFocus
                onSave={save}
                onCancel={escape}
              />
            </Own>
          ) : text.state === 'refused' ? (
            <p role="note" style={{ margin: 0, padding: INSET, fontSize: 12 }}>
              {`This text cannot be read. ${text.refused}`}
            </p>
          ) : text.state === 'read' ? (
            <RenderedMarkdown
              markdown={text.text}
              drawnName={name}
              edit={
                mayEdit && surface.selected
                  ? { label: `Edit Markdown source of ${name}`, begin: beginEdit }
                  : undefined
              }
            />
          ) : null}
        </div>
      )}
      {refusal !== null && (
        <p role="status" style={{ margin: 0, padding: `0 ${INSET}px`, fontSize: 12 }}>
          {refusal}
        </p>
      )}
      {measuring && text.state !== 'reading' && (
        <div
          ref={measure}
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: Math.max(surface.size.width, READING_WIDTH),
            visibility: 'hidden',
            pointerEvents: 'none',
          }}
        >
          {readable !== null && <RenderedMarkdown markdown={readable} drawnName={name} />}
        </div>
      )}
      <Rail commands={commands} />
    </div>
  );
}

/** The Markdown glyph. */
function MarkdownGlyph({ size = 14 }: { readonly size?: number | undefined }) {
  return <StickyNote size={size} />;
}

export const markdownPluginView = definePluginView(markdownPlugin, {
  View: MarkdownView,
  Glyph: MarkdownGlyph,
});
