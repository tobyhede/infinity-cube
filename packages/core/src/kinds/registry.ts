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
import { defaultKind } from './default';
import { PLUGIN_KINDS, type PluginKind } from './plugins';
import type { Outline, Resource as ApiResource } from '@project/resource-api/domain';
import { canonicalJsonObject, type JsonObject, type JsonValue } from '../json-value';

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

/** A kinded value whose content is its kind's, correlated so its module accepts it. */
type Kinded<K extends KindId> = {
  [P in K]: { kind: P; content: ContentByKind[P] };
}[K];

declare const missingKind: unique symbol;

/**
 * A well-formed kind id that names no plugin in this build (ADR 0142). Its
 * Resource is drawn by the default plugin, and its content is a JSON object
 * the host carries whole and never reads.
 */
export type MissingKind = string & { readonly [missingKind]: true };

/** A stored Resource's kind: one a plugin in this build draws, or one whose plugin is missing. */
export type ResourceKind = KindId | MissingKind;

/** A kinded value whose kind names no plugin in this build: its content is unread JSON. */
export type Unplugged = { kind: MissingKind; content: JsonObject };

/**
 * Whether a kinded value is of this kind, narrowing its content to that kind's.
 * Comparing `kind` alone does not narrow: a Resource with no plugin may carry
 * any kind id, so it stays in a union a comparison leaves.
 */
export const isOfKind = <T extends { readonly kind: ResourceKind }, K extends KindId>(
  value: T,
  kind: K,
): value is Extract<T, { readonly kind: K }> => value.kind === kind;

/** Whether a stored kind names no plugin in this build, so the default plugin draws its Resource. */
export const isMissingKind = (kind: ResourceKind): kind is MissingKind => !isRegisteredKind(kind);

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
export type Resource =
  | {
      [K in KindId]: ApiResource<ContentByKind[K]> & { readonly id: UUID; readonly kind: K };
    }[KindId]
  | (ApiResource<JsonObject> & { readonly id: UUID; readonly kind: MissingKind });

/** A stored Resource document: a Resource less its id, which is stored beside it. */
export type ResourceDocument =
  | {
      [K in KindId]: { title: string; kind: K; content: ContentByKind[K] };
    }[KindId]
  | { title: string; kind: MissingKind; content: JsonObject };

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

/** The rules a kind declares for every Resource of it: the default plugin's for a kind with no plugin. */
export const kindFlags = (kind: ResourceKind): KindFlags =>
  isRegisteredKind(kind) ? KIND_MODULES[kind].flags : defaultKind.flags;

/** Whether a plugin in this build draws this kind (ADR 0142). */
export const isPluginKind = (kind: string): kind is PluginKind =>
  PLUGIN_KINDS.some((pluginKind) => pluginKind === kind);

/** The Map content a Resource of this kind keeps: its plugin's, or the default plugin's (ADR 0142). */
const mapContentOf = (kind: ResourceKind): KindMapContent =>
  isRegisteredKind(kind) ? KIND_MODULES[kind].mapContent : defaultKind.mapContent;

/**
 * Why a Map entry may not hold this Map content for a Resource of this kind,
 * or `undefined` when it may: the kind's plugin's own schema answers.
 */
export const mapContentProblem = (kind: ResourceKind, value: JsonValue): string | undefined =>
  mapContentOf(kind).problem(value);

/** The Map content a plugin is given for its Resource on a Map: what the entry stores, else the plugin's default. */
export const resolvedMapContent = (kind: ResourceKind, stored: JsonValue | undefined): JsonValue =>
  stored ?? mapContentOf(kind).default;

/** The Map content a plugin is given on a surface with no Map: its `withoutMap`, else its default. */
export const mapContentWithoutMap = (kind: ResourceKind): JsonValue =>
  mapContentOf(kind).withoutMap;

/**
 * The outline the canvas strokes a Resource's border and ring on (ADR 0142):
 * its plugin's, from the Map content the entry stores, else a rectangle.
 */
export const resourceOutline = (kind: ResourceKind, stored: JsonValue | undefined): Outline => {
  const declared = mapContentOf(kind);
  return declared.outline(stored ?? declared.default);
};

/** A Resource, stored or not: what its kind's declarations are read from. */
export type KindedResource = Kinded<KindId> | Unplugged;

const resourceReferencesOf = <K extends KindId>(resource: Kinded<K>) =>
  KIND_MODULES[resource.kind].resourceReferences(resource.content);

/**
 * Whether a Resource's kind names a plugin in this build, so its content is
 * that plugin's to read. A Resource with no plugin is carried unread.
 */
