import { z } from 'zod';
import {
  OUTLINES,
  RECTANGLE,
  type MapContentDeclaration,
  type Outline,
  type Resource as ApiResource,
  type ResourcePlugin,
  type SelectionDeclaration,
  type SpaceView as ApiSpaceView,
} from '@project/resource-api/domain';
import { DEFAULT_PLUGIN, PLUGINS } from '@project/plugins/domain';
import {
  canonicalJsonObject,
  jsonValueSchema,
  type JsonObject,
  type JsonValue,
} from './json-value';
import type { ContentFacts, ContentUnresolved, ContentVia } from './resource-content';
import type { UUID } from './types';
import { uuidSchema } from './uuid';
import {
  selectionProblem,
  type KindFlags,
  type KindMapContent,
  type PluginContent,
  type PluginModule,
  type SpaceSelection,
  type SpaceSelectionProblem,
  type SpaceSelectionTarget,
  type SpaceView,
  type SpaceViewChoice,
} from './plugin-module';

/**
 * The build's plugins as the core reads them (ADR 0142): each plugin in the
 * build's list (`@project/plugins/domain`), read once into what the core asks
 * of a kind, and the default plugin, which answers for a kind no plugin in
 * this build draws. A kind is a string this list resolves; the core holds
 * every Resource's content as it stores it and asks the plugin's own schema
 * about it, so no type here is any one kind's.
 */

/** What content a plugin draws in its own rect says about a host-drawn content area: nothing. */
const PLUGIN_CONTENT_FACTS: ContentFacts = {
  authored: false,
  embedsMap: false,
  drawsContentArea: false,
};

/**
 * What content showing another Space's Map says (ADR 0068): it embeds a Map,
 * which it authors where it is its own.
 */
const SELECTING_CONTENT_FACTS: ContentFacts = {
  authored: true,
  embedsMap: true,
  drawsContentArea: false,
};

/** The issues a schema raised, as one sentence. */
const describeIssues = (issues: readonly { readonly message: string }[]): string =>
  issues.map(({ message }) => message).join('; ');

const isOutline = (value: string): value is Outline => OUTLINES.some((name) => name === value);

/**
 * The outline a plugin declares for a Map content value its schema accepted:
 * a rectangle where it declares none. Throws what the plugin's `outline`
 * throws, and when it answers anything but one of `OUTLINES`, so a host can
 * report either as that Resource's failure (ADR 0142).
 */
export function declaredOutline<M>(
  plugin: Pick<ResourcePlugin<unknown, M>, 'kind' | 'outline'>,
  mapContent: M,
): Outline {
  if (plugin.outline === undefined) return RECTANGLE;
  // Typed an outline, but a plugin's answer is checked: it is the plugin's code.
  const answered: string = plugin.outline(mapContent);
  if (isOutline(answered)) return answered;
  throw new Error(
    `The "${plugin.kind}" plugin declared the outline "${answered}", which is not one of ${OUTLINES.join(', ')}.`,
  );
}

/**
 * A plugin's Map content as JSON values the core can store, compare and carry:
 * its default and its value with no Map, each checked to be JSON once, here,
 * and the plugin's schema and outline behind a JSON value. The outline the
 * canvas strokes is a rectangle where the plugin's throws or answers no
 * outline: projecting the canvas never runs plugin code that can fail it, and
 * the plugin's host reports the failure on the Resource itself.
 */
