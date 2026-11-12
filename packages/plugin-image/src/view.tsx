import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import { Image as ImageGlyph, ImageUp, Pencil } from 'lucide-react';
import { isAssetRef, isStoredAsset, titleName, type Answer } from '@project/resource-api/domain';
import {
  definePluginView,
  Own,
  Rail,
  type Exclusive,
  type OwnClaim,
  type PluginViewProps,
  type RailCommand,
} from '@project/resource-api/view';
import {
  admitImage,
  describeImageRefusal,
  IMAGE_MEDIA_TYPES,
  imagePlugin,
  MAX_IMAGE_BYTES,
  pictureSize,
  type ImageContent,
  type ImageMapContent,
} from './domain';

/**
 * The Image plugin's view (ADR 0106, ADR 0142): the picture, fitted whole into
 * the size it is given and never cropped, and nothing else. It draws no Title;
 * the Title is the picture's text alternative and is renamed from the rail.
 *
 * Replace is a rail command and a drop on the picture. The plugin takes a Claim
 * in the press, opens the picker in it, then runs the replacement exclusively, so
 * every other commit on every surface is withdrawn until it settles (ADR 0126):
 * the bytes are admitted as a picture, stored, and named in one content commit.
 */

/** What the picker offers: the formats an Image Resource draws. */
const ACCEPT = IMAGE_MEDIA_TYPES.join(',');

const NOT_HERE = 'This image cannot be replaced here.';
const ONE_AT_A_TIME = 'Use one image at a time.';
const BUSY = 'Another change is still being made. Try again when it ends.';
const NOT_REPLACED = 'This image was not replaced. Try again.';
const NOT_RENAMED = 'This title was not changed. Try again.';

/** The words of an answer, or `null` for one that leaves nothing to say. */
const refusalOf = (answer: Answer): string | null =>
  answer === 'completed' || answer === 'unchanged' ? null : answer.refused;

/**
 * Replace the picture with `file`, inside exclusive work: admitted from its
 * bytes, stored, and named by a content commit. Answers what to tell the
 * author, or `null` once it is replaced or already was.
 */
async function replacing(file: File, own: Exclusive<ImageContent, ImageMapContent>) {
  const name = file.name === '' ? 'The image' : file.name;
  if (own.store === undefined || own.content === undefined) return NOT_HERE;
  if (file.size > MAX_IMAGE_BYTES) return describeImageRefusal('image-too-large', name);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const admission = admitImage(bytes);
  if (admission.kind === 'refused') return describeImageRefusal(admission.code, name);
  const stored = await own.store(new Blob([bytes], { type: admission.mediaType }));
  if (!isStoredAsset(stored)) return stored.refused;
  const naturalSize = pictureSize(bytes, admission.mediaType);
  const content: ImageContent =
    naturalSize === undefined ? { url: stored } : { url: stored, naturalSize };
  return refusalOf(await own.content(content));
}

const FILL: CSSProperties = { position: 'absolute', inset: 0 };

const PICTURE: CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'contain',
};

const NOTE: CSSProperties = {
  position: 'absolute',
  insetInline: 0,
  bottom: 0,
  margin: 0,
  padding: '4px 8px',
  fontSize: 12,
  background: 'color-mix(in srgb, Canvas 85%, transparent)',
  color: 'CanvasText',
};

const FAILED: CSSProperties = {
  ...FILL,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  padding: 8,
  textAlign: 'center',
  fontSize: 12,
  overflow: 'hidden',
};

