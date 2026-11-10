/* v8 ignore next -- V8 attributes ESM module initialization to this import as a function. */
import { z } from 'zod';
import { isAssetRef } from '../assets';
import { defineKind } from './kind-module';

/** The refusal code for an image URL an Image Resource may not hold; the application owns the wording. */
export const IMAGE_URL_UNSUPPORTED = 'image-url-unsupported';

/**
 * Whether an Image Resource may hold this URL (ADR 0106): an `https:` or
 * `http:` URL, or an asset reference (ADR 0142). `data:` is refused
 * because it would put the picture's bytes back in the document, every other
 * scheme because the Resource shows a picture from the web, and every other
 * relative form because it would resolve against whatever page drew it.
 */
export const isAcceptedImageUrl = (url: string): boolean => {
  if (url.startsWith('/')) return isAssetRef(url);
  if (!URL.canParse(url)) return false;
  const { protocol } = new URL(url);
  return protocol === 'https:' || protocol === 'http:';
};

const imageUrlSchema = z.string().refine(isAcceptedImageUrl, {
  message: 'An image URL must be https:, http:, or the /assets/<hash> of a stored asset',
  params: { code: IMAGE_URL_UNSUPPORTED },
});

/**
 * The size of the picture in pixels, as measured when its URL was set
 * (ADR 0106). Recorded with the image; no size rule reads it, because a
 * Resource's size is its Map entry's and the picture fits the rect it is given.
 */
export const imageNaturalSizeSchema = z
  .object({
    width: z.number().positive().finite(),
    height: z.number().positive().finite(),
  })
  .strict();

/**
 * A Resource that shows a picture from its URL (ADR 0106). It owns the URL and
 * not the bytes, so nothing here says where the picture is stored; the natural
 * size is absent when the picture did not load when its URL was set.
 */
export const imageResourceContentSchema = z
  .object({
    url: imageUrlSchema,
    naturalSize: imageNaturalSizeSchema.optional(),
  })
  .strict();

/** The Image kind's id, declared before its module because the content it resolves to names it. */
const IMAGE_KIND_ID = 'image';

/** What an Image Resource's content resolves to: the URL its picture is shown from. */
export interface ImageContent {
  readonly kind: typeof IMAGE_KIND_ID;
  readonly url: string;
}

/**
 * The Image kind (ADR 0106): a content kind whose content is a picture shown
 * from its URL. Its content action is Replace.
 */
export const imageKind = defineKind({
  id: IMAGE_KIND_ID,
  contentSchema: imageResourceContentSchema,
  flags: {
    canOpen: true,
    opensToFit: false,
    mayBeTarget: true,
    ownsReferencedSpaces: false,
  },
  facts: { authored: true, embedsMap: false, drawsContentArea: true },
  resolveContent: (content): ImageContent => ({ kind: IMAGE_KIND_ID, url: content.url }),
});

/** The Image kind's id. */
export type ImageKindId = typeof imageKind.id;
