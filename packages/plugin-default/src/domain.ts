/* v8 ignore next -- V8 attributes ESM module initialization to this import as a function. */
import { z } from 'zod';
import { definePlugin } from '@project/resource-api/domain';

/**
 * The default plugin's domain half (ADR 0142): the plugin the host selects for
 * a stored Resource whose kind names no plugin in this build. It is not in the
 * build-time plugin list, so it never matches a kind; the host reaches for it
 * when nothing else does.
 *
 * It reads nothing. Its content and Map content schemas accept any value, so
 * the host carries a Resource with no plugin whole, and the plugin that
 * returns reads that Resource as it stands. It declares no reference, so a
 * Resource it draws holds no other Resource and no Space. It may not become a
 * Target: nothing here can say whether the missing plugin lets its Resources be
 * one, and a Reference created now would leave the aggregate refused once a
 * plugin that says no returns. A Reference that already names one is carried
 * (`storedResourceReferenceProblems` in `@project/graph`).
 */

/** Whatever the Resource's content is: read by its own plugin, never by this one. */
export const unreadSchema = z.unknown();

export const defaultPlugin = definePlugin({
  apiVersion: 1,
  kind: 'default',
  name: 'Resource',
  listName: 'Resources',
  referenceName: 'Reference to a Resource',
  content: unreadSchema,
  mapContent: { schema: unreadSchema, default: {} },
});
