import { markdownKind, type MarkdownContent } from '@project/core';
import { markdownPlugin } from '@project/plugin-markdown/domain';
import { markdownPluginView } from '@project/plugin-markdown/view';
import { PresentedPluginContent } from '../PresentedPluginResource';
import type { KindView } from './kind-view';
import type { PluginOperations } from './plugin-views';

/**
 * The Markdown kind's place in this package's kind registry, taken from its
 * plugin (ADR 0142): its names and glyph are the plugin's, and its own
 * Resources are drawn by `PluginResource` and `PresentedPluginResource`, and a
 * Reference Resource's view of one by the host's embedding. Presented below
 * a name `PresentedResource` draws, as the Notes window draws a note or a
 * move's preview, its plugin draws it read-only.
 */
export const markdownView: KindView<PluginOperations, MarkdownContent> = {
  name: markdownPlugin.name,
  listName: markdownPlugin.listName,
  referenceName: markdownPlugin.referenceName,
  Glyph: markdownPluginView.Glyph,
  bareOperations: { kind: markdownKind.id },
  presented: (name, content) => (
    <PresentedPluginContent kind={markdownKind.id} title={name} content={content.content} />
  ),
};
