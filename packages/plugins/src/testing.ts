/**
 * For tests only: reading a Resource of a kind the test built, which the host
 * itself never does (ADR 0142). A lint zone keeps every package's `src/` from
 * importing this entry.
 */
import { PLUGINS, pluginOf, type PluginKind } from './domain';

export type { PluginKind };

/** Each listed kind's content schema, by kind. */
const SCHEMAS = {
  markdown: pluginOf('markdown').content,
  space: pluginOf('space').content,
  image: pluginOf('image').content,
  ur: pluginOf('ur').content,
  reference: pluginOf('reference').content,
} satisfies { readonly [K in PluginKind]: ReturnType<typeof pluginOf<K>>['content'] };

/** Each listed kind's content, as its plugin's schema parses it. */
type ContentByKind = { [K in PluginKind]: ReturnType<(typeof SCHEMAS)[K]['parse']> };

/** A Resource, stored or not, as a test reads it. */
interface Kinded {
  readonly kind: string;
  readonly content: unknown;
}

/**
 * Whether a Resource is of this kind with content its plugin's schema admits,
 * narrowing its content to that kind's: for a test that knows the kind it built.
 */
export function isOfKind<R extends Kinded, K extends PluginKind>(
  resource: R,
  kind: K,
): resource is R & { readonly kind: K; readonly content: ContentByKind[K] } {
  return resource.kind === kind && SCHEMAS[kind].safeParse(resource.content).success;
}

/**
 * A Resource's content as its plugin parses it, where the Resource is of this
 * kind, or `undefined` where it is not. Unlike `isOfKind`, it answers the
 * content alone, typed as that kind's whatever the Resource's own type.
 */
export const contentOf = <K extends PluginKind>(
  resource: Kinded,
  kind: K,
): ContentByKind[K] | undefined => (isOfKind(resource, kind) ? resource.content : undefined);

/** The kinds a plugin in this build's list draws, in list order. */
export const LISTED_KINDS: readonly PluginKind[] = PLUGINS.map(({ kind }) => kind);

/** The Space a Space Resource shows, and the Map and Graph it opens on. */
interface Shown {
  readonly spaceId: string;
  readonly map: string;
  readonly graph: string;
}

/**
 * A Space Resource titled `title` showing the Space it is made for, unframed:
 * the document a test passes the Space Resource lifecycle, as the Space
 * plugin's creation passes one. The lifecycle names no kind.
 */
export const spaceResourceMaker = (title: string) => (shown: Shown) => ({
  title,
  kind: 'space',
  content: { spaceId: shown.spaceId, map: shown.map, graph: shown.graph },
});