/** The picture, a skeleton until it loads, or what is said when it does not. */
function Picture({ src, url, name }: { src: string; url: string; name: string }) {
  const [load, setLoad] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const picture = useRef<HTMLImageElement>(null);
  // A picture the browser already holds may finish before React listens for
  // its load, so it is read before the first paint rather than skeletoned.
  useLayoutEffect(() => {
    const drawn = picture.current;
    if (drawn !== null && drawn.complete && drawn.naturalWidth > 0) setLoad('loaded');
  }, []);
  if (load === 'failed') {
    return (
      <div style={FAILED} data-testid="image-failed">
        <ImageGlyph size={24} aria-hidden />
        <strong>Image did not load</strong>
        <span style={{ overflowWrap: 'anywhere' }}>{url}</span>
      </div>
    );
  }
  return (
    <div style={FILL} aria-busy={load === 'loading'}>
      <img
        ref={picture}
        src={src}
        alt={name}
        draggable={false}
        style={{ ...PICTURE, opacity: load === 'loading' ? 0 : 1 }}
        onLoad={() => setLoad('loaded')}
        onError={() => setLoad('failed')}
      />
      {load === 'loading' && (
        <div
          role="status"
          aria-label="Loading image"
          style={{ ...FILL, background: 'color-mix(in srgb, currentColor 8%, transparent)' }}
        />
      )}
    </div>
  );
}

/** The Title being renamed, drawn over the picture in the plugin's own region. */
function Rename({
  title,
  onCommit,
  onCancel,
}: {
  title: string;
  onCommit: (next: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(title);
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    } else if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onCommit(draft);
    }
  };
  return (
    <Own>
      <textarea
        aria-label="Resource title"
        // The rename is what the author pressed for, so it takes the caret.
        autoFocus
        value={draft}
        rows={2}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={keyDown}
        onBlur={() => onCommit(draft)}
        style={{
          position: 'absolute',
          insetInline: 4,
          top: 4,
          font: 'inherit',
          resize: 'none',
          boxSizing: 'border-box',
        }}
      />
    </Own>
  );
}

/**
 * Each Replace press and drop numbered, so a picker that settles after a later
 * one began is ignored: the later one holds the same Claim.
 */
function createPressCount() {
  let latest = 0;
  return {
    next: (): number => ++latest,
    isLatest: (press: number): boolean => press === latest,
  };
}

/** Whether a drag carries files, which is all a drop on the picture takes. */
const carriesFiles = (event: DragEvent): boolean => event.dataTransfer.types.includes('Files');

