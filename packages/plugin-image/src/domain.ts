/* v8 ignore next -- V8 attributes ESM module initialization to this import as a function. */
import { z } from 'zod';
import { definePlugin, isAssetRef } from '@project/resource-api/domain';

export {
  admitImage,
  describeImageRefusal,
  IMAGE_MEDIA_TYPES,
  isImageMediaType,
  isImageRefusal,
  MAX_IMAGE_BYTES,
  refusalForDeclaredType,
  type ImageAdmission,
  type ImageMediaType,
  type ImageRefusal,
} from './domain/admission';
export { pictureSize, type PictureSize } from './domain/picture-size';

/**
 * The Image plugin's domain half (ADR 0106, ADR 0142): a Resource that is its
 * picture, shown from a URL it owns. It keeps nothing per Map, is never Open
 * or Closed, and may be a Reference's Target.
 */

/**
 * Whether an Image Resource may hold this URL (ADR 0106): an `https:` or
 * `http:` URL, or an asset reference (ADR 0142). `data:` is refused because it
 * would put the picture's bytes back in the Resource, every other scheme
 * because the Resource shows a picture from the web, and every other relative
 * form because it would resolve against whatever page drew it.
 */
export const isAcceptedImageUrl = (url: string): boolean => {
  if (url.startsWith('/')) return isAssetRef(url);
  if (!URL.canParse(url)) return false;
  const { protocol } = new URL(url);
  return protocol === 'https:' || protocol === 'http:';
};

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

/** A picture's natural size. */
export type ImageNaturalSize = z.infer<typeof imageNaturalSizeSchema>;

/**
 * An Image Resource's content: the URL its picture is shown from, and its
 * natural size, absent when the picture's size was not known when the URL was
 * set.
 */
export const imageContentSchema = z
  .object({
    url: z
      .string()
      .refine(isAcceptedImageUrl, 'An image URL must be https:, http:, or a stored asset.'),
    naturalSize: imageNaturalSizeSchema.optional(),
  })
  .strict();

/** An Image Resource's content. */
export type ImageContent = z.infer<typeof imageContentSchema>;

/** What an Image Resource keeps on one Map, which is nothing. */
export const imageMapContentSchema = z.object({}).strict();

/** What an Image Resource keeps on one Map. */
export type ImageMapContent = z.infer<typeof imageMapContentSchema>;

export const imagePlugin = definePlugin({
  apiVersion: 1,
  kind: 'image',
  name: 'Image Resource',
  listName: 'Image Resources',
  referenceName: 'Reference to an Image Resource',
  content: imageContentSchema,
  mapContent: { schema: imageMapContentSchema, default: {} },
  mayBeTarget: true,
  bareAtRest: true,
  drawsTitle: false,
});