function mapContentOf<M>(
  plugin: Pick<ResourcePlugin<unknown, M>, 'kind' | 'outline'>,
  declaration: MapContentDeclaration<M>,
): KindMapContent {
  const kind = plugin.kind;
  const asJson = (value: M, which: string): JsonValue => {
    const parsed = jsonValueSchema.safeParse(value);
    if (!parsed.success)
      throw new Error(`The "${kind}" plugin's ${which} Map content is not JSON.`);
    return parsed.data;
  };
  const defaultValue = asJson(declaration.default, 'default');
  return {
    default: defaultValue,
    withoutMap:
      declaration.withoutMap === undefined
        ? defaultValue
        : asJson(declaration.withoutMap, 'without-Map'),
    problem: (value) => {
      const parsed = declaration.schema.safeParse(value);
      return parsed.success ? undefined : describeIssues(parsed.error.issues);
    },
    outline: (value) => {
      const parsed = declaration.schema.safeParse(value);
      try {
        return declaredOutline(plugin, parsed.success ? parsed.data : declaration.default);
      } catch {
        return RECTANGLE;
      }
    },
  };
}

/** Every id a plugin declares for its content, Resources and Spaces alike. */
function declaredIds<C, M>(plugin: ResourcePlugin<C, M>, content: C): readonly string[] {
  const target = plugin.contentTarget?.(content);
  return [
    ...(plugin.resourceReferences?.(content) ?? []),
    ...(target === undefined ? [] : [target]),
    ...(plugin.spaceReferences?.(content) ?? []),
  ];
}

/**
 * The plugin's content schema, which also refuses content declaring an id
 * that is not a UUID: such an id names nothing the core can resolve, so the
 * Resource is refused where its content is parsed, at intake among them,
 * rather than its reference going unreported.
 */
function contentSchemaOf<C, M>(plugin: ResourcePlugin<C, M>): z.ZodType<C, z.ZodTypeDef, unknown> {
  // Piped, so only content the plugin's schema accepted is read for its ids:
  // content it refused is reported once, by the schema, and an id named twice
  // (a Target is also a Resource reference) is reported once.
  const declaresOnlyUuids = z
    .custom<C>(() => true)
    .superRefine((content, context) => {
      for (const id of new Set(declaredIds(plugin, content))) {
        if (uuidSchema.safeParse(id).success) continue;
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `The "${plugin.kind}" plugin's content names "${id}" as a reference, which is not a UUID.`,
        });
      }
    });
  return plugin.content.pipe(declaresOnlyUuids);
}

/** The ids a plugin declares, as the core's UUIDs: content its schema accepted names only UUIDs. */
const uuids = (ids: readonly string[]): readonly UUID[] => ids.map((id) => uuidSchema.parse(id));

/** A view a plugin declares, with its ids as the core's UUIDs; its content schema holds them to UUIDs. */
const coreView = (view: ApiSpaceView): SpaceView => ({
  spaceId: uuidSchema.parse(view.spaceId),
  map: uuidSchema.parse(view.map),
  graph: uuidSchema.parse(view.graph),
  framing: view.framing,
});

/**
 * A plugin's selection read as the core reads every selection (ADR 0079): its
 * view, the content showing a choice, and the core's own check
 * that the selection resolves in the Space it shows (ADR 0128). Content the
 * plugin's schema refuses has no selection to read, and is left as it is.
 */
function selectionOf<C>(
  schema: z.ZodType<C, z.ZodTypeDef, unknown>,
  declared: SelectionDeclaration<C>,
  asJson: (content: C) => JsonValue,
): SpaceSelection<JsonValue> {
  const parse = (content: JsonValue): C => schema.parse(content);
  const of = (content: JsonValue): SpaceView => coreView(declared.of(parse(content)));
  return {
    of,
    select: (content, choice) =>
      asJson(declared.select(parse(content), { ...of(content), ...choice })),
    problem: (content, target) => selectionProblem(of(content), target),
  };
}

/**
 * A plugin read as the core reads every kind: its content schema, the
 * references it declares, and its Map content, where any Open or Shape it
 * keeps lives. Each rule parses the content it is given with the plugin's own
 * schema, so a plugin's types are its own end to end; content the schema
 * refuses declares nothing.
 */
