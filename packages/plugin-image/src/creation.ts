import { isAssetRef } from '@project/resource-api/domain';
import {
  URL_MEDIA_TYPE,
  type Creation,
  type CreationData,
  type CreationHost,
} from '@project/resource-api/view';
import { IMAGE_MEDIA_TYPES, isAcceptedImageUrl, type ImageContent } from './domain';
import { admitAndStore, declaredRefusal, PICKED_IMAGE_TYPES, pictureAt } from './picture';

export { PICKED_IMAGE_TYPES } from './picture';

/**
 * How Image Resources are created (ADR 0106, ADR 0142): from files chosen in
 * the picker the Dock's press opens, from files dropped on the canvas, and from
 * an image URL pasted there. Every picture is admitted, stored and sized before
 * the host is asked for anything (a file from its header, `picture.ts`), so the one Edit it makes records what it was
 * told; a gesture of several files is all or nothing, because the author made
 * one gesture and one Edit answers it.
 */

/** What is said where this surface offers no asset store to keep a picture in. */
const NOT_STORABLE = 'Images cannot be stored here.';

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
    const refused = declaredRefusal(file);
    return refused === undefined ? [] : [refused];
  });
  if (declared.length > 0) {
    host.report(declared.join(' '));
    return;
  }
  const { store } = host.assets;
  if (store === undefined) {
    host.report(NOT_STORABLE);
    return;
  }
  const pictures = await Promise.all(files.map((file) => admitAndStore(file, store)));
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
 * A pasted URL: one Image Resource showing it, sized by the surface loading it
 * from where it is drawn, which for a stored asset is the URL the surface
 * resolves it to. A picture that does not load, or a surface that measures
 * nothing, still creates it, with no recorded size.
 */
async function createFromUrl(host: CreationHost<ImageContent>, url: string): Promise<void> {
  const { measure } = host.assets;
  const drawnFrom = isAssetRef(url) ? host.assets.url(url) : url;
  const naturalSize = measure === undefined ? undefined : await measure(drawnFrom);
  await host.create([{ content: pictureAt(url, naturalSize) }]);
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
