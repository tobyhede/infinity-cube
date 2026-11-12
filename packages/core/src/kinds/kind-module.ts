/* v8 ignore next -- V8 attributes ESM module initialization to this import as a function. */
import type { z } from 'zod';
import type { ContentFacts } from '../resource-content';
import type { UUID } from '../types';
import type { Outline, SpaceFraming as ApiSpaceFraming } from '@project/resource-api/domain';
import type { JsonValue } from '../json-value';

/**
 * What a kind says about the rules every Resource meets, so that no rule names
 * a kind (ADR 0128). The core reads these; a module sets them.
 */
export interface KindFlags {
  /** Whether a Resource of this kind may be Open (ADR 0122). */
  readonly canOpen: boolean;
  /** Whether another Resource may reference one of this kind as its Target, which keeps referencing a single hop (ADR 0113). */
  readonly mayBeTarget: boolean;
  /** Whether a Space this kind references lives by that reference, and is deleted with its last (ADR 0074). */
  readonly ownsReferencedSpaces: boolean;
}

/**
 * What a plugin keeps for its Resource on one Map (ADR 0142), as the core holds
 * it: JSON values it stores, compares and carries without reading, and the
 * plugin's own answers about one.
 */
export interface KindMapContent {
  /** The value where a Map entry stores none. */
  readonly default: JsonValue;
  /** The value on a surface with no Map. */
  readonly withoutMap: JsonValue;
  /** Why the plugin's schema refuses this value, or `undefined` when it accepts it. */
  readonly problem: (value: JsonValue) => string | undefined;
  /** The outline the canvas strokes for this value (ADR 0135, ADR 0139). */
  readonly outline: (value: JsonValue) => Outline;
}

/** The Map-coordinate centre and scale one window onto another Space is framed at. */
export type SpaceFraming = ApiSpaceFraming;

/**
 * The view of another Space a Resource shows: the Space, a Map of it, a Graph
 * that Map owns, and how the window is framed. It is not the Resource, because
 * a drawn Resource names nothing outside itself (ADR 0083). `framing` is a
 * required key that may hold `undefined`, so a value is built whole rather than
 * by a conditional spread.
 */
export interface SpaceView {
  readonly spaceId: UUID;
  readonly map: UUID;
  readonly graph: UUID;
  readonly framing: SpaceFraming | undefined;
}

/** What a selection is checked against: the Space it shows, as the core reads it. */
export interface SpaceSelectionTarget {
  /** The ids of the Graphs a Map of the target owns, or `undefined` when it has no such Map. */
  readonly mapGraphIds: (mapId: UUID) => readonly UUID[] | undefined;
  /** Whether the target has a Graph with this id. */
  readonly hasGraph: (graphId: UUID) => boolean;
}

/** Why a selection does not resolve in the Space it shows. */
export type SpaceSelectionProblem =
  | { readonly kind: 'space-resource-map-missing'; readonly mapId: UUID }
  | { readonly kind: 'space-resource-graph-missing'; readonly graphId: UUID }
  | {
      readonly kind: 'space-resource-graph-outside-map';
      readonly mapId: UUID;
      readonly graphId: UUID;
    };

/**
 * The core's check of a selection (ADR 0079, ADR 0128): its Map and Graph
 * resolve in the Space it shows, and the Graph is the Map's. The selection's
 * own Map, with no fallback to that Space's `defaultMap`: a selection names a
 * Map from the moment it exists, so one that resolves to nothing is a dangling
 * reference to a deleted Map rather than an unmade choice.
 */
export const selectionProblem = (
  view: Pick<SpaceView, 'map' | 'graph'>,
  target: SpaceSelectionTarget,
): SpaceSelectionProblem | undefined => {
  const graphIds = target.mapGraphIds(view.map);
  if (graphIds === undefined) return { kind: 'space-resource-map-missing', mapId: view.map };
  if (!target.hasGraph(view.graph)) {
    return { kind: 'space-resource-graph-missing', graphId: view.graph };
  }
  if (!graphIds.includes(view.graph)) {
    return { kind: 'space-resource-graph-outside-map', mapId: view.map, graphId: view.graph };
  }
  return undefined;
};

/** A Map and one of its Graphs, chosen in the Space a selection shows. */
export type SpaceViewChoice = Pick<SpaceView, 'map' | 'graph'>;

/**
 * How a kind whose content shows a view of another Space reads and changes it
 * (ADR 0068, ADR 0079), so that no reader outside the kind compares its
 * `spaceId`, `map` and `graph` by kind.
 */
