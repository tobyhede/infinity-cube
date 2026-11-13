import { isStoredAsset, type AssetRef } from '@project/resource-api/domain';
import {
  admitImage,
  describeImageRefusal,
  IMAGE_MEDIA_TYPES,
  MAX_IMAGE_BYTES,
  pictureSize,
  refusalForDeclaredType,
  type ImageContent,
  type ImageNaturalSize,
} from './domain';

/**
 * Admitting a file as an Image Resource's picture (ADR 0106, ADR 0142), the
 * one rule Create and Replace both store a picture by: refused by its declared
 * type, its size or its bytes, then stored under the media type its bytes are
 * and sized from its header alone.
 */

/** What a picker offers, for Create and Replace alike: the formats an Image Resource draws. */
export const PICKED_IMAGE_TYPES = IMAGE_MEDIA_TYPES.join(',');

/** A file as a refusal names it: by its name, or as "The image" when it has none. */
const nameOf = (file: File): string => (file.name === '' ? 'The image' : file.name);

/** The content of a picture shown from `url`, with its size where it is known. */
export const pictureAt = (url: string, naturalSize: ImageNaturalSize | undefined): ImageContent =>
  naturalSize === undefined ? { url } : { url, naturalSize };

/** Why `file` is refused by the type it declares, in words naming it, or `undefined`. */
export const declaredRefusal = (file: File): string | undefined => {
  const code = refusalForDeclaredType(file.type);
  return code === undefined ? undefined : describeImageRefusal(code, nameOf(file));
};

/**
 * Admit `file` as a picture and store it with `store`. Answers its content,
 * sized from its header and unsized where the header is silent, or why not in
 * words naming the file. Nothing is stored for a refused file.
 */
export async function admitAndStore(
  file: File,
  store: (bytes: Blob) => Promise<AssetRef | { readonly refused: string }>,
): Promise<ImageContent | { readonly refused: string }> {
  const declared = declaredRefusal(file);
  if (declared !== undefined) return { refused: declared };
  if (file.size > MAX_IMAGE_BYTES) {
    return { refused: describeImageRefusal('image-too-large', nameOf(file)) };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const admission = admitImage(bytes);
  if (admission.kind === 'refused') {
    return { refused: describeImageRefusal(admission.code, nameOf(file)) };
  }
  // Stored under the media type the bytes are, whatever the file declared.
  const stored = await store(new Blob([bytes], { type: admission.mediaType }));
  if (!isStoredAsset(stored)) return stored;
  return pictureAt(stored, pictureSize(bytes, admission.mediaType));
}