const isPlugged = (resource: KindedResource): resource is Kinded<KindId> =>
  isRegisteredKind(resource.kind);

/**
 * The Resources this Resource's content references, which intake resolves.
 * None for a Resource with no plugin: nothing can read its content.
 */
export const resourceReferences = (resource: KindedResource): readonly UUID[] =>
  isPlugged(resource) ? resourceReferencesOf(resource) : [];

const contentTargetOf = <K extends KindId>(resource: Kinded<K>) =>
  KIND_MODULES[resource.kind].contentTarget(resource.content);

/** The Resource whose content this one shows, when its kind shows another's (ADR 0070). */
export const contentTarget = (resource: KindedResource): UUID | undefined =>
  isPlugged(resource) ? contentTargetOf(resource) : undefined;

/** Whether a Resource of this kind may be another's Target (ADR 0113). */
export const mayBeTarget = (kind: ResourceKind): boolean => kindFlags(kind).mayBeTarget;

const spaceReferencesOf = <K extends KindId>(resource: Kinded<K>) =>
  KIND_MODULES[resource.kind].spaceReferences(resource.content);

/** The Spaces this Resource's content references, from which the core enforces cycles and lifetime. */
export const spaceReferences = (resource: KindedResource): readonly UUID[] =>
  isPlugged(resource) ? spaceReferencesOf(resource) : [];

/** The Spaces whose lifetime this Resource holds: each lives while a reference holds it (ADR 0074). */
export const lifetimeSpaceReferences = (resource: KindedResource): readonly UUID[] =>
  kindFlags(resource.kind).ownsReferencedSpaces ? spaceReferences(resource) : [];

const selectionProblemOf = <K extends KindId>(resource: Kinded<K>, target: SpaceSelectionTarget) =>
  KIND_MODULES[resource.kind].selection?.problem(resource.content, target);

/** Why this Resource's selection does not resolve in its target Space, by its kind's own check. */
export const spaceSelectionProblem = (
  resource: KindedResource,
  target: SpaceSelectionTarget,
): SpaceSelectionProblem | undefined =>
  isPlugged(resource) ? selectionProblemOf(resource, target) : undefined;

const selectionOf = <K extends KindId>(resource: Kinded<K>) =>
  KIND_MODULES[resource.kind].selection?.of(resource.content);

/** The view of another Space this Resource shows, when its kind shows one (ADR 0068). */
export const spaceSelection = (resource: KindedResource): SpaceView | undefined =>
  isPlugged(resource) ? selectionOf(resource) : undefined;

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
  if (!isPlugged(document)) return undefined;
  const content = reselectedOf(document, (selection, current) => selection.select(current, choice));
  return content === undefined ? undefined : { ...document, ...content };
};

const pluggedContentOf = <K extends KindId>(
  resource: Kinded<K>,
  via: ContentVia,
): ResourceContent => {
  const resolved: ResolvedByKind[KindId] = KIND_MODULES[resource.kind].resolveContent(
    resource.content,
  );
  return { ...resolved, via };
};

/** What a Resource's own content resolves to: nothing, where no plugin in this build reads it. */
const resolveContentOf = (resource: KindedResource, via: ContentVia): ResourceContent =>
  isPlugged(resource) ? pluggedContentOf(resource, via) : { kind: UNRESOLVED_CONTENT.kind, via };

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

/**
 * A Resource with its content as Export writes it, so a file's bytes do not
 * depend on how it was built or which store answered it. A Resource with no
 * plugin has its content's keys sorted at every depth, the one canonical form
 * of a value nothing here reads (`canonicalJsonValue`).
 */
export const canonicalResource = <R extends KindedResource>(resource: R): R => {
  const kinded: KindedResource = resource;
  return isPlugged(kinded)
    ? { ...resource, content: canonicalContentOf(kinded) }
    : { ...resource, content: canonicalJsonObject(kinded.content) };
};

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

/** What a kind id is, in the words a refusal of one that is not uses. */
export const KIND_ID_FORM =
  'a bare id or vnd.<owner>.<name>, each part ASCII letters, digits and hyphens';

/** Whether a value is a well-formed kind id, registered or not. */
export const isKindId = (value: string): boolean => KIND_ID.test(value);

/** Whether a value is a well-formed kind id no plugin in this build draws: a missing plugin's kind. */
export const isMissingKindId = (value: string): value is MissingKind =>
  !isRegisteredKind(value) && isKindId(value);

/**
 * Whether a plugin draws a Resource of this kind: its own plugin, or the
 * default plugin where the kind's plugin is missing.
 */
export const isPluginDrawnKind = (kind: string): boolean =>
  isPluginKind(kind) || isMissingKindId(kind);
