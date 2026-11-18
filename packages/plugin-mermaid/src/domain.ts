/* v8 ignore next -- V8 attributes ESM module initialization to this import as a function. */
import { z } from 'zod';
import { assetRefSchema, definePlugin, EMPTY_ASSET } from '@project/resource-api/domain';

/**
 * The Mermaid plugin's domain half (ADR 0142, ADR 0158): a Resource whose
 * Mermaid source is an asset. Its `content` names that asset by URL, and
 * whether it is Open is what it keeps on each Map, so one Mermaid Resource
 * may be Open on one Map and Closed on another.
 */

/** A Mermaid Resource's content: the asset its source is. */
export const mermaidContentSchema = z.object({ url: assetRefSchema }).strict();

/** A Mermaid Resource's content. */
export type MermaidContent = z.infer<typeof mermaidContentSchema>;

/** What a Mermaid Resource keeps on one Map: whether it is Open there. */
export const mermaidMapContentSchema = z.object({ open: z.boolean() }).strict();

/** What a Mermaid Resource keeps on one Map. */
export type MermaidMapContent = z.infer<typeof mermaidMapContentSchema>;

/** The media type a Mermaid Resource's source is stored as. */
export const MERMAID_MEDIA_TYPE = 'text/vnd.mermaid';

export const mermaidPlugin = definePlugin({
  apiVersion: 1,
  kind: 'mermaid',
  name: 'Mermaid Resource',
  listName: 'Mermaid Resources',
  referenceName: 'Reference to a Mermaid Resource',
  content: mermaidContentSchema,
  // A new one is empty, and the empty source is the asset of zero bytes, which
  // always exists: creating one stores nothing.
  newContent: { url: EMPTY_ASSET },
  mapContent: {
    schema: mermaidMapContentSchema,
    default: { open: false },
    withoutMap: { open: true },
  },
  mayBeTarget: true,
});
