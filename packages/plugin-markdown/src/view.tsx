import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { z } from 'zod';
import { Check, Pencil, StickyNote, X } from 'lucide-react';
import {
  isStoredAsset,
  lineFeedText,
  titleName,
  type AssetRef,
  type ResourceId,
  type Size,
} from '@project/resource-api/domain';
import {
  CloseIcon,
  definePluginView,
  OpenIcon,
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
 * is Open. Open and Close are its rail commands, each one Map content commit
 * that changes no size (ADR 0178). Editing is its own mode: a Claim, the source editor, a draft, and
 * four ways out (Save, `Mod-Enter`, Cancel, `Escape`), Save storing the text
 * and committing its URL. A click elsewhere leaves the draft up.
 */

/** The inset the text is drawn at inside the rect. */
const INSET = 12;

/** The room a Closed Title keeps below it, which an Open one does not. */
const CLOSED_FOOT = 8;

/** The text of the asset at a URL, as far as it has been read. */
type TextAnswer =
  | { readonly state: 'read'; readonly text: string }
  | { readonly state: 'refused'; readonly refused: string };

type Text = TextAnswer | { readonly state: 'reading' };

const READING: Text = { state: 'reading' };

/** What a note says where reading the text failed rather than being refused. */
const UNREAD = 'Reading it failed.';

/** What the status says where a Save failed rather than being refused. */
const UNSAVED = 'The text could not be saved. Your draft is kept; Save again to retry.';

/** The refusal when Edit cannot read the source of a Closed Resource. */
const UNEDITABLE = 'This text cannot be read, so it cannot be edited.';

/**
 * Read the text an asset holds, once per URL, starting from text this view
 * already knows. Nothing is read until the text is `wanted`: a Closed
 * Resource draws none of it.
 */
function useText(
  url: AssetRef,
  assets: Assets,
  known: KnownText,
  open: boolean,
  answerEdit?: (answer: TextAnswer) => void,
): Text {
  const wanted = open || answerEdit !== undefined;
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
    const finish = (text: TextAnswer): void => {
      if (!live) return;
      if (text.state === 'read') known.remember(url, text.text);
      setRead({ url, text });
      answerEdit?.(text);
    };
    void readAsset(url)
      .then(async (answer): Promise<TextAnswer> =>
        answer instanceof Blob
          ? { state: 'read', text: await textOf(answer) }
          : { state: 'refused', refused: answer.refused },
      )
      .then(finish, () => finish({ state: 'refused', refused: UNREAD }));
    return () => {
      live = false;
    };
  }, [url, readAsset, known, wanted, answerEdit]);
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
 * Size a source editor with a Title row above it. The plugin's root fills
 * the inside of the Resource frame. Measure its Title at the width the
 * source needs, before the canvas changes the Resource's rect.
 */
function editorSizeWithTitle(source: Size, titleRow: HTMLElement | null, rect: Size): Size {
  const inside = titleRow?.parentElement;
  if (!titleRow || !inside) return source;
  const width = inside.clientWidth;
  const height = inside.clientHeight;
  const previousWidth = titleRow.style.width;
  titleRow.style.width = `${source.width}px`;
  const titleHeight = titleRow.scrollHeight;
  titleRow.style.width = previousWidth;
  return {
    width: source.width + (width > 0 ? rect.width - width : 0),
    height: source.height + titleHeight + (height > 0 ? rect.height - height : 0),
  };
}

/**
 * A running edit: the draft, the text it is measured against, which is the
 * text the edit began from or last Saved, and whether a Save is under way.
 */
interface Editing {
  readonly claim: Claim | undefined;
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
  const [editRead, setEditRead] = useState<{
    readonly resourceId: ResourceId;
    readonly url: AssetRef;
  } | null>(null);
  const mapCommit = surface.map.commit;
  const contentCommit = surface.content.commit;
  const store = surface.assets.store;
  const takeClaim = surface.claim;
  const [refusal, setRefusal] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const titleRow = useRef<HTMLDivElement>(null);
  const railBand = useRailBand();

  const claim = editing?.claim;
  useEffect(() => () => claim?.release(), [claim]);

