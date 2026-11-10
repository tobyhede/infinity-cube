import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { z } from 'zod';
import { Check, Maximize2, Minimize2, Pencil, StickyNote, X } from 'lucide-react';
import {
  isStoredAsset,
  lineFeedText,
  titleName,
  type AssetRef,
  type Size,
} from '@project/resource-api/domain';
import {
  definePluginView,
  Own,
  Rail,
  refusalOf,
  RenderedMarkdown,
  SourceEditor,
  Title,
  useRailBand,
  type Assets,
  type Claim,
  type Creation,
  type PluginViewProps,
  type RailCommand,
} from '@project/resource-api/view';
import {
  MARKDOWN_MEDIA_TYPE,
  markdownPlugin,
  type MarkdownContent,
  type MarkdownMapContent,
} from './domain';

/**
 * The Markdown plugin's view (ADR 0020, ADR 0064, ADR 0142). It draws its
 * Title, and its text once that asset is read, where its Map content says it
 * is Open. Open and Close are its rail commands, and Opening carries a size
 * hint for the text read at a reading width, once its images and fonts have
 * loaded. Editing is its own mode: a Claim, the source editor, a draft, and
 * four ways out (Save, `Mod-Enter`, Cancel, `Escape`), Save storing the text
 * and committing its URL. A click elsewhere leaves the draft up.
 */

/** The width the size hint asks for at least, so a document reads at a line length. */
export const READING_WIDTH = 640;

/** The inset the text is drawn at inside the rect. */
const INSET = 12;

/** The room a Closed Title keeps below it, which an Open one does not. */
const CLOSED_FOOT = 8;

/** How long Opening waits for the text's images to load before measuring without them. */
const LOAD_WAIT = 2000;

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

/** What the status says where Edit was pressed while Closed and the text it Opened to cannot be read. */
const UNEDITABLE = 'This text cannot be read, so it cannot be edited.';

/**
 * Read the text an asset holds, once per URL, starting from text this view
 * already knows. Nothing is read until the text is `wanted`: a Closed
 * Resource draws none of it.
 */
