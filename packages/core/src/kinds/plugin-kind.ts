import {
  OUTLINES,
  RECTANGLE,
  type MapContentDeclaration,
  type Outline,
  type ResourcePlugin,
} from '@project/resource-api/domain';
import { z } from 'zod';
import { jsonValueSchema, type JsonValue } from '../json-value';
import type { ContentFacts } from '../resource-content';
import type { UUID } from '../types';
import { uuidSchema } from '../uuid';
import { defineKind, type KindModule, type KindMapContent, type StartsEmpty } from './kind-module';

/**
 * A Resource plugin's domain half read as the core reads every kind (ADR
 * 0142): its content schema, its references, and its Map content, held by the
 * core as JSON and handed to the plugin's own schema to answer for. Nothing a
 * plugin declares says Open or Shape: whether a value is accepted is that
 * plugin's schema's answer.
 */

/** What content a plugin draws in its own rect says about a host-drawn content area: nothing. */
const PLUGIN_CONTENT_FACTS: ContentFacts = {
  authored: false,
  embedsMap: false,
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
  const declaresOnlyUuids = z.custom<C>(() => true).superRefine((content, context) => {
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

/**
 * What every plugin kind resolves its content to: its kind, which its own view
 * draws, and its content as its plugin's schema parsed it, which a surface
 * embedding it hands that view.
 */
export interface PluginContent<K extends string, C = unknown> {
  readonly kind: K;
  readonly content: C;
}

/** A plugin kind's Map content, which every plugin declares. */
export interface PluginMapContent {
  readonly mapContent: KindMapContent;
}

/**
 * A plugin read as a kind module: its content schema, the references it
 * declares, and its Map content. A kind it draws is never Open by the
 * application's rule, because Open is the plugin's Map content. A plugin
 * that declares new content starts empty; one that does not is created only
 * from what an author brings.
 */
export function kindFromPlugin<const K extends string, C, M>(
  plugin: ResourcePlugin<C, M> & { readonly kind: K; readonly newContent: C },
): KindModule<K, C, PluginContent<K, C>> & StartsEmpty<C> & PluginMapContent;
export function kindFromPlugin<const K extends string, C, M>(
  plugin: ResourcePlugin<C, M> & { readonly kind: K },
): KindModule<K, C, PluginContent<K, C>> & PluginMapContent;
export function kindFromPlugin<const K extends string, C, M>(
  plugin: ResourcePlugin<C, M> & { readonly kind: K },
): KindModule<K, C, PluginContent<K, C>> & PluginMapContent {
  const kind = plugin.kind;
  const module = defineKind({
    id: kind,
    contentSchema: contentSchemaOf(plugin),
    flags: {
      canOpen: false,
      mayBeTarget: plugin.mayBeTarget === true,
      ownsReferencedSpaces: plugin.ownsReferencedSpaces === true,
    },
    facts: PLUGIN_CONTENT_FACTS,
    resolveContent: (content): PluginContent<K, C> => ({ kind, content }),
    resourceReferences: (content) => uuids(plugin.resourceReferences?.(content) ?? []),
    contentTarget: (content) => {
      const target = plugin.contentTarget?.(content);
      return target === undefined ? undefined : uuids([target])[0];
    },
    spaceReferences: (content) => uuids(plugin.spaceReferences?.(content) ?? []),
  });
  const mapContent = mapContentOf(plugin, plugin.mapContent);
  return plugin.newContent === undefined
    ? { ...module, mapContent }
    : { ...module, newContent: plugin.newContent, mapContent };
}