export function moduleOf<C, M>(plugin: ResourcePlugin<C, M>): PluginModule {
  const kind = plugin.kind;
  // Content is JSON wherever the host holds it (ADR 0142), so content a plugin
  // builds itself is checked to be JSON as the core takes it.
  const asJson = (content: C): JsonValue => {
    const parsed = jsonValueSchema.safeParse(content);
    if (!parsed.success) throw new Error(`The "${kind}" plugin built content that is not JSON.`);
    return parsed.data;
  };
  const schema = contentSchemaOf(plugin);
  const contentSchema = schema.pipe(jsonValueSchema);
  const read =
    <T>(fallback: T, rule: (content: C) => T) =>
    (content: JsonValue): T => {
      const parsed = schema.safeParse(content);
      return parsed.success ? rule(parsed.data) : fallback;
    };
  return {
    id: kind,
    contentSchema,
    flags: {
      mayBeTarget: plugin.mayBeTarget === true,
      ownsReferencedSpaces: plugin.ownsReferencedSpaces === true,
    },
    facts: plugin.selection === undefined ? PLUGIN_CONTENT_FACTS : SELECTING_CONTENT_FACTS,
    resolveContent: (content) => ({ kind, content }),
    resourceReferences: read([], (content) => uuids(plugin.resourceReferences?.(content) ?? [])),
    contentTarget: read(undefined, (content) => {
      const target = plugin.contentTarget?.(content);
      return target === undefined ? undefined : uuids([target])[0];
    }),
    spaceReferences: read([], (content) => uuids(plugin.spaceReferences?.(content) ?? [])),
    // A plugin that declares its selection has the core check it (ADR 0079).
    selection:
      plugin.selection === undefined ? undefined : selectionOf(schema, plugin.selection, asJson),
    // The content in its schema's key order, or as given when the schema refuses it.
    canonicalContent: (content) => {
      const parsed = contentSchema.safeParse(content);
      return parsed.success ? parsed.data : content;
    },
    newContent: plugin.newContent === undefined ? undefined : asJson(plugin.newContent),
    mapContent: mapContentOf(plugin, plugin.mapContent),
  };
}

/** Every plugin in the build's list, read as the core reads a kind, in list order. */
const MODULES: readonly PluginModule[] = PLUGINS.map((plugin) => moduleOf(plugin));

/** The default plugin, read as a kind: what answers for a kind no plugin in this build draws. */
const DEFAULT_MODULE = moduleOf(DEFAULT_PLUGIN);

/** A stored Resource's kind: a string the build's list resolves to a plugin, or to the default plugin. */
export type ResourceKind = string;

/** The kinds a plugin in this build draws, in list order: the order every choice among kinds is offered in. */
export const PLUGIN_KINDS: readonly string[] = MODULES.map(({ id }) => id);

/** The plugin in this build that draws this kind, if one does. */
const listedModule = (kind: string): PluginModule | undefined =>
  MODULES.find(({ id }) => id === kind);

/** The plugin that answers for this kind: its own, or the default plugin where it has none. */
const moduleFor = (kind: string): PluginModule => listedModule(kind) ?? DEFAULT_MODULE;

/** Whether a plugin in this build draws this kind (ADR 0142). */
export const isPluginKind = (kind: string): boolean => listedModule(kind) !== undefined;

/** Whether a stored kind names no plugin in this build, so the default plugin draws its Resource. */
export const isMissingKind = (kind: string): boolean => !isPluginKind(kind);

/** The one parser of a Resource's `content`, where a plugin in this build draws its kind. */
export const contentParser = (
  kind: string,
): z.ZodType<JsonValue, z.ZodTypeDef, unknown> | undefined => listedModule(kind)?.contentSchema;

/**
 * A Resource: the Resource API's one structure (ADR 0142), its envelope `id`,
 * `title` and `kind`, and the content its plugin's schema parses, held as it is
 * stored. To the host every Resource is the same structure; what it needs from
 * `content` it asks the plugin's declarations.
 */
export type Resource = ApiResource<JsonValue> & { readonly id: UUID };

/** A stored Resource document: a Resource less its id, which is stored beside it. */
export type ResourceDocument = {
  readonly title: string;
  readonly kind: string;
  readonly content: JsonValue;
};