function useText(url: AssetRef, assets: Assets, known: KnownText, wanted: boolean): Text {
  const [read, setRead] = useState<{ readonly url: string; readonly text: Text }>(() => ({
    url,
    text: READING,
  }));
  const readAsset = assets.read;
  // A refusal answers the read that was wanted: once the text is not wanted,
  // the next time it is reads again rather than answering with that refusal.
  if (!wanted && read.text.state === 'refused') setRead({ url, text: READING });
  useEffect(() => {
    if (!wanted || known.text(url) !== undefined) return undefined;
    let live = true;
    const stillLive = (): boolean => live;
    void readAsset(url)
      .then(async (answer) => {
        if (!stillLive()) return;
        if (answer instanceof Blob) {
          const text = await textOf(answer);
          known.remember(url, text);
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
  const already = known.text(url);
  if (already !== undefined) return { state: 'read', text: already };
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

/** The one text a view knows, so a view that Saves many times holds one. */
interface KnownText {
  /** The text known at `url`, if it is the one known. */
  readonly text: (url: string) => string | undefined;
  /** Know `text` at `url`, in place of the text known before. */
  readonly remember: (url: string, text: string) => void;
}

const createKnownText = (): KnownText => {
  let known: { readonly url: string; readonly text: string } | null = null;
  return {
    text: (url) => (known?.url === url ? known.text : undefined),
    remember: (url, text) => {
      known = { url, text };
    },
  };
};

/**
 * Resolve once every image in `element` has loaded or failed, and the fonts
 * it is set in are ready, or after {@link LOAD_WAIT}, whichever is first.
 * Its listeners and timer go when `signal` aborts, and the timer when it
 * resolves.
 */
const laidOut = (element: HTMLElement, signal: AbortSignal): Promise<void> => {
  const pending = [...element.querySelectorAll('img')]
    .filter((image) => !image.complete)
    .map(
      (image) =>
        new Promise<void>((resolve) => {
          image.addEventListener('load', () => resolve(), { once: true, signal });
          image.addEventListener('error', () => resolve(), { once: true, signal });
        }),
    );
  // A document without a font loading interface, as jsdom's, has no fonts to wait for.
  const document: Partial<Pick<Document, 'fonts'>> = element.ownerDocument;
  if (document.fonts !== undefined) pending.push(document.fonts.ready.then(() => undefined));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => clearTimeout(timer);
  signal.addEventListener('abort', stop, { once: true });
  return Promise.race([
    Promise.all(pending).then(() => undefined),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, LOAD_WAIT);
    }),
  ]).finally(stop);
};

/**
 * A running edit: the draft, the text it is measured against, which is the
 * text the edit began from or last Saved, and whether a Save is under way.
 */
interface Editing {
  readonly draft: string;
  readonly base: string;
  readonly saving: boolean;
}

/**
 * The view fills its rect at least, in flow, so text longer than the rect
 * grows past it, for the surface to clip or scroll. A running edit keeps to
 * the rect, where the source editor scrolls.
 */
const fill: CSSProperties = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100%',
};

/**
 * A Markdown Resource: its Title, its text where Open, and the source editor
 * while it is being edited.
 */
function MarkdownView({ surface }: PluginViewProps<MarkdownContent, MarkdownMapContent>) {
  const name = titleName(surface.title.value);
  const url = surface.content.value.url;
  const [known] = useState(createKnownText);
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
  const measurer = useRef<HTMLDivElement | null>(null);
  const railBand = useRailBand();

  // A release is asked once: the host completes one asked during exclusive
  // work or an inner Claim when that ends.
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
    // Measured as Save stores it, so a text stored with other line endings
    // is unchanged until its draft is.
    setEditing({ draft: readable, base: lineFeedText(readable), saving: false });
  }, [mayEdit, editing, takeClaim, readable]);

  const end = useCallback(() => setEditing(null), []);

  // A Resource Closed elsewhere while its draft was up has nowhere to draw it.
  if (editing !== null && !open) setEditing(null);

  // An Edit asked for while Closed begins once the Open it caused has landed
  // and the text is read, and where the text cannot be read says it cannot.
  useEffect(() => {
    if (text.state === 'refused' && editWhenOpen.current) {
      editWhenOpen.current = false;
      setRefusal(UNEDITABLE);
    }
    if (!editWhenOpen.current || !open || text.state !== 'read') return;
    editWhenOpen.current = false;
    beginEdit();
  }, [open, text.state, beginEdit]);

  const save = useCallback(() => {
    if (editing === null || editing.saving) return;
    if (contentCommit === undefined || store === undefined) return;
    const next = lineFeedText(editing.draft);
    if (next === editing.base) {
      end();
      return;
    }
    const saved = editing.draft;
    setEditing({ draft: saved, base: editing.base, saving: true });
    // The editor stays live while a Save runs: text typed meanwhile is a new
    // draft, which a Save that lands leaves up rather than discarding.
    const settle = (refused: string | null): void => {
      setRefusal(refused);
      setEditing((now) =>
        now === null || (refused === null && now.draft === saved)
          ? null
          : { draft: now.draft, base: refused === null ? next : now.base, saving: false },
      );
    };
    void store(new Blob([next], { type: MARKDOWN_MEDIA_TYPE }))
      .then((answer) => {
        if (!isStoredAsset(answer)) return answer;
        known.remember(answer, next);
        return contentCommit({ url: answer });
      })
      .then(
        (answer) => settle(refusalOf(answer)),
        // A store or commit that fails outright, as a network failure, a
        // server error or a timeout does, keeps the draft and Save, to retry.
        () => settle(UNSAVED),
      );
  }, [editing, contentCommit, store, known, end]);

  const cancel = useCallback(() => {
    setRefusal(null);
    end();
  }, [end]);

  const commitMap = useCallback(
    (next: MarkdownMapContent, sizeHint?: Size) => {
      if (mapCommit === undefined) return;
      const committed = sizeHint === undefined ? mapCommit(next) : mapCommit(next, { sizeHint });
      // What an earlier gesture was refused is cleared by the next press, not
      // by this answer, which may land after an Edit from Closed is answered.
      void committed.then(
        (answer) => {
          const refused = refusalOf(answer);
          if (refused === null) return;
          setRefusal(refused);
          editWhenOpen.current = false;
        },
        () => {
          editWhenOpen.current = false;
        },
      );
    },
    [mapCommit],
  );

  // Opening measures the text at a reading width first, once it is read and
  // its images and fonts have loaded, then commits Open with what it measured
  // as one size hint: asked once, for this gesture. Text that cannot be read
  // has no size to hint at. The measurer is drawn only until it has measured.
  const width = Math.max(surface.size.width, READING_WIDTH);
  const opening = useRef({ commitMap, width });
  useEffect(() => {
    opening.current = { commitMap, width };
  }, [commitMap, width]);
  const textState = text.state;
  useEffect(() => {
    if (!measuring || textState === 'reading') return undefined;
    const element = measurer.current;
    const measured = new AbortController();
    const { signal } = measured;
    void (element === null ? Promise.resolve() : laidOut(element, signal)).then(() => {
      if (signal.aborted) return;
      setMeasuring(false);
      const now = opening.current;
      if (textState !== 'read' || element === null) {
        now.commitMap({ open: true });
        return;
      }
      // The measurer draws the Title as an Open one is drawn, above the text,
      // both at the width the hint asks for.
      const height = element.scrollHeight + 2 * INSET;
      now.commitMap({ open: true }, { width: Math.round(now.width), height: Math.round(height) });
    });
    return () => measured.abort();
  }, [measuring, textState]);

  const commands = useMemo((): readonly RailCommand[] => {
    // Open and Close are one command whose name swaps, so a keyboard author's
    // focus stays on it across both.
    const openClose = (opens: boolean) =>
      ({
        kind: 'action',
        id: 'open-close',
        label: `${opens ? 'Open' : 'Close'} Resource ${name}`,
        icon: opens ? <Maximize2 size={14} /> : <Minimize2 size={14} />,
      }) as const;
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
        // Closing mid-edit would take the draft's box away; the control keeps
        // its place and says it is unavailable.
        ...(mapCommit === undefined
          ? []
          : [{ ...openClose(false), run: () => undefined, disabled: true }]),
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
                    setRefusal(null);
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
            ...openClose(false),
            run: () => {
              setRefusal(null);
              commitMap({ open: false });
            },
          }
        : {
            ...openClose(true),
            run: () => {
              setRefusal(null);
              setMeasuring(true);
            },
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
      style={
        !open
          ? { ...fill, height: '100%', justifyContent: 'flex-end' }
          : editing !== null
            ? { ...fill, height: '100%' }
            : fill
      }
      data-open={open}
      data-editing={editing !== null}
    >
      <div
        style={{ padding: `${railBand}px ${INSET}px ${open ? 0 : CLOSED_FOOT}px`, minHeight: 0 }}
      >
        <Title />
      </div>
      {!open && (
        // The kind glyph sits in the band along the top, at its right, as
        // every Closed Resource's does; an Open one draws none.
        <span
          role="img"
          aria-label={markdownPlugin.name}
          style={{ position: 'absolute', top: 8, right: 8, display: 'flex' }}
        >
          <MarkdownGlyph />
        </span>
      )}
      {open && (
        <div
          style={{
            position: 'relative',
            flex: 1,
            minHeight: editing === null ? undefined : 0,
            overflow: editing === null ? undefined : 'hidden',
          }}
        >
          {editing !== null ? (
            <Own>
              <SourceEditor
                value={editing.draft}
                onValueChange={(draft) =>
                  setEditing((now) => (now === null ? now : { ...now, draft }))
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
        <p role="alert" style={{ margin: 0, padding: `0 ${INSET}px`, fontSize: 12 }}>
          {refusal}
        </p>
      )}
      {measuring && text.state !== 'reading' && (
        <div
          ref={measurer}
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width,
            visibility: 'hidden',
            pointerEvents: 'none',
          }}
        >
          <div style={{ padding: `${railBand}px ${INSET}px 0` }}>
            <Title />
          </div>
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

/**
 * Create Markdown Resource: one press on the Command Dock, the empty text,
 * which names the asset of zero bytes and so stores nothing; the host places it
 * and continues into its Title.
 */
const createFromDock: Creation<MarkdownContent> = {
  from: 'dock',
  run: async (host) => {
    await host.create([{ content: markdownPlugin.newContent }]);
  },
};

export const markdownPluginView = definePluginView(markdownPlugin, {
  View: MarkdownView,
  Glyph: MarkdownGlyph,
  creates: [createFromDock],
});
