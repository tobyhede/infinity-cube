import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import { z } from 'zod';
import { Check, Pencil, Workflow, X } from 'lucide-react';
import {
  isStoredAsset,
  lineFeedText,
  titleName,
  type AssetRef,
  type Size,
} from '@project/resource-api/domain';
import {
  CloseIcon,
  definePluginView,
  OpenIcon,
  Own,
  Rail,
  refusalOf,
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
  MERMAID_MEDIA_TYPE,
  mermaidPlugin,
  type MermaidContent,
  type MermaidMapContent,
} from './domain';
import { diagramExtent, diagramHeightAt } from './svg-size';
import { renderWithMermaid, type DiagramTheme, type RenderDiagram } from './mermaid';

/**
 * The Mermaid plugin's view (ADR 0142, ADR 0158). It draws its Title, and its
 * diagram once the
 * source asset is read and Mermaid has drawn it, where its Map content says
 * it is Open. Open and Close are its rail commands, each one Map content
 * commit that changes no size (ADR 0178). Editing is its own mode, drawn in
 * place: a Claim, the source editor, a draft, and four ways out (Save,
 * `Mod-Enter`, Cancel, `Escape`), Save storing the source and committing its
 * URL. A click elsewhere leaves the draft up. Where the Map stores no Edit
 * size, the Claim carries a size hint for the diagram drawn at a reading width.
 */

/**
 * The width Mermaid lays a diagram out at, unseen, and the width an edit's
 * size hint asks for at least; the drawn diagram is scaled to the rect's width.
 */
export const READING_WIDTH = 640;

/**
 * How long an edit waits for Mermaid to draw the diagram, and then for its
 * fonts to load, before beginning without a size hint.
 */
const LOAD_WAIT = 2000;

/** The inset the diagram and its notes are drawn at inside the rect. */
const INSET = 12;

/** The room a Closed Title keeps below it, which an Open one does not. */
const CLOSED_FOOT = 8;

/** The text of the asset at a URL, as far as it has been read. */
type Text =
  | { readonly state: 'reading' }
  | { readonly state: 'read'; readonly text: string }
  | { readonly state: 'refused'; readonly refused: string };

const READING: Text = { state: 'reading' };

/** What a note says where reading the text failed rather than being refused. */
const UNREAD = 'Reading it failed.';

/** What the status says where a Save failed rather than being refused. */
const UNSAVED = 'The source could not be saved. Your draft is kept; Save again to retry.';

/** What the status says where Edit was pressed while Closed and the source it Opened to cannot be read. */
const UNEDITABLE = 'This source cannot be read, so it cannot be edited.';

/** What is drawn in place of the diagram where its source is empty. */
const EMPTY_DIAGRAM = 'This diagram is empty.';

/** What is drawn in place of the diagram where its source is empty and Edit is offered. */
const EMPTY_TO_EDIT = `${EMPTY_DIAGRAM} Edit it to write its Mermaid source.`;

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

/** A diagram drawn from source, as far as Mermaid has drawn it. */
type Diagram =
  | { readonly state: 'drawing' }
  | { readonly state: 'drawn'; readonly svg: string }
  | { readonly state: 'empty' }
  | { readonly state: 'failed'; readonly failed: string };

const DRAWING: Diagram = { state: 'drawing' };

/** What a note says where Mermaid failed without saying why. */
const UNDRAWN = 'Mermaid could not draw it.';

/**
 * The colour scheme `element` is drawn in: its computed `color-scheme`, and
 * where that offers both, the one the browser prefers.
 */
const schemeOf = (element: Element): DiagramTheme => {
  const offered = getComputedStyle(element).colorScheme.split(/\s+/u);
  if (!offered.includes('dark')) return 'light';
  if (!offered.includes('light')) return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

/**
 * The colour scheme the element `at` holds is drawn in, read again whenever
 * the document root's attributes change or the browser's preference does. A
 * `color-scheme` changed on any other element is not seen until one of those
 * changes.
 */
function useScheme(at: RefObject<Element | null>): DiagramTheme {
  // The document's scheme until the element itself is read, so the first
  // diagram is not drawn in a scheme about to change.
  const [scheme, setScheme] = useState(() => schemeOf(document.documentElement));
  useEffect(() => {
    const read = (): void => {
      if (at.current !== null) setScheme(schemeOf(at.current));
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true });
    const preference = window.matchMedia('(prefers-color-scheme: dark)');
    preference.addEventListener('change', read);
    return () => {
      observer.disconnect();
      preference.removeEventListener('change', read);
    };
  }, [at]);
  return scheme;
}

