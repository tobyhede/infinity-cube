import { useMemo, type ComponentType, type ReactElement } from 'react';
import {
  isPluginKind,
  jsonValueSchema,
  urKind,
  type JsonValue,
  type PluginKind,
} from '@project/core';
import type { Answer, ResourcePlugin, Size } from '@project/resource-api/domain';
import type {
  Assets,
  EmbedProps,
  Exclusive,
  OwnClaim,
  PluginView,
  Surface,
} from '@project/resource-api/view';
import { urPlugin } from '@project/plugin-ur/domain';
import { urPluginView } from '@project/plugin-ur/view';

/**
 * Each plugin's view half, keyed to the build-time plugin list
 * (`packages/core/src/kinds/plugins.ts`) by its kind, and the one place in this
 * package a plugin is named (ADR 0142). The host holds Resource content and Map
 * content as it stores them; an entry parses each through its own plugin's
 * schemas before the plugin sees it, and checks what a plugin commits is JSON
 * before the host takes it, so a plugin's types are its own end to end.
 */

/** A commit as the host takes it: JSON in, an answer out. */
export interface PluginCommits {
  readonly title?: ((next: string) => Promise<Answer>) | undefined;
  readonly content?: ((next: JsonValue) => Promise<Answer>) | undefined;
  readonly map?:
    ((next: JsonValue, options?: { readonly sizeHint?: Size }) => Promise<Answer>) | undefined;
}

/** A Claim as the host hands it out, before the plugin's types are put on it. */
export interface PluginHostClaim {
  release(): boolean;
  exclusively<T>(work: (own: PluginCommits) => Promise<T>): Promise<T | 'busy'>;
  /** The surface that took it is gone: it and every Claim inside it are released. */
  unmount(): void;
}

/**
 * What a plugin kind offers beyond its Title on a surface: the commits the
 * surface offers, each present or absent, and a Claim where one may be taken.
 * Flat, so a kind offering nothing carries its kind alone.
 */
export interface PluginOperations {
  readonly kind: PluginKind;
  readonly commitTitle?: PluginCommits['title'];
  readonly commitContent?: PluginCommits['content'];
  readonly commitMap?: PluginCommits['map'];
  readonly claim?: (() => PluginHostClaim | undefined) | undefined;
  /**
   * Exclusive work runs elsewhere: the surface offers no authoring, its
   * host-drawn Title and Actions included, until it ends (ADR 0142).
   */
  readonly withdrawn?: boolean | undefined;
  /** The surface holds a Claim, which gives the plugin the whole rect. */
  readonly claimed?: boolean | undefined;
  /** The Replacement epoch the surface was offered in, which its failure boundary is keyed on. */
  readonly epoch?: number | undefined;
  /** Told what the plugin threw while drawing. */
  readonly onFailure?: ((error: Error) => void) | undefined;
}

/** Whether a kind's operations are a plugin kind's, which `PluginResource` draws. */
export const isPluginOperations = (operations: {
  readonly kind: string;
}): operations is PluginOperations => isPluginKind(operations.kind);

/** What a host mounts a plugin's view with. */
export interface PluginSurfaceInput {
  readonly resourceId: string;
  readonly kind: PluginKind;
  readonly title: string;
  /** The Resource's content as it is stored, which the plugin's schema parses here. */
  readonly content: unknown;
  /** The Map content the plugin is given, or its own value on a surface with no Map. */
  readonly mapContent: JsonValue;
  readonly size: Size;
  readonly selected: boolean;
  readonly operations: PluginOperations;
  readonly assets: Assets;
  readonly Embed: ComponentType<EmbedProps>;
  /** Told of each Claim handed out through this surface, so unmounting releases it. */
  readonly onClaim: (claim: PluginHostClaim) => void;
}

/** One plugin, both halves, behind a door that takes the host's values. */
export interface PluginEntry {
  readonly Glyph: ComponentType<{ readonly size?: number | undefined }>;
  readonly render: (input: PluginSurfaceInput) => ReactElement;
}

/** No asset store yet: issue 03 fills this. A reference is drawn from its own URL. */
export const NO_ASSETS: Assets = {
  url: (ref) => ref,
  read: () => Promise.resolve({ refused: 'Assets are not available here yet.' }),
};