  const mayAuthor = contentCommit !== undefined && store !== undefined && takeClaim !== undefined;
  const startEdit = useCallback(
    (source: string) => {
      if (!mayAuthor || editing !== null) return;
      const held = surface.editSize === undefined ? undefined : takeClaim({ editor: {} });
      if (surface.editSize !== undefined && held === undefined) return;
      setRefusal(null);
      setEditing({ draft: source, base: lineFeedText(source), saving: false, claim: held });
    },
    [mayAuthor, editing, takeClaim, surface.editSize],
  );

  const answerEdit = useCallback(
    (answer: TextAnswer) => {
      setEditRead(null);
      if (answer.state === 'refused') setRefusal(UNEDITABLE);
      else startEdit(answer.text);
    },
    [startEdit],
  );
  const resourceId = surface.resource.id;
  const readingForEdit = editRead?.url === url && editRead.resourceId === resourceId && mayAuthor;
  if (editRead !== null && !readingForEdit) setEditRead(null);
  const text = useText(url, surface.assets, known, open, readingForEdit ? answerEdit : undefined);
  const readable = text.state === 'read' ? text.text : null;
  const mayEdit = readable !== null && mayAuthor;
  const mayEditClosed = !open && mayAuthor;
  const beginEdit = useCallback(() => {
    if (readable !== null) startEdit(readable);
    else {
      setRefusal(null);
      setEditRead({ resourceId, url });
    }
  }, [readable, startEdit, resourceId, url]);

  const suggestEditorSize = (source: Size) => {
    const suggestedSize = editorSizeWithTitle(source, titleRow.current, surface.size);
    const held = takeClaim?.({ editor: { suggestedSize } });
    setEditing((now) => (now === null || held === undefined ? null : { ...now, claim: held }));
  };

  const end = useCallback(() => setEditing(null), []);

  const save = useCallback(() => {
    if (editing?.claim === undefined || editing.saving) return;
    if (contentCommit === undefined || store === undefined) return;
    const next = lineFeedText(editing.draft);
    if (next === editing.base) {
      end();
      return;
    }
    const saved = editing.draft;
    setEditing({ ...editing, saving: true });
    // The editor stays live while a Save runs: text typed meanwhile is a new
    // draft, which a Save that lands leaves up rather than discarding.
    const settle = (refused: string | null): void => {
      setRefusal(refused);
      setEditing((now) =>
        now === null || (refused === null && now.draft === saved)
          ? null
          : { ...now, base: refused === null ? next : now.base, saving: false },
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
    (next: MarkdownMapContent) => {
      if (mapCommit === undefined) return;
      void mapCommit(next).then(
        (answer) => {
          const refused = refusalOf(answer);
          if (refused !== null) setRefusal(refused);
        },
        () => undefined,
      );
    },
    [mapCommit],
  );

  const commands = useMemo((): readonly RailCommand[] => {
    // Open and Close are one command whose name swaps, so a keyboard author's
    // focus stays on it across both.
    const openClose = (opens: boolean) =>
      ({
        kind: 'action',
        id: 'open-close',
        label: `${opens ? 'Open' : 'Close'} Resource ${name}`,
        icon: opens ? <OpenIcon /> : <CloseIcon />,
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
                disabled: editing.claim === undefined || editing.saving,
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
        // Keep the current Open or Close control in its place while editing.
        ...(mapCommit === undefined
          ? []
          : [{ ...openClose(!open), run: () => undefined, disabled: true }]),
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
              run: beginEdit,
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
              commitMap({ open: true });
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

  const drawnOpen = open || editing !== null;

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
        !drawnOpen
          ? { ...fill, height: '100%', justifyContent: 'flex-end' }
          : editing !== null
            ? { ...fill, height: '100%' }
            : fill
      }
      data-open={open}
      data-editing={editing !== null}
    >
      <div
        ref={titleRow}
        style={{
          padding: `${railBand}px ${INSET}px ${drawnOpen ? 0 : CLOSED_FOOT}px`,
          minHeight: 0,
        }}
      >
        <Title />
      </div>
      {!drawnOpen && (
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
      {drawnOpen && (
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
                autoFocus={editing.claim !== undefined}
                onSuggestedSize={editing.claim === undefined ? suggestEditorSize : undefined}
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
