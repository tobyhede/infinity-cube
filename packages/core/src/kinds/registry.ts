/* v8 ignore next -- V8 attributes ESM module initialization to this import as a function. */
import type { z } from 'zod';
import type { ContentFacts, ContentUnresolved, ContentVia } from '../resource-content';
import type { UUID } from '../types';
import type {
  KindFlags,
  KindMapContent,
  KindModule,
  SpaceSelection,
  SpaceSelectionProblem,
  SpaceSelectionTarget,
  SpaceView,
  SpaceViewChoice,
  StartsEmpty,
} from './kind-module';
import { imageKind } from './image';
import { markdownKind } from './markdown';
import { referenceKind } from './reference';
import { spaceKind } from './space';
import { urKind } from './ur';
import { PLUGIN_KINDS, type PluginKind } from './plugins';
import {
  RECTANGLE,
  type Outline,
  type Resource as ApiResource,
} from '@project/resource-api/domain';
import type { JsonValue } from '../json-value';

/**
 * The kinds, every one a module, registered with every build: the one place each
 * is registered. Their order is the order every list of kinds is drawn in.
 */
const REGISTERED = {
  [markdownKind.id]: markdownKind,
  [spaceKind.id]: spaceKind,
  [imageKind.id]: imageKind,
  [urKind.id]: urKind,
  [referenceKind.id]: referenceKind,
};
type Registered = typeof REGISTERED;

/** A Resource kind's id: one a module registers. */
export type KindId = keyof Registered;

/** Each kind's content, as its own schema parses it. */
type ContentByKind = { [K in KindId]: z.output<Registered[K]['contentSchema']> };
/** What each kind's content resolves to. */
type ResolvedByKind = { [K in KindId]: ReturnType<Registered[K]['resolveContent']> };

/** Each kind's module, typed so a rule over a kinded value calls its own kind's module. */
type KindModules = {
  readonly [K in KindId]: KindModule<K, ContentByKind[K], ResolvedByKind[K]>;
};

const KIND_MODULES: KindModules = REGISTERED;

/** Each plugin kind's Map content declaration, which a plugin always makes. */
const PLUGIN_MAP_CONTENT = {
  [imageKind.id]: imageKind.mapContent,
  [markdownKind.id]: markdownKind.mapContent,
  [referenceKind.id]: referenceKind.mapContent,
  [spaceKind.id]: spaceKind.mapContent,
  [urKind.id]: urKind.mapContent,
} satisfies Record<PluginKind, KindMapContent>;

/** A kinded value whose content is its kind's, correlated so its module accepts it. */
type Kinded<K extends KindId> = {
  [P in K]: { kind: P; content: ContentByKind[P] };
}[K];

/** The parser of a kinded value's content, answering it with its kind. */
type KindedParser<T> = z.ZodType<T, z.ZodTypeDef, unknown>;

/** A kind's parser of a Resource's content, the same in a store, a Resource file and on the wire. */
interface KindParsers<K extends KindId> {
  readonly content: KindedParser<Kinded<K>>;
}

const parsersOf = <K extends KindId>(kind: K): KindParsers<K> => ({
  content: KIND_MODULES[kind].contentSchema.transform((content) => ({ kind, content })),
});

const builtParsers = new Map<KindId, KindParsers<KindId>>();

/** A registered kind's parsers, built at its first use and kept, so a list of the kinds is not written twice. */
const parsersFor = (kind: KindId): KindParsers<KindId> => {
  const built = builtParsers.get(kind);
  if (built !== undefined) return built;
  const parsers = parsersOf(kind);
  builtParsers.set(kind, parsers);
  return parsers;
};

/** The one parser of a Resource's `content`: its kind's module's schema. */
export const contentParser = (kind: KindId): KindedParser<Kinded<KindId>> =>
  parsersFor(kind).content;

/**
 * A Resource: the Resource API's one structure (ADR 0142), its envelope `id`,
 * `title` and `kind`, and the content its kind's module parses. Typed from the
 * registry, so a kind is declared in its module and listed in this file, and
 * nowhere else; and instantiated from `Resource<C>`, so the core, the stores,
 * HTTP and a plugin take the same structure.
 */