/** The embedding, before any plugin embeds: one component for every surface's lifetime. */
export function NoEmbed(_props: EmbedProps) {
  return null;
}

/** Why a commit was refused before it reached the host: the value was not JSON. */
const NOT_JSON: Answer = { refused: 'This change cannot be kept.' };

/** A plugin's entry: what a host draws it through, whichever plugin it is. */
export function pluginEntry<C, M>(
  plugin: ResourcePlugin<C, M>,
  view: PluginView<C, M>,
): PluginEntry {
  const asJson =
    (commit: (next: JsonValue) => Promise<Answer>) =>
    (next: C | M): Promise<Answer> => {
      const parsed = jsonValueSchema.safeParse(next);
      return parsed.success ? commit(parsed.data) : Promise.resolve(NOT_JSON);
    };
  const exclusiveOf = (own: PluginCommits): Exclusive<C, M> => {
    const { title, content, map: ownMap } = own;
    return {
      title,
      content: content === undefined ? undefined : asJson(content),
      map:
        ownMap === undefined
          ? undefined
          : (next, options) => asJson((value) => ownMap(value, options))(next),
    };
  };
  /**
   * The plugin mounted with the host's values. A component rather than a
   * call, so a value its schemas refuse throws inside the failure boundary the
   * host draws it in; and each commit keeps its identity while the host's
   * does, so a plugin that keys work on one does not run it again on every
   * render of the host.
   */
  function Mounted({ input }: { readonly input: PluginSurfaceInput }) {
    const { operations, onClaim } = input;
    const { commitTitle, commitContent, commitMap, claim: hostClaim } = operations;
    const mapCommit = useMemo(
      () =>
        commitMap === undefined
          ? undefined
          : (next: M, options?: { readonly sizeHint?: Size }) =>
              asJson((value) => commitMap(value, options))(next),
      [commitMap],
    );
    const contentCommit = useMemo(
      () => (commitContent === undefined ? undefined : asJson(commitContent)),
      [commitContent],
    );
    const claim = useMemo(
      () =>
        hostClaim === undefined
          ? undefined
          : (): OwnClaim<C, M> | undefined => {
              const held = hostClaim();
              if (held === undefined) return undefined;
              onClaim(held);
              return {
                release: () => held.release(),
                exclusively: (work) => held.exclusively((own) => work(exclusiveOf(own))),
              };
            },
      [hostClaim, onClaim],
    );
    const content = plugin.content.safeParse(input.content);
    if (!content.success) {
      throw new Error(`Resource ${input.resourceId}'s content is not the ${plugin.kind} plugin's.`);
    }
    const mapContent = plugin.mapContent.schema.safeParse(input.mapContent);
    if (!mapContent.success) {
      throw new Error(
        `Resource ${input.resourceId}'s Map content is not the ${plugin.kind} plugin's.`,
      );
    }
    const surface: Surface<C, M> = {
      resource: {
        id: input.resourceId,
        title: input.title,
        kind: plugin.kind,
        content: content.data,
      },
      title: { value: input.title, commit: commitTitle },
      content: { value: content.data, commit: contentCommit },
      map: { value: mapContent.data, commit: mapCommit },
      size: input.size,
      selected: input.selected,
      claim,
      assets: input.assets,
      Embed: input.Embed,
    };
    return <view.View surface={surface} />;
  }
  const render = (input: PluginSurfaceInput): ReactElement => <Mounted input={input} />;
  return { Glyph: view.Glyph, render };
}

/** Every plugin's entry, typed so a plugin the list names and this file omits fails to compile. */
const PLUGIN_ENTRIES = {
  [urKind.id]: pluginEntry(urPlugin, urPluginView),
} satisfies Record<PluginKind, PluginEntry>;

/** The entry of the plugin that draws this kind. */
export const pluginEntryFor = (kind: PluginKind): PluginEntry => PLUGIN_ENTRIES[kind];

/** A plugin kind's glyph. */
export const pluginGlyph = (kind: PluginKind): PluginEntry['Glyph'] => PLUGIN_ENTRIES[kind].Glyph;