/** The diagram last drawn, and the source and theme it was drawn from. */
interface Drawn {
  readonly source: string;
  readonly theme: DiagramTheme;
  readonly diagram: Diagram;
}

/**
 * Draw `source` in `theme` with `render`, laid out in the element `scratch`
 * holds, under an id unique to this view. The diagram last drawn is kept, so
 * a source and theme it was drawn from are not drawn again, unless that draw
 * failed. Nothing is drawn
 * while there is no source to draw (`null`), and an empty or blank source is
 * no diagram rather than a failed one.
 */
function useDiagram(
  source: string | null,
  theme: DiagramTheme,
  render: RenderDiagram,
  scratch: RefObject<HTMLElement | null>,
): Diagram {
  const id = `mermaid-${useId().replace(/[^a-zA-Z0-9-]/gu, '')}`;
  const [drawn, setDrawn] = useState<Drawn>({ source: '', theme, diagram: DRAWING });
  const kept = useRef(drawn);
  const blank = source === null || source.trim() === '';
  useEffect(() => {
    if (source === null || blank) return undefined;
    if (kept.current.source === source && kept.current.theme === theme) return undefined;
    const container = scratch.current;
    if (container === null) return undefined;
    let live = true;
    const draw = async (): Promise<Diagram> => {
      try {
        return { state: 'drawn', svg: await render(id, source, theme, container) };
      } catch (error) {
        // Mermaid's own message where it gave one, which names the line its
        // parser stopped at.
        const failed =
          error instanceof Error && error.message.trim() !== '' ? error.message : UNDRAWN;
        return { state: 'failed', failed };
      }
    };
    void draw().then((diagram) => {
      if (!live) return;
      const next = { source, theme, diagram };
      // A failure is shown but not kept, so the next time the source is
      // wanted draws again, and fetches Mermaid again after a failed fetch.
      if (diagram.state !== 'failed') kept.current = next;
      setDrawn(next);
    });
    return () => {
      live = false;
    };
  }, [id, source, theme, blank, render, scratch]);
  if (source === null) return DRAWING;
  if (blank) return { state: 'empty' };
  return drawn.source === source && drawn.theme === theme ? drawn.diagram : DRAWING;
}

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
 * Resolve once the fonts `element` is set in are ready, as a diagram's labels
 * are, or after {@link LOAD_WAIT}, whichever is first. Its timer goes when
 * `signal` aborts or it resolves.
 */