export type Resource = {
  [K in KindId]: ApiResource<ContentByKind[K]> & { readonly id: UUID; readonly kind: K };
}[KindId];

/** A stored Resource document: a Resource less its id, which is stored beside it. */
export type ResourceDocument = {
  [K in KindId]: { title: string; kind: K; content: ContentByKind[K] };
}[KindId];

/** A Resource file as intake reads it: the Resource itself, one structure everywhere (ADR 0142). */
export type ResourceFileDocument = Resource;

/** Content a kind resolved, with whether it is the Resource's own or its content Target's. */
type Reached<Resolved> = Resolved extends unknown ? Resolved & { readonly via: ContentVia } : never;

/**
 * What a Resource's content is, as its kind resolves it. `unresolved` answers
 * only states intake refuses: a content Target that is missing or may not be one.
 */
export type ResourceContent = Reached<ResolvedByKind[KindId]> | ContentUnresolved;

/** What a Resource shows when its content Target is missing or may not be one: nothing. */
export const UNRESOLVED_CONTENT: ContentUnresolved = { kind: 'unresolved', via: 'target' };

/** Every registered kind's id, in registration order. */
export const KIND_IDS: readonly KindId[] = Object.values(KIND_MODULES).map(({ id }) => id);

/** Whether a module registers this kind with this build. */
export const isRegisteredKind = (kind: string): kind is KindId =>
  KIND_IDS.some((registered) => registered === kind);

/** The rules a kind declares for every Resource of it. */
export const kindFlags = (kind: KindId): KindFlags => KIND_MODULES[kind].flags;

/** Whether a plugin in this build draws this kind (ADR 0142). */
export const isPluginKind = (kind: string): kind is PluginKind =>
  PLUGIN_KINDS.some((pluginKind) => pluginKind === kind);

const mapContentOf = (kind: KindId): KindMapContent | undefined => KIND_MODULES[kind].mapContent;

/** Whether a Resource of this kind keeps Map content: whether a plugin draws it (ADR 0142). */
export const keepsMapContent = (kind: KindId): boolean => mapContentOf(kind) !== undefined;

/**
 * Why a Map entry may not hold this Map content for a Resource of this kind,
 * or `undefined` when it may: the kind's plugin's own schema answers, and a
 * kind no plugin draws keeps none.
 */
export const mapContentProblem = (kind: KindId, value: JsonValue): string | undefined => {
  const declared = mapContentOf(kind);
  if (declared === undefined) return `a ${kind} Resource keeps no Map content`;
  return declared.problem(value);
};

/**
 * The Map content a plugin is given for its Resource on a Map: what the entry
 * stores, else the plugin's default. `undefined` for a kind no plugin draws.
 */
export const resolvedMapContent = (
  kind: KindId,
  stored: JsonValue | undefined,
): JsonValue | undefined => {
  const declared = mapContentOf(kind);
  if (declared === undefined) return undefined;
  return stored ?? declared.default;
};

/** The Map content a plugin is given on a surface with no Map: its `withoutMap`, else its default. */
export const mapContentWithoutMap = (kind: PluginKind): JsonValue =>
  REGISTERED[kind].mapContent.withoutMap;

/**
 * The outline the canvas strokes a Resource's border and ring on (ADR 0142):
 * its plugin's, from the Map content the entry stores, else a rectangle.
 */
export const resourceOutline = (kind: KindId, stored: JsonValue | undefined): Outline => {
  const declared = mapContentOf(kind);
  if (declared === undefined) return RECTANGLE;
  return declared.outline(stored ?? declared.default);
};

/** A Resource, stored or not: what its kind's declarations are read from. */
export type KindedResource = Kinded<KindId>;

const resourceReferencesOf = <K extends KindId>(resource: Kinded<K>) =>
  KIND_MODULES[resource.kind].resourceReferences(resource.content);

/** The Resources this Resource's content references, which intake resolves. */
export const resourceReferences = (resource: KindedResource): readonly UUID[] =>
  resourceReferencesOf(resource);

const contentTargetOf = <K extends KindId>(resource: Kinded<K>) =>
  KIND_MODULES[resource.kind].contentTarget(resource.content);

/** The Resource whose content this one shows, when its kind shows another's (ADR 0070). */
export const contentTarget = (resource: KindedResource): UUID | undefined =>
  contentTargetOf(resource);

