import { markdownKind, type MarkdownContent } from '@project/core';
import { markdownPlugin } from '@project/plugin-markdown/domain';
import { markdownPluginView } from '@project/plugin-markdown/view';
import { EmbeddedPluginContent } from '../PresentedPluginResource';
import type { KindView } from './kind-view';
import type { PluginOperations } from './plugin-views';

/**
 * The Markdown kind's place in this package's kind registry, taken from its
 * plugin (ADR 0142): its names and glyph are the plugin's, and its own
 * Resources are drawn by `PluginResource` and `PresentedPluginResource`. What
 * it draws in a content area and presented is a Reference's view of it, which
 * its plugin draws read-only, Open, under the Reference's own Title.
 */
export const markdownView: KindView<PluginOperations, MarkdownContent> = {
  name: markdownPlugin.name,
  listName: markdownPlugin.listName,
  referenceName: markdownPlugin.referenceName,
  Glyph: markdownPluginView.Glyph,
  bareOperations: { kind: markdownKind.id },
  canvas: (content, area) => (
    <EmbeddedPluginContent kind={markdownKind.id} title={area.name} content={content.content} />
  ),
  presented: (name, content) => (
    <EmbeddedPluginContent kind={markdownKind.id} title={name} content={content.content} />
  ),
};
