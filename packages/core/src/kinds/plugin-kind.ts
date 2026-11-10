import {
  RECTANGLE,
  type MapContentDeclaration,
  type Outline,
  type ResourcePlugin,
} from '@project/resource-api/domain';
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

/** What content a plugin draws in its own rect says about the old frame's content area: nothing. */
const PLUGIN_CONTENT_FACTS: ContentFacts = {
  authored: false,
  embedsMap: false,
  drawsContentArea: false,
};

/** The issues a schema raised, as one sentence. */
const describeIssues = (issues: readonly { readonly message: string }[]): string =>
  issues.map(({ message }) => message).join('; ');

/**
 * A plugin's Map content as JSON values the core can store, compare and carry:
 * its default and its value with no Map, each checked to be JSON once, here,
 * and the plugin's schema and outline behind a JSON value.
 */
function mapContentOf<M>(
  kind: string,
  declaration: MapContentDeclaration<M>,
  outline: ((mapContent: M) => Outline) | undefined,
): KindMapContent {
  const asJson = (value: M, which: string): JsonValue => {
    const parsed = jsonValueSchema.safeParse(value);
    if (!parsed.success) throw new Error(`The "${kind}" plugin's ${which} Map content is not JSON.`);
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
      if (outline === undefined) return RECTANGLE;
      const parsed = declaration.schema.safeParse(value);
      return outline(parsed.success ? parsed.data : declaration.default);
    },
  };
}

/**
 * The ids a plugin declares, as the core's UUIDs. A plugin's own content
 * schema is what holds a reference to a UUID, so an id that is not one names
 * nothing the core can resolve and is not a reference.
 */
const uuids = (ids: readonly string[]): readonly UUID[] =>
  ids.flatMap((id) => {
    const parsed = uuidSchema.safeParse(id);
    return parsed.success ? [parsed.data] : [];
  });

/** What every plugin kind resolves its content to: its kind, which its own view draws. */
export interface PluginContent<K extends string> {
  readonly kind: K;
}

/** A plugin kind's Map content, which every plugin declares. */
export interface PluginMapContent {
  readonly mapContent: KindMapContent;
}

/**
 * A plugin that starts empty, read as a kind module: its content schema, the
 * references it declares, and its Map content. A kind it draws is never Open
 * by the application's rule, because Open is now the plugin's Map content.
 */
export function kindFromPlugin<const K extends string, C, M>(
  plugin: ResourcePlugin<C, M> & { readonly kind: K; readonly newContent: C },
): KindModule<K, C, C, PluginContent<K>> & StartsEmpty<C> & PluginMapContent {
  const kind = plugin.kind;
  const module = defineKind({
    id: kind,
    contentSchema: plugin.content,
    flags: {
      canOpen: false,
      opensToFit: false,
      mayBeTarget: plugin.mayBeTarget === true,
      ownsReferencedSpaces: plugin.ownsReferencedSpaces === true,
    },
    facts: PLUGIN_CONTENT_FACTS,
    resolveContent: (): PluginContent<K> => ({ kind }),
    resourceReferences: (content) => uuids(plugin.resourceReferences?.(content) ?? []),
    contentTarget: (content) => {
      const target = plugin.contentTarget?.(content);
      return target === undefined ? undefined : uuids([target])[0];
    },
    spaceReferences: (content) => uuids(plugin.spaceReferences?.(content) ?? []),
    newContent: plugin.newContent,
  });
  return {
    ...module,
    mapContent: mapContentOf(kind, plugin.mapContent, plugin.outline?.bind(plugin)),
  };
}