/** The Resource this one shows, where it shows one and `resourceOf` resolves it. */
const targetIn = (
  resource: KindedResource,
  resourceOf: (id: UUID) => KindedResource | undefined,
): KindedResource | undefined => {
  const targetId = contentTarget(resource);
  return targetId === undefined ? undefined : resourceOf(targetId);
};

/**
 * Whether a plugin in this build draws this Resource (ADR 0142): its kind's
 * plugin, and, for a Resource that shows a content Target, that Target's
 * kind's plugin too. A Target no plugin draws keeps the Resource showing it on
 * the application's own drawing; every kind in this build is a plugin's, so
 * none does. A missing Target is the plugin's to say, so a Resource showing
 * one is still its plugin's.
 */
export const drawnByPlugin = (
  resource: KindedResource,
  resourceOf: (id: UUID) => KindedResource | undefined,
): boolean => {
  if (!isPluginKind(resource.kind)) return false;
  if (contentTarget(resource) === undefined) return true;
  const target = targetIn(resource, resourceOf);
  return target === undefined || isPluginKind(target.kind);
};

/**
 * Whether a Resource may be Open by the application's rule, a Map entry's
 * `open` (ADR 0122): one no plugin draws whose content, its own or its
 * Target's, declares Open. A Resource a plugin draws keeps any Open in its
 * Map content (ADR 0142), so in this build no Resource takes one.
 */
export const takesOpen = (
  resource: KindedResource,
  resourceOf: (id: UUID) => KindedResource | undefined,
): boolean => {
  if (drawnByPlugin(resource, resourceOf)) return false;
  if (kindFlags(resource.kind).canOpen) return true;
  const target = targetIn(resource, resourceOf);
  return target !== undefined && kindFlags(target.kind).canOpen;
};

/** Whether a Resource of this kind may be another's Target (ADR 0113). */
export const mayBeTarget = (kind: KindId): boolean => kindFlags(kind).mayBeTarget;

const spaceReferencesOf = <K extends KindId>(resource: Kinded<K>) =>
  KIND_MODULES[resource.kind].spaceReferences(resource.content);

/** The Spaces this Resource's content references, from which the core enforces cycles and lifetime. */
export const spaceReferences = (resource: KindedResource): readonly UUID[] =>
  spaceReferencesOf(resource);

/** The Spaces whose lifetime this Resource holds: each lives while a reference holds it (ADR 0074). */
export const lifetimeSpaceReferences = (resource: KindedResource): readonly UUID[] =>
  kindFlags(resource.kind).ownsReferencedSpaces ? spaceReferences(resource) : [];

const selectionProblemOf = <K extends KindId>(resource: Kinded<K>, target: SpaceSelectionTarget) =>
  KIND_MODULES[resource.kind].selection?.problem(resource.content, target);

/** Why this Resource's selection does not resolve in its target Space, by its kind's own check. */
export const spaceSelectionProblem = (
  resource: KindedResource,
  target: SpaceSelectionTarget,
): SpaceSelectionProblem | undefined => selectionProblemOf(resource, target);

const selectionOf = <K extends KindId>(resource: Kinded<K>) =>
  KIND_MODULES[resource.kind].selection?.of(resource.content);

/** The view of another Space this Resource shows, when its kind shows one (ADR 0068). */
export const spaceSelection = (resource: KindedResource): SpaceView | undefined =>
  selectionOf(resource);

const reselectedOf = <K extends KindId>(
  resource: Kinded<K>,
  change: (
    selection: SpaceSelection<ContentByKind[K]>,
    content: ContentByKind[K],
  ) => ContentByKind[K],
): Kinded<K> | undefined => {
  const selection = KIND_MODULES[resource.kind].selection;
  return selection === undefined
    ? undefined
    : { ...resource, content: change(selection, resource.content) };
};

/**
 * The document showing `choice` in the Space it already shows, or `undefined`
 * when its kind shows none. A different Map drops the framing, which was the
 * old Map's.
 */
export const selectSpaceView = (
  document: ResourceDocument,
  choice: SpaceViewChoice,
): ResourceDocument | undefined => {
  const content = reselectedOf(document, (selection, current) => selection.select(current, choice));
  return content === undefined ? undefined : { ...document, ...content };
};

