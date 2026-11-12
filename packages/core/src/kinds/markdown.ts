import { markdownPlugin } from '@project/plugin-markdown/domain';
import { kindFromPlugin, type PluginContent } from './plugin-kind';

/**
 * The Markdown kind (ADR 0020), drawn by the Markdown plugin (ADR 0142): a
 * Resource whose text is an asset its content names by URL, and which is Open
 * or Closed on each Map as its plugin's Map content says. This module reads
 * that plugin's domain half as a kind module; everything it says is the
 * plugin's.
 */
export const markdownKind = {
  ...kindFromPlugin(markdownPlugin),
  // An Open Reference Resource draws its Target in `CanvasResource`'s content
  // area, where the Markdown plugin draws its text read-only, until the
  // Reference plugin embeds it (`.scratch/resource-plugins/issues/06`).
  facts: { authored: false, embedsMap: false, drawsContentArea: true },
};

/** The Markdown kind's id. */
export type MarkdownKindId = typeof markdownKind.id;

/** What a Markdown Resource's content resolves to: its kind and the asset its text is. */
export type MarkdownContent = PluginContent<MarkdownKindId, typeof markdownKind.newContent>;
