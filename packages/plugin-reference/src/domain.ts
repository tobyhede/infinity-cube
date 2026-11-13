/* v8 ignore next -- V8 attributes ESM module initialization to this import as a function. */
import { z } from 'zod';
import { definePlugin } from '@project/resource-api/domain';

/**
 * The Reference plugin's domain half (ADR 0070, ADR 0089, ADR 0142): a
 * Resource that shows another, its Target, under its own Title. Its one
 * Resource reference is its Target, which intake resolves, and it may not
 * itself be a Target, so referencing is one hop (ADR 0113). Whether it is Open
 * is what it keeps on each Map, as a Markdown Resource keeps its own.
 */

/** A Reference Resource's content: the Resource it shows. */
export const referenceContentSchema = z
  .object({
    /** The id of the Resource this one shows, its one Resource reference. */
    target: z.string().uuid(),
  })
  .strict();

/** A Reference Resource's content. */
export type ReferenceContent = z.infer<typeof referenceContentSchema>;

/** What a Reference Resource keeps on one Map: whether it is Open there. */
export const referenceMapContentSchema = z.object({ open: z.boolean() }).strict();

/** What a Reference Resource keeps on one Map. */
export type ReferenceMapContent = z.infer<typeof referenceMapContentSchema>;

export const referencePlugin = definePlugin({
  apiVersion: 1,
  kind: 'reference',
  name: 'Reference Resource',
  listName: 'Reference Resources',
  referenceName: null,
  content: referenceContentSchema,
  // No new content: a Reference Resource is created from its Target, which
  // supplies it (ADR 0089).
  mapContent: {
    schema: referenceMapContentSchema,
    default: { open: false },
    // With no Map, as on the Stage, it shows its Target.
    withoutMap: { open: true },
  },
  resourceReferences: (content) => [content.target],
  contentTarget: (content) => content.target,
});