/** A Resource file as intake reads it: the Resource itself, one structure everywhere (ADR 0142). */
export type ResourceFileDocument = Resource;

/** A Resource, stored or not: what its kind's declarations are read from. */
export interface KindedResource {
  readonly kind: string;
  readonly content: JsonValue;
}

/**
 * What a Resource's content is, as its plugin resolves it. `unresolved` answers
 * only states intake refuses: a content Target that is missing or may not be one.
 */
export type ResourceContent = (PluginContent & { readonly via: ContentVia }) | ContentUnresolved;

/** What a Resource shows when its content Target is missing or may not be one: nothing. */
export const UNRESOLVED_CONTENT: ContentUnresolved = { kind: 'unresolved', via: 'target' };

/** Whether content resolved to a plugin's, which its view draws, rather than to nothing. */
export const isResolvedContent = (
  content: ResourceContent,
): content is PluginContent & { readonly via: ContentVia } => 'content' in content;

/** The rules a kind declares for every Resource of it: the default plugin's for a kind with no plugin. */
export const kindFlags = (kind: string): KindFlags => moduleFor(kind).flags;

/**
 * Why a Map entry may not hold this Map content for a Resource of this kind,
 * or `undefined` when it may: the kind's plugin's own schema answers.
 */
export const mapContentProblem = (kind: string, value: JsonValue): string | undefined =>
  moduleFor(kind).mapContent.problem(value);

/** The Map content a plugin is given for its Resource on a Map: what the entry stores, else the plugin's default. */
export const resolvedMapContent = (kind: string, stored: JsonValue | undefined): JsonValue =>
  stored ?? moduleFor(kind).mapContent.default;

/** The Map content a plugin is given on a surface with no Map: its `withoutMap`, else its default. */
export const mapContentWithoutMap = (kind: string): JsonValue =>
  moduleFor(kind).mapContent.withoutMap;

/**
 * The outline the canvas strokes a Resource's border and ring on (ADR 0142):
 * its plugin's, from the Map content the entry stores, else a rectangle.
 */
export const resourceOutline = (kind: string, stored: JsonValue | undefined): Outline => {
  const declared = moduleFor(kind).mapContent;
  return declared.outline(stored ?? declared.default);
};

/**
 * The Resources this Resource's content references, which intake resolves.
 * None for a Resource with no plugin: nothing can read its content.
 */
export const resourceReferences = (resource: KindedResource): readonly UUID[] =>
  moduleFor(resource.kind).resourceReferences(resource.content);

/** The Resource whose content this one shows, when its plugin shows another's (ADR 0070). */
export const contentTarget = (resource: KindedResource): UUID | undefined =>
  moduleFor(resource.kind).contentTarget(resource.content);

/** Whether a Resource of this kind may be another's Target (ADR 0113). */
export const mayBeTarget = (kind: string): boolean => kindFlags(kind).mayBeTarget;

/** Whether a Resource of this kind shows another's content, as a Reference does (ADR 0070). */
export const showsTarget = (resource: KindedResource): boolean =>
  contentTarget(resource) !== undefined;

/** The Spaces this Resource's content references, from which the core enforces cycles and lifetime. */
export const spaceReferences = (resource: KindedResource): readonly UUID[] =>
  moduleFor(resource.kind).spaceReferences(resource.content);

/** The Spaces whose lifetime this Resource holds: each lives while a reference holds it (ADR 0074). */
export const lifetimeSpaceReferences = (resource: KindedResource): readonly UUID[] =>
  kindFlags(resource.kind).ownsReferencedSpaces ? spaceReferences(resource) : [];

/** Why this Resource's selection does not resolve in its target Space, by its plugin's own check. */
export const spaceSelectionProblem = (
  resource: KindedResource,
  target: SpaceSelectionTarget,
): SpaceSelectionProblem | undefined =>
  moduleFor(resource.kind).selection?.problem(resource.content, target);

