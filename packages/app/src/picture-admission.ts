/**
 * Storing a picture an author brings to create Image Resources (ADR 0106):
 * the Image plugin's admission rule applied before the bytes are stored as an
 * asset. Creation reaches it here until it moves onto the Resource API
 * (`.scratch/resource-plugins/issues/08-creation-through-the-api.md`); Replace
 * is the plugin's own.
 */

import { isAssetRef } from '@project/core';
import {
  admitImage,
  MAX_IMAGE_BYTES,
  pictureSize,
  type ImageRefusal,
  type PictureSize,
} from '@project/plugin-image/domain';
import { ASSET_TOO_LARGE, type AssetClient } from '@project/persistence';

export {
  describeImageRefusal,
  IMAGE_MEDIA_TYPES,
  MAX_IMAGE_BYTES,
  refusalForDeclaredType,
  type ImageRefusal,
} from '@project/plugin-image/domain';

/**
 * What storing a picture answered: the asset URL it is stored at, and the size
 * its header gives where it gives one, or why not.
 */
export type ImageStoring =
  | { readonly kind: 'stored'; readonly url: string; readonly naturalSize?: PictureSize }
  | { readonly kind: 'refused'; readonly code: ImageRefusal };

/**
 * Store a picture through the asset store: its bytes are admitted as a picture
 * first, and stored under the media type they are, whatever the file declared,
 * and sized from its header by the plugin's `pictureSize`.
 * The host's size refusal is the picture's, since the host's cap is the one
 * that stands. Throws when the host cannot answer, or answers a refusal a
 * picture that passed this rule cannot be given.
 */
export const storePicture = async (assets: AssetClient, image: Blob): Promise<ImageStoring> => {
  if (image.size > MAX_IMAGE_BYTES) return { kind: 'refused', code: 'image-too-large' };
  const bytes = new Uint8Array(await image.arrayBuffer());
  const admission = admitImage(bytes);
  if (admission.kind === 'refused') return admission;
  const stored = await assets.store(new Blob([bytes], { type: admission.mediaType }));
  if (!isAssetRef(stored)) {
    if (stored.refused === ASSET_TOO_LARGE) return { kind: 'refused', code: 'image-too-large' };
    throw new Error(`The asset store refused a picture: ${stored.refused}`);
  }
  // Sized from its bytes, as Replace sizes it, so a picture records one size
  // whichever way it arrived.
  const naturalSize = pictureSize(bytes, admission.mediaType);
  return naturalSize === undefined
    ? { kind: 'stored', url: stored }
    : { kind: 'stored', url: stored, naturalSize };
};
