/* v8 ignore next -- V8 attributes ESM module initialization to this import as a function. */
import { z } from 'zod';
import { definePlugin, type SpaceView } from '@project/resource-api/domain';

/**
 * The Space plugin's domain half (ADR 0068, ADR 0079, ADR 0142): a Resource
 * that shows one selected view of another, independently stored Space through
 * the host's Map embedding. Its one Space reference is the Space it shows,
 * whose lifetime it holds (ADR 0074); the core enforces cycles, lifetime and
 * rooting from that declaration (ADR 0128), and checks that its selection
 * resolves there from the selection it declares. Whether it is Open is what it
 * keeps on each Map.
 *
 * The selection is part of the Resource (ADR 0079): it names a Map of the
 * Space it shows and a Graph that Map owns from the moment it exists, and
 * never falls back to that Space's `defaultMap`. Framing is the centre and
 * scale saved for this window, absent until the view has been framed, and it
 * belongs to the Resource because two Space Resources may show one Map
 * differently.
 */

/** The Map-coordinate centre and scale one window onto another Space is framed at. */
export const spaceFramingSchema = z
  .object({
    centreX: z.number().finite(),
    centreY: z.number().finite(),
    zoom: z.number().positive().finite(),
  })
  .strict();

/** A Space Resource's content: the Space it shows, the Map and Graph it selects, and its framing. */
export const spaceContentSchema = z
  .object({
    spaceId: z.string().uuid(),
    map: z.string().uuid(),
    graph: z.string().uuid(),
    framing: spaceFramingSchema.optional(),
  })
  .strict();

/** A Space Resource's content. */
export type SpaceContent = z.infer<typeof spaceContentSchema>;

/** What a Space Resource keeps on one Map: whether it is Open there. */
export const spaceMapContentSchema = z.object({ open: z.boolean() }).strict();

/** What a Space Resource keeps on one Map. */
export type SpaceMapContent = z.infer<typeof spaceMapContentSchema>;

/** The view of the Space a Space Resource’s content shows. */
export const viewOf = (content: SpaceContent): SpaceView => ({
  spaceId: content.spaceId,
  map: content.map,
  graph: content.graph,
  framing: content.framing,
});

/**
 * The content showing `view`. The Space it shows is chosen once, at creation
 * (ADR 0068), so only the Map, the Graph and the framing change; a framing is
 * the Map's it was made on, so a different Map drops it.
 */
export const selectView = (content: SpaceContent, view: SpaceView): SpaceContent => {
  const selected = { spaceId: content.spaceId, map: view.map, graph: view.graph };
  const framing = view.map === content.map ? view.framing : undefined;
  return framing === undefined ? selected : { ...selected, framing };
};

export const spacePlugin = definePlugin({
  apiVersion: 1,
  kind: 'space',
  name: 'Space Resource',
  listName: 'Space Resources in this Space',
  referenceName: 'Reference to a Space Resource',
  content: spaceContentSchema,
  // No new content: a Space Resource is created with the Space it shows, by the
  // host's coordinated lifecycle (ADR 0074).
  mapContent: {
    schema: spaceMapContentSchema,
    default: { open: false },
    // With no Map, as on the Stage or inside a Reference, it shows its Map.
    withoutMap: { open: true },
  },
  mayBeTarget: true,
  spaceReferences: (content) => [content.spaceId],
  ownsReferencedSpaces: true,
  selection: { of: viewOf, select: selectView },
});