const resolveContentOf = <K extends KindId>(
  resource: Kinded<K>,
  via: ContentVia,
): ResourceContent => {
  const resolved: ResolvedByKind[KindId] = KIND_MODULES[resource.kind].resolveContent(
    resource.content,
  );
  return { ...resolved, via };
};

/**
 * What a Resource draws as its content, with at most one Target lookup: its
 * own, or the content Target's its kind names (ADR 0070), which the result says
 * and no kind module does. A missing Target and a Target that may not be one
 * are the states intake refuses, and resolve as unresolved.
 */
export const resolveContent = (
  resource: KindedResource,
  resourceOf: (id: UUID) => KindedResource | undefined,
): ResourceContent => {
  const targetId = contentTarget(resource);
  if (targetId === undefined) return resolveContentOf(resource, 'self');
  const target = resourceOf(targetId);
  if (target === undefined || !mayBeTarget(target.kind)) return UNRESOLVED_CONTENT;
  return resolveContentOf(target, 'target');
};

/** The facts of content that shows nothing. */
const UNRESOLVED_CONTENT_FACTS: ContentFacts = {
  authored: false,
  embedsMap: false,
  drawsContentArea: true,
};

/** What resolved content lets an author do and how it lays out, as its kind declares (ADR 0114). */
export const contentFacts = (content: ResourceContent): ContentFacts =>
  (content.kind === UNRESOLVED_CONTENT.kind ? undefined : KIND_MODULES[content.kind].facts) ??
  UNRESOLVED_CONTENT_FACTS;

const canonicalContentOf = <K extends KindId>(resource: Kinded<K>) =>
  KIND_MODULES[resource.kind].canonicalContent(resource.content);

/** A Resource with its content as Export writes it, so a file's bytes do not depend on how it was built. */
export const canonicalResource = <R extends KindedResource>(resource: R): R => ({
  ...resource,
  content: canonicalContentOf(resource),
});

/** The kind a Resource is created as when its author chooses none: a new Space's first, the canvas's Add. */
export const DEFAULT_KIND = markdownKind.id;

/** A kind whose module declares the content a new Resource of it starts with, so it may be created empty. */
export type EmptyCreatableKindId = {
  [K in KindId]: Registered[K] extends StartsEmpty<unknown> ? K : never;
}[KindId];

/** Each kind that may be created empty, typed so its new content is its own kind's. */
type EmptyCreatableModules = {
  readonly [K in EmptyCreatableKindId]: StartsEmpty<ContentByKind[K]>;
};

const EMPTY_CREATABLE_MODULES: EmptyCreatableModules = REGISTERED;

const newDocumentOf = <K extends EmptyCreatableKindId>(
  kind: K,
  title: string,
): { [P in K]: { kind: P; title: string; content: ContentByKind[P] } }[K] => ({
  kind,
  title,
  content: EMPTY_CREATABLE_MODULES[kind].newContent,
});

/** A new Resource of this kind with this Title and the content its kind starts with. */
export const newResourceDocument = (kind: EmptyCreatableKindId, title: string): ResourceDocument =>
  newDocumentOf(kind, title);

/** Whether a Resource of this kind may be created empty. */
export const startsEmpty = (kind: KindId): kind is EmptyCreatableKindId =>
  KIND_MODULES[kind].newContent !== undefined;

/** A new Resource of the default kind with this Title, its body empty. */
export const newDefaultResourceDocument = (title: string): ResourceDocument =>
  newResourceDocument(DEFAULT_KIND, title);

/**
 * A kind id as ADR 0128 fixes it: a bare id, or a vendor kind's
 * `vnd.<owner>.<name>`, each part ASCII letters, digits and hyphens starting
 * with a letter or digit.
 */
const KIND_ID =
  /^(?:[A-Za-z0-9][A-Za-z0-9-]*|vnd\.[A-Za-z0-9][A-Za-z0-9-]*\.[A-Za-z0-9][A-Za-z0-9-]*)$/u;

/** Whether a value is a well-formed kind id, registered or not. */
export const isKindId = (value: string): boolean => KIND_ID.test(value);
