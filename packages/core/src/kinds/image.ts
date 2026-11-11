import { imagePlugin, type ImageContent as ImagePluginContent } from '@project/plugin-image/domain';
import { kindFromPlugin, type PluginContent } from './plugin-kind';

export {
  IMAGE_URL_UNSUPPORTED,
  imageNaturalSizeSchema,
  isAcceptedImageUrl,
  type ImageNaturalSize,
} from '@project/plugin-image/domain';

/**
 * The Image kind (ADR 0106), drawn by the Image plugin (ADR 0142): a Resource
 * that is its picture, shown from the URL it owns. This module reads that
 * plugin's domain half as a kind module; everything it says is the plugin's.
 */
export const imageKind = {
  ...kindFromPlugin(imagePlugin),
  // An Open Reference Resource draws its Target in its content area, where
  // the Image plugin draws the picture read-only, until the Reference plugin
  // embeds it (`.scratch/resource-plugins/issues/06`).
  facts: { authored: false, embedsMap: false, drawsContentArea: true },
};

/** The Image kind's id. */
export type ImageKindId = typeof imageKind.id;

/** What an Image Resource's content resolves to: its kind and its URL and natural size. */
export type ImageContent = PluginContent<ImageKindId, ImagePluginContent>;