const laidOut = (element: HTMLElement, signal: AbortSignal): Promise<void> => {
  const pending: Promise<void>[] = [];
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
 * A Mermaid Resource: its Title, its diagram where Open, and the source editor
 * while it is being edited, its diagram drawn by `render`.
 */
function MermaidView({
  surface,
  render,
}: PluginViewProps<MermaidContent, MermaidMapContent> & { readonly render: RenderDiagram }) {
  const name = titleName(surface.title.value);
  const url = surface.content.value.url;
  const [known] = useState(createKnownText);
  const open = surface.map.value.open;
  const text = useText(url, surface.assets, known, open);
  const mapCommit = surface.map.commit;
  const contentCommit = surface.content.commit;
  const store = surface.assets.store;
  const takeClaim = surface.claim;
  const [refusal, setRefusal] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const claim = useRef<Claim | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  const scratch = useRef<HTMLDivElement | null>(null);
  const scheme = useScheme(root);
  const [measuring, setMeasuring] = useState(false);
  const [drawWaited, setDrawWaited] = useState(false);
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
  // The diagram is drawn while it is Open, and not while the draft replaces it.
  const drawable = editing === null && open ? readable : null;
  const diagram = useDiagram(drawable, scheme, render, scratch);
  const mayAuthor = contentCommit !== undefined && store !== undefined && takeClaim !== undefined;
  const mayEdit = open && readable !== null && mayAuthor;
  // Edit on a Closed Resource Opens it and then begins editing (ADR 0064):
  // what it Opens to is read only once it is Open, so the text decides then.
  const mayEditClosed = !open && mayAuthor && mapCommit !== undefined;
  const editWhenOpen = useRef(false);

  const startEdit = useCallback(
    (sizeHint?: Size) => {
      if (!mayEdit || editing !== null) return;
      // Taken to edit in place: the canvas draws the editor at the Edit size it
      // keeps for this Map while the Claim is held, or, with none stored, at
      // least at the hint (ADR 0178).
      const held = takeClaim(sizeHint === undefined ? { inPlace: {} } : { inPlace: { sizeHint } });
      if (held === undefined) return;
      claim.current = held;
      setRefusal(null);
      // Measured as Save stores it, so a text stored with other line endings
      // is unchanged until its draft is.
      setEditing({ draft: readable, base: lineFeedText(readable), saving: false });
    },
    [mayEdit, editing, takeClaim, readable],
  );

  // With an Edit size stored, the edit begins at once; with none, the diagram
  // is measured at a reading width first and the hint goes with the Claim, so
  // each edit measures again until an Edit size is stored (ADR 0178).
  const editSize = surface.editSize;
  const beginEdit = useCallback(() => {
    if (!mayEdit || editing !== null || measuring) return;
    if (editSize !== undefined) startEdit();
    else setMeasuring(true);
  }, [mayEdit, editing, measuring, editSize, startEdit]);
  const width = Math.max(surface.size.width, READING_WIDTH);
  // A drawn diagram is measured from the size its SVG declares rather than
  // from a second copy in the measurer, which would put each id Mermaid gives
  // the SVG in the document twice.
  const extent = useMemo(
    () => (diagram.state === 'drawn' ? diagramExtent(diagram.svg) : undefined),
    [diagram],
  );
  const beginning = useRef({ startEdit, width, extent });
  useEffect(() => {
    beginning.current = { startEdit, width, extent };
  }, [startEdit, width, extent]);
  const diagramState = diagram.state;
  const awaitingDiagram = diagramState === 'drawing' && !drawWaited;
  useEffect(() => {
    // Mermaid may be fetched, or stall, while the edit waits: past LOAD_WAIT
    // it begins without a hint rather than leaving the press unanswered.
    if (!measuring || !awaitingDiagram) return undefined;
    const timer = setTimeout(() => setDrawWaited(true), LOAD_WAIT);
    return () => clearTimeout(timer);
  }, [measuring, awaitingDiagram]);
  useEffect(() => {
    // A diagram is measured once Mermaid has drawn it, or failed to.
    if (!measuring || awaitingDiagram) return undefined;
    const element = measurer.current;
    const measured = new AbortController();
    const { signal } = measured;
    void (element === null ? Promise.resolve() : laidOut(element, signal)).then(() => {
      if (signal.aborted) return;
      setMeasuring(false);
      setDrawWaited(false);
      const now = beginning.current;
      if (
        element === null ||
        diagramState === 'drawing' ||
        (diagramState === 'drawn' && now.extent === undefined)
      ) {
        now.startEdit();
        return;
      }
      // The measurer draws the Title as an Open one is drawn, at the width the
      // hint asks for, above a note where there is one; a drawn diagram below
      // it is as high as its SVG at that width, inside its inset.
      const diagramHeight =
        now.extent === undefined
          ? 0
          : diagramHeightAt(now.extent, now.width - 2 * INSET) + 2 * INSET;
      const height = element.scrollHeight + diagramHeight + 2 * INSET;
      now.startEdit({ width: Math.round(now.width), height: Math.round(height) });
    });
    return () => measured.abort();
  }, [measuring, diagramState, awaitingDiagram]);

  const end = useCallback(() => setEditing(null), []);

  // A Resource Closed elsewhere while its draft was up has nowhere to draw it,
  // and one Closed while its edit was still being measured begins no edit, so
  // a later Open begins none until Edit is pressed again.
  if (editing !== null && !open) setEditing(null);
  if (measuring && !open) {
    setMeasuring(false);
    setDrawWaited(false);
  }

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
    void store(new Blob([next], { type: MERMAID_MEDIA_TYPE }))
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
    (next: MermaidMapContent) => {
      if (mapCommit === undefined) return;
      const committed = mapCommit(next);
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
                    commitMap({ open: true });
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
      ref={root}
      data-open={open}
      data-editing={editing !== null}
    >
      <div
        // Where Mermaid lays a diagram out while drawing it: unseen, in the
        // rect's own fonts, and never the document body, which it would grow.
        ref={scratch}
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: READING_WIDTH,
          height: 0,
          overflow: 'hidden',
          visibility: 'hidden',
          pointerEvents: 'none',
        }}
      />
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
          aria-label={mermaidPlugin.name}
          style={{ position: 'absolute', top: 8, right: 8, display: 'flex' }}
        >
          <MermaidGlyph />
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
                ariaLabel={`Mermaid source of ${name}`}
                autoFocus
                onSave={save}
                onCancel={escape}
              />
            </Own>
          ) : text.state === 'refused' ? (
            <p role="note" style={{ margin: 0, padding: INSET, fontSize: 12 }}>
              {`This source cannot be read. ${text.refused}`}
            </p>
          ) : text.state === 'read' ? (
            <DrawnDiagram
              diagram={diagram}
              mayEdit={mayEdit}
              edit={
                mayEdit && surface.selected
                  ? { label: `Edit Mermaid source of ${name}`, begin: beginEdit }
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
      {measuring && (
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
          {diagram.state !== 'drawn' && <DrawnDiagram diagram={diagram} mayEdit={mayEdit} />}
        </div>
      )}
      <Rail commands={commands} />
    </div>
  );
}

