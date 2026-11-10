import { isStoredAsset } from '@project/resource-api/domain';
import {
  URL_MEDIA_TYPE,
  type Assets,
  type Creation,
  type CreationData,
  type CreationHost,
} from '@project/resource-api/view';
import {
  admitImage,
  describeImageRefusal,
  IMAGE_MEDIA_TYPES,
  isAcceptedImageUrl,
  MAX_IMAGE_BYTES,
  pictureSize,
  type ImageContent,
  type ImageNaturalSize,
  refusalForDeclaredType,
} from './domain';

/**
 * How Image Resources are created (ADR 0106, ADR 0142): from files chosen in
 * the picker the Dock's press opens, from files dropped on the canvas, and from
 * an image URL pasted there. Every picture is admitted, stored and sized before
 * the host is asked for anything, so the one Edit it makes records what it was
 * told; a gesture of several files is all or nothing, because the author made
 * one gesture and one Edit answers it.
 */

/** What the picker offers: the formats an Image Resource draws. */
export const PICKED_IMAGE_TYPES = IMAGE_MEDIA_TYPES.join(',');

/** How long a picture may take to load before it is taken as one that did not. */
export const MEASURE_TIMEOUT_MS = 10_000;

/** What is said where this surface offers no asset store to keep a picture in. */
const NOT_STORABLE = 'Images cannot be stored here.';

/**
 * The browser loading a picture to learn its natural size: the one place the
 * plugin builds an `Image`. A picture that errors, never answers within
 * `timeoutMs`, or has no intrinsic size answers `undefined`.
 */
export const measurePicture = (
  src: string,
  timeoutMs: number = MEASURE_TIMEOUT_MS,
): Promise<ImageNaturalSize | undefined> =>
  new Promise((resolve) => {
    const picture = new Image();
    const settle = (size: ImageNaturalSize | undefined): void => {
      clearTimeout(timer);
      picture.onload = null;
      picture.onerror = null;
      resolve(size);
    };
    const timer = setTimeout(() => settle(undefined), timeoutMs);
    picture.onload = () => {
      const { naturalWidth: width, naturalHeight: height } = picture;
      settle(width > 0 && height > 0 ? { width, height } : undefined);
    };
    picture.onerror = () => settle(undefined);
    picture.src = src;
  });

/** The content of a picture shown from `url`, with its size where it is known. */
const pictureAt = (url: string, naturalSize: ImageNaturalSize | undefined): ImageContent =>
  naturalSize === undefined ? { url } : { url, naturalSize };

/**
 * Admit one file as a picture, store it, and size it from its header, or by
 * loading it where its header says nothing. Answers its content, or why not.
 */
async function storedPicture(
  file: File,
  assets: Assets,
): Promise<ImageContent | { readonly refused: string }> {
  if (file.size > MAX_IMAGE_BYTES) {
    return { refused: describeImageRefusal('image-too-large', file.name) };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const admission = admitImage(bytes);
  if (admission.kind === 'refused') {
    return { refused: describeImageRefusal(admission.code, file.name) };
  }
  if (assets.store === undefined) return { refused: NOT_STORABLE };
  // Stored under the media type the bytes are, whatever the file declared.
  const stored = await assets.store(new Blob([bytes], { type: admission.mediaType }));
  if (!isStoredAsset(stored)) return stored;
  const naturalSize =
    pictureSize(bytes, admission.mediaType) ?? (await measurePicture(assets.url(stored)));
  return pictureAt(stored, naturalSize);
}

/**
 * Files chosen or dropped: one Image Resource each, in one create. A file whose
 * declared type is refused is said before any file is sent, so a gesture
 * holding one stores nothing. Otherwise every file is sent before any answer is
 * read, so every refusal is said; a refused file can leave the files beside it
 * stored with nothing naming them, which is the store's standing state rather
 * than a leak, since a stored asset is named by its bytes. No files is no
 * gesture.
 */
async function createFromFiles(
  host: CreationHost<ImageContent>,
  files: readonly File[],
): Promise<void> {
  if (files.length === 0) return;
  const declared = files.flatMap((file): string[] => {
    const code = refusalForDeclaredType(file.type);
    return code === undefined ? [] : [describeImageRefusal(code, file.name)];
  });
  if (declared.length > 0) {
    host.report(declared.join(' '));
    return;
  }
  const pictures = await Promise.all(files.map((file) => storedPicture(file, host.assets)));
  const refusals = pictures.flatMap((picture) => ('refused' in picture ? [picture.refused] : []));
  if (refusals.length > 0) {
    host.report(refusals.join(' '));
    return;
  }
  await host.create(
    pictures.flatMap((picture) => ('refused' in picture ? [] : [{ content: picture }])),
  );
}

/**
 * A pasted URL: one Image Resource showing it, sized by loading it. A picture
 * that does not load is still created, with no recorded size.
 */
async function createFromUrl(host: CreationHost<ImageContent>, url: string): Promise<void> {
  await host.create([{ content: pictureAt(url, await measurePicture(url)) }]);
}

/**
 * Create Image Resource: the press opens the picker, before anything is
 * awaited, since a browser opens one only in a press. A cancelled picker
 * creates nothing.
 */
const createFromDock: Creation<ImageContent> = {
  from: 'dock',
  run: async (host) => {
    const pick = host.assets.pick;
    if (pick === undefined) return;
    await createFromFiles(host, await pick(PICKED_IMAGE_TYPES));
  },
};

/** Whether arriving data is a picture's: any files, which are admitted by their bytes, or an image URL. */
const acceptsData = (data: CreationData): boolean =>
  data.kind === 'files' || isAcceptedImageUrl(data.url);

/**
 * Files dropped or a URL pasted on the canvas. It takes every file, its formats
 * exactly and any other as a wildcard, so a plugin naming a type exactly is
 * offered that file first and a file nothing else takes is refused by name.
 */
const createFromData: Creation<ImageContent> = {
  from: 'data',
  types: [...IMAGE_MEDIA_TYPES, URL_MEDIA_TYPE, '*/*'],
  accepts: acceptsData,
  run: (host, data) =>
    data.kind === 'files' ? createFromFiles(host, data.files) : createFromUrl(host, data.url),
};

/** Every way an Image Resource is created. */
export const IMAGE_CREATIONS: readonly Creation<ImageContent>[] = [createFromDock, createFromData];
