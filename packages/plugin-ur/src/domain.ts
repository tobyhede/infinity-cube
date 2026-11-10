/* v8 ignore next -- V8 attributes ESM module initialization to this import as a function. */
import { z } from 'zod';
import { definePlugin, OUTLINES, type Outline } from '@project/resource-api/domain';

/**
 * The Ur plugin's domain half (ADR 0113, ADR 0142): a Resource with no
 * content, drawn as its Title in the Shape its Map keeps for it (ADR 0121).
 * The Shape is Map content, so one Ur Resource may be an ellipse on one Map and
 * a diamond on another, and it is the outline the canvas strokes.
 */

/** An Ur Resource's content, which is nothing (ADR 0113). */
export const urContentSchema = z.object({}).strict();

/** An Ur Resource's content. */
export type UrContent = z.infer<typeof urContentSchema>;

/** What an Ur Resource keeps on one Map: the Shape it is drawn in there. */
export const urMapContentSchema = z.object({ shape: z.enum(OUTLINES) }).strict();

/** What an Ur Resource keeps on one Map. */
export type UrMapContent = z.infer<typeof urMapContentSchema>;

/** The Shape an Ur Resource takes where its Map stores none, and where there is no Map. */
const RECTANGULAR: UrMapContent = { shape: 'rectangle' };

/** The Shape a Map draws an Ur Resource in. */
const outlineOf = (mapContent: UrMapContent): Outline => mapContent.shape;

export const urPlugin = definePlugin({
  apiVersion: 1,
  kind: 'ur',
  name: 'Ur Resource',
  listName: 'Ur Resources',
  referenceName: 'Reference to an Ur Resource',
  content: urContentSchema,
  newContent: {},
  mapContent: { schema: urMapContentSchema, default: RECTANGULAR },
  outline: outlineOf,
  mayBeTarget: true,
});
