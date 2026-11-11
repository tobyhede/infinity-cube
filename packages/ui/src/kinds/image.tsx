import { imageKind, type ImageContent } from '@project/core';
import { imagePlugin } from '@project/plugin-image/domain';
import { imagePluginView } from '@project/plugin-image/view';
import { EmbeddedPluginContent } from '../PresentedPluginResource';
import type { KindView } from './kind-view';
import type { PluginOperations } from './plugin-views';

/**
 * The Image kind's place in this package's kind registry, taken from its
 * plugin (ADR 0106, ADR 0142): its names and glyph are the plugin's, and its
 * own Resources are drawn by `PluginResource` and `PresentedPluginResource`.
 * Where an Open Reference Resource shows an Image Resource as its Target, the
 * plugin draws it in the Reference's content area, on a surface offering no
 * authoring, named by the Reference's own Title.
 */
export const imageView: KindView<PluginOperations, ImageContent> = {
  name: imagePlugin.name,
  listName: imagePlugin.listName,
  referenceName: imagePlugin.referenceName,
  Glyph: imagePluginView.Glyph,
  bareOperations: { kind: imageKind.id },
  canvas: (content, area) => (
    <EmbeddedPluginContent kind={imageKind.id} title={area.name} content={content.content} />
  ),
  presented: (name, content) => (
    <EmbeddedPluginContent kind={imageKind.id} title={name} content={content.content} />
  ),
};
