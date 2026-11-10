import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
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

/** The text of the asset at a URL, as far as it has been read. */
type Text =
  | { readonly state: 'reading' }
  | { readonly state: 'read'; readonly text: string }
  | { readonly state: 'refused'; readonly refused: string };

const READING: Text = { state: 'reading' };

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
    void readAsset(url).then(async (answer) => {
      if (!stillLive()) return;
      if (answer instanceof Blob) {
        const text = await textOf(answer);
        known.set(url, text);
        if (stillLive()) setRead({ url, text: { state: 'read', text } });
      } else {
        setRead({ url, text: { state: 'refused', refused: answer.refused } });
      }
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
  const mayEdit =
    open &&
    readable !== null &&
    contentCommit !== undefined &&
    store !== undefined &&
    takeClaim !== undefined;

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

  const save = useCallback(() => {
    if (editing === null || editing.saving || readable === null) return;
    if (contentCommit === undefined || store === undefined) return;
    const next = markdownText(editing.draft);
    if (next === readable) {
      end();
      return;
    }
    setEditing({ draft: editing.draft, saving: true });
    const stored = store(new Blob([next], { type: MARKDOWN_MEDIA_TYPE }));
    void stored
      .then((answer) => {
        if (!isStoredAsset(answer)) return answer;
        known.set(answer, next);
        return contentCommit({ url: answer });
      })
      .then((answer) => {
        const refused = refusalOf(answer);
        setRefusal(refused);
        if (refused === null) end();
        else setEditing((now) => (now === null ? now : { draft: now.draft, saving: false }));
      });
  }, [editing, readable, contentCommit, store, known, end]);

  const cancel = useCallback(() => {
    setRefusal(null);
    end();
  }, [end]);

  const commitMap = useCallback(
    (next: MarkdownMapContent, sizeHint?: Size) => {
      if (mapCommit === undefined) return;
      const committed = sizeHint === undefined ? mapCommit(next) : mapCommit(next, { sizeHint });
      void committed.then((answer) => setRefusal(refusalOf(answer)));
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
    const edit: RailCommand[] = mayEdit
      ? [
          {
            kind: 'action',
            id: 'edit',
            label: `Edit Resource ${name}`,
            icon: <Pencil size={14} />,
            run: beginEdit,
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
    beginEdit,
    open,
    commitMap,
  ]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancel();
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.stopPropagation();
      save();
    }
  };

  return (
    <div style={fill} data-open={open} data-editing={editing !== null}>
      <div ref={header} style={{ padding: `${INSET}px ${INSET}px 0` }}>
        <Title />
      </div>
      {open && (
        <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'auto' }}>
          {editing !== null ? (
            <Own>
              <div onKeyDown={onKeyDown} style={{ height: '100%' }}>
                <SourceEditor
                  value={editing.draft}
                  onValueChange={(draft) =>
                    setEditing((now) => (now === null ? now : { draft, saving: now.saving }))
                  }
                  ariaLabel={`Markdown source of ${name}`}
                  autoFocus
                />
              </div>
            </Own>
          ) : text.state === 'refused' ? (
            <p role="note" style={{ margin: 0, padding: INSET, fontSize: 12 }}>
              {`This text cannot be read. ${text.refused}`}
            </p>
          ) : text.state === 'read' ? (
            <>
              <RenderedMarkdown markdown={text.text} drawnName={name} />
              {mayEdit && surface.selected && (
                <Own>
                  <button
                    type="button"
                    aria-label={`Edit Markdown source of ${name}`}
                    tabIndex={-1}
                    onClick={beginEdit}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      opacity: 0,
                      border: 0,
                      background: 'transparent',
                      cursor: 'text',
                    }}
                  />
                </Own>
              )}
            </>
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
