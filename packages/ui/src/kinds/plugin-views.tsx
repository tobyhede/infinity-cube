import type { ComponentType, ReactElement } from 'react';
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
  KeptMap,
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
  readonly title?: (next: string) => Promise<Answer>;
  readonly content?: (next: JsonValue) => Promise<Answer>;
  readonly map?: (next: JsonValue, options?: { readonly sizeHint?: Size }) => Promise<Answer>;
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
  readonly claim?: () => PluginHostClaim | undefined;
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
interface PluginEntry {
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

function entryOf<C, M>(plugin: ResourcePlugin<C, M>, view: PluginView<C, M>): PluginEntry {
  const asJson =
    <T,>(commit: (next: JsonValue) => Promise<Answer>) =>
    (next: T): Promise<Answer> => {
      const parsed = jsonValueSchema.safeParse(next);
      return parsed.success ? commit(parsed.data) : Promise.resolve(NOT_JSON);
    };
  const exclusiveOf = (own: PluginCommits): Exclusive<C, M> => {
    const exclusive: {
      -readonly [K in keyof Exclusive<C, M>]: Exclusive<C, M>[K];
    } = {};
    if (own.title !== undefined) exclusive.title = own.title;
    const content = own.content;
    if (content !== undefined) exclusive.content = asJson<C>(content);
    const map = own.map;
    if (map !== undefined) exclusive.map = (next, options) => asJson<M>((value) => map(value, options))(next);
    return exclusive;
  };
  const render = (input: PluginSurfaceInput): ReactElement => {
    const content = plugin.content.safeParse(input.content);
    if (!content.success) {
      throw new Error(`Resource ${input.resourceId}'s content is not the ${plugin.kind} plugin's.`);
    }
    const mapContent = plugin.mapContent.schema.safeParse(input.mapContent);
    if (!mapContent.success) {
      throw new Error(`Resource ${input.resourceId}'s Map content is not the ${plugin.kind} plugin's.`);
    }
    const { operations } = input;
    const map: { -readonly [K in keyof KeptMap<M>]: KeptMap<M>[K] } = { value: mapContent.data };
    const commitMap = operations.commitMap;
    if (commitMap !== undefined) {
      map.commit = (next, options) => asJson<M>((value) => commitMap(value, options))(next);
    }
    const kept: { value: C; commit?: (next: C) => Promise<Answer> } = { value: content.data };
    if (operations.commitContent !== undefined) kept.commit = asJson<C>(operations.commitContent);
    const title: { value: string; commit?: (next: string) => Promise<Answer> } = {
      value: input.title,
    };
    if (operations.commitTitle !== undefined) title.commit = operations.commitTitle;
    const surface: {
      -readonly [K in keyof Surface<C, M>]: Surface<C, M>[K];
    } = {
      resource: { id: input.resourceId, title: input.title, kind: plugin.kind, content: content.data },
      title,
      content: kept,
      map,
      size: input.size,
      selected: input.selected,
      assets: input.assets,
      Embed: input.Embed,
    };
    const hostClaim = operations.claim;
    if (hostClaim !== undefined) {
      surface.claim = (): OwnClaim<C, M> | undefined => {
        const held = hostClaim();
        if (held === undefined) return undefined;
        input.onClaim(held);
        return {
          release: () => held.release(),
          exclusively: (work) => held.exclusively((own) => work(exclusiveOf(own))),
        };
      };
    }
    return <view.View surface={surface} />;
  };
  return { Glyph: view.Glyph, render };
}

/** Every plugin's entry, typed so a plugin the list names and this file omits fails to compile. */
const PLUGIN_ENTRIES: { readonly [K in PluginKind]: PluginEntry } = {
  [urKind.id]: entryOf(urPlugin, urPluginView),
};

/** A plugin's view mounted with the host's values. */
export const renderPluginView = (input: PluginSurfaceInput): ReactElement =>
  PLUGIN_ENTRIES[input.kind].render(input);

/** A plugin kind's glyph. */
export const pluginGlyph = (kind: PluginKind): PluginEntry['Glyph'] => PLUGIN_ENTRIES[kind].Glyph;