/**
 * A diagram as Mermaid drew it, or a note saying why there is none, with the
 * press that begins an edit where one is offered: a transparent button over
 * the whole diagram, out of the tab order since the rail's Edit is the
 * keyboard's way in. An empty diagram's note names Edit only where Edit is
 * offered (`mayEdit`).
 */
function DrawnDiagram({
  diagram,
  mayEdit,
  edit,
}: {
  readonly diagram: Diagram;
  readonly mayEdit: boolean;
  readonly edit?: { readonly label: string; readonly begin: () => void } | undefined;
}) {
  return (
    <div style={{ position: 'relative', padding: INSET }}>
      {diagram.state === 'drawn' ? (
        <div
          data-testid="mermaid-diagram"
          // Mermaid passes the SVG it answers through its DOMPurify sanitiser,
          // and at `strict` encodes a source's HTML tags and turns off its
          // clicks (ADR 0158). The diagram is drawn straight onto the rect. As a
          // flex item the SVG sits on no text baseline, and Mermaid's HTML
          // labels keep the line height they were measured at.
          style={{ display: 'flex' }}
          dangerouslySetInnerHTML={{ __html: diagram.svg }}
        />
      ) : diagram.state === 'failed' ? (
        // Mermaid's message runs over lines, a source line under a caret among
        // them, which are kept as it wrote them.
        <p role="note" style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }}>
          {'This diagram cannot be drawn. '}
          <span style={{ display: 'block', fontFamily: 'ui-monospace, monospace' }}>
            {diagram.failed}
          </span>
        </p>
      ) : diagram.state === 'empty' ? (
        <p role="note" style={{ margin: 0, fontSize: 12 }}>
          {mayEdit ? EMPTY_TO_EDIT : EMPTY_DIAGRAM}
        </p>
      ) : (
        <div role="status" aria-label="Drawing diagram" style={{ minHeight: 24 }} />
      )}
      {edit !== undefined && (
        <button
          type="button"
          aria-label={edit.label}
          tabIndex={-1}
          onClick={(event) => {
            event.stopPropagation();
            edit.begin();
          }}
          style={{
            position: 'absolute',
            inset: 0,
            border: 0,
            padding: 0,
            background: 'transparent',
            cursor: 'text',
          }}
        />
      )}
    </div>
  );
}

/** The Mermaid glyph. */
function MermaidGlyph({ size = 14 }: { readonly size?: number | undefined }) {
  return <Workflow size={size} />;
}

/**
 * Create Mermaid Resource: one press on the Command Dock, the empty source,
 * which names the asset of zero bytes and so stores nothing; the host places it
 * and continues into its Title.
 */
const createFromDock: Creation<MermaidContent> = {
  from: 'dock',
  run: async (host) => {
    await host.create([{ content: mermaidPlugin.newContent }]);
  },
};

/**
 * The Mermaid plugin's view half, drawing its diagrams with `render`: Mermaid
 * itself in the build (`mermaidPluginView`), and a test's stand-in under
 * jsdom, which has no layout for Mermaid to draw with.
 */
export const mermaidPluginViewWith = (render: RenderDiagram) => {
  function View(props: PluginViewProps<MermaidContent, MermaidMapContent>) {
    return <MermaidView {...props} render={render} />;
  }
  return definePluginView(mermaidPlugin, {
    View,
    Glyph: MermaidGlyph,
    creates: [createFromDock],
  });
};

export const mermaidPluginView = mermaidPluginViewWith(renderWithMermaid);

export type { DiagramTheme, RenderDiagram } from './mermaid';