function ImageView({ surface }: PluginViewProps<ImageContent, ImageMapContent>) {
  const { url } = surface.content.value;
  const title = surface.title.value;
  const name = titleName(title);
  const commitTitle = surface.title.commit;
  const commitContent = surface.content.commit;
  const claimOf = surface.claim;
  const pick = surface.assets.pick;
  const src = isAssetRef(url) ? surface.assets.url(url) : url;
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [presses] = useState(createPressCount);

  const replaceable = commitContent !== undefined && claimOf !== undefined;

  /** Take the Claim a replacement runs under, or say why none was given. */
  const claimForReplace = useCallback((): OwnClaim<ImageContent, ImageMapContent> | undefined => {
    const claim = claimOf?.();
    if (claim === undefined) setNotice(BUSY);
    return claim;
  }, [claimOf]);

  /** Replace the picture with the one file given, under `claim`, which is released once it settles. */
  const replaceWith = useCallback(
    (claim: OwnClaim<ImageContent, ImageMapContent>, files: readonly File[]) => {
      const [file, ...rest] = files;
      if (file === undefined || rest.length > 0) {
        claim.release();
        if (file !== undefined) setNotice(ONE_AT_A_TIME);
        return;
      }
      setNotice(null);
      setWorking(true);
      void claim
        .exclusively((own) => replacing(file, own))
        .then((said) => setNotice(said === 'busy' ? BUSY : said))
        .catch(() => setNotice(NOT_REPLACED))
        .finally(() => {
          claim.release();
          setWorking(false);
        });
    },
    [],
  );

  /**
   * The Claim is taken in the press, then the picker opens in it too, before
   * anything is awaited: a browser opens one only in a press.
   */
  const pickToReplace = useCallback(() => {
    if (pick === undefined) return;
    const press = presses.next();
    const claim = claimForReplace();
    if (claim === undefined) return;
    const current = () => presses.isLatest(press);
    void pick(ACCEPT).then(
      (files) => {
        if (current()) replaceWith(claim, files);
      },
      () => {
        if (current()) claim.release();
      },
    );
  }, [pick, presses, claimForReplace, replaceWith]);

  const commands = useMemo((): readonly RailCommand[] => {
    const offered: RailCommand[] = [];
    if (commitTitle !== undefined) {
      offered.push({
        kind: 'action',
        id: 'rename',
        label: `Rename Resource ${name}`,
        icon: <Pencil size={14} aria-hidden />,
        disabled: working,
        run: () => {
          setNotice(null);
          setRenaming(true);
        },
      });
    }
    if (replaceable && pick !== undefined) {
      offered.push({
        kind: 'action',
        id: 'replace',
        label: `Replace image of Resource ${name}`,
        icon: <ImageUp size={14} aria-hidden />,
        disabled: working,
        run: pickToReplace,
      });
    }
    return offered;
  }, [commitTitle, name, working, replaceable, pick, pickToReplace]);

  // A refused Title keeps the editor open with the draft and says why (ADR
  // 0057); only a settled one closes it. One commit is in flight at a time, and
  // a different draft committed meanwhile is sent once it settles. The editor
  // stays mounted while the Title commit is withdrawn, so exclusive work
  // anywhere keeps the draft, and a draft committed then is kept with a notice.
  const renameInFlight = useRef(false);
  const queuedDraft = useRef<string | null>(null);
  const sendTitle = (next: string) => {
    if (commitTitle === undefined) return;
    renameInFlight.current = true;
    void commitTitle(next)
      .then(refusalOf, () => NOT_RENAMED)
      .then((refusal) => {
        renameInFlight.current = false;
        const queued = queuedDraft.current;
        queuedDraft.current = null;
        if (queued !== null && queued !== next) {
          sendTitle(queued);
          return;
        }
        setNotice(refusal);
        if (refusal === null) setRenaming(false);
      });
  };
  const rename = (next: string) => {
    if (renameInFlight.current) {
      queuedDraft.current = next;
      return;
    }
    if (next === title) {
      setRenaming(false);
      return;
    }
    if (commitTitle === undefined) {
      setNotice(BUSY);
      return;
    }
    sendTitle(next);
  };

  const drop = replaceable
    ? {
        onDragOver: (event: DragEvent<HTMLDivElement>) => {
          if (!carriesFiles(event)) return;
          // Taken here, so the canvas does not also create a Resource from it.
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = working ? 'none' : 'copy';
        },
        onDrop: (event: DragEvent<HTMLDivElement>) => {
          if (!carriesFiles(event)) return;
          event.preventDefault();
          event.stopPropagation();
          if (working) return;
          const files = [...event.dataTransfer.files];
          if (files.length > 1) {
            setNotice(ONE_AT_A_TIME);
            return;
          }
          presses.next();
          const claim = claimForReplace();
          if (claim !== undefined) replaceWith(claim, files);
        },
      }
    : {};

  return (
    <div style={FILL} data-testid="image-plugin" data-replacing={working} {...drop}>
      <Picture key={src} src={src} url={url} name={name} />
      {working && (
        <p role="status" style={NOTE} data-testid="image-notice">
          Replacing image…
        </p>
      )}
      {!working && notice !== null && (
        <p role="alert" style={NOTE} data-testid="image-notice">
          {notice}
        </p>
      )}
      {renaming && <Rename title={title} onCommit={rename} onCancel={() => setRenaming(false)} />}
      <Rail commands={commands} />
    </div>
  );
}

/** The Image glyph. */
function ImageResourceGlyph({ size = 14 }: { readonly size?: number | undefined }) {
  return <ImageGlyph size={size} />;
}

export const imagePluginView = definePluginView(imagePlugin, {
  View: ImageView,
  Glyph: ImageResourceGlyph,
});