export interface SpaceSelection<Content> {
  /** The Space, Map and Graph this content shows, and its framing. */
  readonly of: (content: Content) => SpaceView;
  /** The content showing `choice` in the same Space. A framing is the old Map's, so a different Map drops it. */
  readonly select: (content: Content, choice: SpaceViewChoice) => Content;
  /** The kind's own check of this content's selection in a target Space it alone understands. */
  readonly problem: (
    content: Content,
    target: SpaceSelectionTarget,
  ) => SpaceSelectionProblem | undefined;
}

/** What a kind's content resolves to, tagged with a kind. Whether it is the Resource's own is the registry's to say. */
export interface KindResolvedContent {
  readonly kind: string;
}

/**
 * A Resource kind (ADR 0120): its id, the schema its `content` is
 * parsed by, and every rule it declares. The core reads these and names no
 * kind; a kind with nothing to say about a rule takes `defineKind`'s answer.
 * The view half is the application's.
 */
export interface KindModule<
  K extends string,
  Content,
  Resolved extends KindResolvedContent = KindResolvedContent,
> {
  readonly id: K;
  /**
   * The one parser of this kind's `content`, strict, for a stored document, a
   * Resource file and the wire alike: the envelope parses `content` through it
   * (ADR 0128, ADR 0142).
   */
  readonly contentSchema: z.ZodType<Content, z.ZodTypeDef, unknown>;
  readonly flags: KindFlags;
  /** What this kind's content resolves to, however the Resource showing it reached it. */
  readonly resolveContent: (content: Content) => Resolved;
  /** The Resources this content references, which intake resolves. */
  readonly resourceReferences: (content: Content) => readonly UUID[];
  /** The Resource whose content this one shows, when it shows another's (ADR 0070). */
  readonly contentTarget: (content: Content) => UUID | undefined;
  /** The Spaces this content references, from which the core enforces cycles, lifetime and rooting. */
  readonly spaceReferences: (content: Content) => readonly UUID[];
  /** How this kind's content shows a view of another Space, when it shows one. */
  readonly selection?: SpaceSelection<Content>;
  /** The content as Export writes it, so a file's bytes do not depend on how it was built. */
  readonly canonicalContent: (content: Content) => Content;
  /** What an author may do with this kind's own content and how it lays out, when it owns content (ADR 0114). */
  readonly facts?: ContentFacts;
  /** The content a new Resource of this kind starts with, when it may be created empty. */
  readonly newContent?: Content;
  /** What a Resource of this kind keeps on each Map, when a plugin draws the kind (ADR 0142). */
  readonly mapContent?: KindMapContent;
}

/**
 * A kind a Resource may be created as from nothing but a press: its module
 * declares the content a new one starts with, and its type says so, so the
 * kinds that may be created empty are derived from the modules rather than
 * listed.
 */
export interface StartsEmpty<Content> {
  readonly newContent: Content;
}

/** The rules every kind declares, since each is a plugin and the plugin answers them (ADR 0142). */
type DeclaredRule =
  | 'id'
  | 'contentSchema'
  | 'flags'
  | 'resolveContent'
  | 'resourceReferences'
  | 'contentTarget'
  | 'spaceReferences';

/** What a kind must declare; the rest takes {@link defineKind}'s answer. */
type KindDeclaration<K extends string, Content, Resolved extends KindResolvedContent> = Pick<
  KindModule<K, Content, Resolved>,
  DeclaredRule
> &
  Partial<Omit<KindModule<K, Content, Resolved>, DeclaredRule>>;

/** The content in its schema's key order, or as given when the schema refuses it, so this never throws. */
const inSchemaOrder =
  <Content>(schema: z.ZodType<Content, z.ZodTypeDef, unknown>) =>
  (content: Content): Content => {
    const parsed = schema.safeParse(content);
    return parsed.success ? parsed.data : content;
  };

/**
 * A kind module with every rule it does not declare answered as a kind that
 * has no content of its own to author and puts its content in its schema's
 * key order on Export. A module that declares the
 * content a new Resource starts with keeps it in its type.
 */
export function defineKind<const K extends string, Content, Resolved extends KindResolvedContent>(
  declaration: KindDeclaration<K, Content, Resolved> & StartsEmpty<Content>,
): KindModule<K, Content, Resolved> & StartsEmpty<Content>;
export function defineKind<const K extends string, Content, Resolved extends KindResolvedContent>(
  declaration: KindDeclaration<K, Content, Resolved>,
): KindModule<K, Content, Resolved>;
export function defineKind<K extends string, Content, Resolved extends KindResolvedContent>(
  declaration: KindDeclaration<K, Content, Resolved>,
): KindModule<K, Content, Resolved> {
  return {
    canonicalContent: inSchemaOrder(declaration.contentSchema),
    ...declaration,
  };
}
