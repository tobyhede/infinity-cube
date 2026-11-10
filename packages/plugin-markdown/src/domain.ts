/* v8 ignore next -- V8 attributes ESM module initialization to this import as a function. */
import { z } from 'zod';
import { assetRefSchema, definePlugin, EMPTY_ASSET } from '@project/resource-api/domain';

/**
 * The Markdown plugin's domain half (ADR 0020, ADR 0142): a Resource whose
 * text is an asset, exactly as an Image Resource's picture is. Its `content`
 * names that asset by URL, so a Resource file, a store and the wire hold the
 * same value and no file sits beside the Resource file. Whether it is Open is
 * what it keeps on each Map, so one Markdown Resource may be Open on one Map
 * and Closed on another.
 */

/** A Markdown Resource's content: the asset its text is. */
export const markdownContentSchema = z.object({ url: assetRefSchema }).strict();

/** A Markdown Resource's content. */
export type MarkdownContent = z.infer<typeof markdownContentSchema>;

/** What a Markdown Resource keeps on one Map: whether it is Open there. */
export const markdownMapContentSchema = z.object({ open: z.boolean() }).strict();

/** What a Markdown Resource keeps on one Map. */
export type MarkdownMapContent = z.infer<typeof markdownMapContentSchema>;

/** The media type a Markdown Resource's text is stored as. */
export const MARKDOWN_MEDIA_TYPE = 'text/markdown';

/**
 * Text as Markdown stores it: every line ending `\n`, so the bytes, and so the
 * asset's name, do not depend on the platform it was written on.
 */
export const markdownText = (text: string): string => text.replace(/\r\n?/g, '\n');

export const markdownPlugin = definePlugin({
  apiVersion: 1,
  kind: 'markdown',
  name: 'Markdown Resource',
  listName: 'Markdown Resources',
  referenceName: 'Reference to a Markdown Resource',
  content: markdownContentSchema,
  // A new one is empty, and the empty text is the asset of zero bytes, which
  // always exists: creating one stores nothing.
  newContent: { url: EMPTY_ASSET },
  mapContent: {
    schema: markdownMapContentSchema,
    default: { open: false },
    withoutMap: { open: true },
  },
  mayBeTarget: true,
});