/** The view of another Space this Resource shows, when its plugin shows one (ADR 0068). */
export const spaceSelection = (resource: KindedResource): SpaceView | undefined =>
  moduleFor(resource.kind).selection?.of(resource.content);

/**
 * The document showing `choice` in the Space it already shows, or `undefined`
 * when its plugin shows none. A different Map drops the framing, which was the
 * old Map's.
 */
export const selectSpaceView = (
  document: ResourceDocument,
  choice: SpaceViewChoice,
): ResourceDocument | undefined => {
  const selection = moduleFor(document.kind).selection;
  return selection === undefined
    ? undefined
    : { ...document, content: selection.select(document.content, choice) };
};

/** What a Resource's own content resolves to: nothing, where no plugin in this build reads it. */
const resolveContentOf = (resource: KindedResource, via: ContentVia): ResourceContent => {
  const listed = listedModule(resource.kind);
  return listed === undefined
    ? { kind: UNRESOLVED_CONTENT.kind, via }
    : { ...listed.resolveContent(resource.content), via };
};

/**
 * What a Resource draws as its content, with at most one Target lookup: its
 * own, or the content Target's its plugin names (ADR 0070), which the result
 * says and no plugin does. A missing Target and a Target that may not be one
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

/** What resolved content lets an author do and how it lays out, as its plugin declares (ADR 0114). */
export const contentFacts = (content: ResourceContent): ContentFacts =>
  isResolvedContent(content)
    ? (listedModule(content.kind)?.facts ?? UNRESOLVED_CONTENT_FACTS)
    : UNRESOLVED_CONTENT_FACTS;

/** Whether a JSON value is an object, as unread content is. */
const isJsonObject = (value: JsonValue): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A Resource with its content as Export writes it, so a file's bytes do not
 * depend on how it was built or which store answered it. A Resource with no
 * plugin has its content's keys sorted at every depth, the one canonical form
 * of a value nothing here reads (`canonicalJsonValue`).
 */
export const canonicalResource = <R extends KindedResource>(resource: R): R => {
  const listed = listedModule(resource.kind);
  if (listed !== undefined)
    return { ...resource, content: listed.canonicalContent(resource.content) };
  return isJsonObject(resource.content)
    ? { ...resource, content: canonicalJsonObject(resource.content) }
    : resource;
};

/** Whether a Resource of this kind may be created empty. */
export const startsEmpty = (kind: string): boolean => listedModule(kind)?.newContent !== undefined;

/**
 * A new Resource of this kind with this Title and the content its plugin
 * starts with, or `undefined` where its plugin declares none.
 */
export const newResourceDocument = (kind: string, title: string): ResourceDocument | undefined => {
  const listed = listedModule(kind);
  return listed?.newContent === undefined
    ? undefined
    : { kind: listed.id, title, content: listed.newContent };
};

/**
 * The first plugin in list order whose Resources start empty: what a Resource
 * is created as where its author chooses no kind, as a new Space's first. No
 * kind is a default; the build's list order decides.
 */
const FIRST_EMPTY = MODULES.flatMap(({ id, newContent }) =>
  newContent === undefined ? [] : [{ id, newContent }],
)[0];

/** A new Resource of the first plugin in list order that starts empty, with this Title. */
export const newEmptyResourceDocument = (title: string): ResourceDocument => {
  if (FIRST_EMPTY === undefined) {
    throw new Error('No plugin in this build starts a Resource empty.');
  }
  return { kind: FIRST_EMPTY.id, title, content: FIRST_EMPTY.newContent };
};

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

/** Whether a value is a well-formed kind id, a plugin's or not. */
export const isKindId = (value: string): boolean => KIND_ID.test(value);

/** Whether a value is a well-formed kind id no plugin in this build draws: a missing plugin's kind. */
export const isMissingKindId = (value: string): boolean => isMissingKind(value) && isKindId(value);
