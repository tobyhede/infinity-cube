import { useMemo, type ComponentType, type ReactElement, type ReactNode } from 'react';
import {
  declaredOutline,
  imageKind,
  isPluginKind,
  PLUGIN_KINDS,
  jsonValueSchema,
  markdownKind,
  referenceKind,
  spaceKind,
  urKind,
  type JsonValue,
  type PluginKind,
  type ResourceKind,
} from '@project/core';
import type {
  Answer,
  AssetRef,
  Resource as ApiResource,
  ResourcePlugin,
  Size,
} from '@project/resource-api/domain';
import type {
  Assets,
  Creation,
  CreationData,
  CreationHost,
  EmbedProps,
  Exclusive,
  New,
  NewSpace,
  NotCreated,
  OfferedSpace,
  OwnClaim,
  PluginView,
  Surface,
} from '@project/resource-api/view';
import { defaultPlugin } from '@project/plugin-default/domain';
import { defaultPluginView } from '@project/plugin-default/view';
import { imagePlugin } from '@project/plugin-image/domain';
import { imagePluginView } from '@project/plugin-image/view';
import { markdownPlugin } from '@project/plugin-markdown/domain';
import { markdownPluginView } from '@project/plugin-markdown/view';
import { referencePlugin } from '@project/plugin-reference/domain';
import { referencePluginView } from '@project/plugin-reference/view';
import { spacePlugin } from '@project/plugin-space/domain';
import { spacePluginView } from '@project/plugin-space/view';
import { urPlugin } from '@project/plugin-ur/domain';
import { urPluginView } from '@project/plugin-ur/view';
import { ResourceFailureBoundary } from '../ResourceFailureBoundary';

/**
 * Each plugin's view half, keyed to the build-time plugin list
 * (`packages/core/src/kinds/plugins.ts`) by its kind, and the one place in this
 * package a plugin is named (ADR 0142). The host holds Resource content and Map
 * content as it stores them; an entry parses each through its own plugin's
 * schemas before the plugin sees it, and checks what a plugin commits is JSON
 * before the host takes it, so a plugin's types are its own end to end.
 */

/** Store bytes as an asset, answering their reference or why not. */
export type PluginStore = (bytes: Blob) => Promise<AssetRef | { readonly refused: string }>;

/** A commit as the host takes it: JSON in, an answer out; and the asset store, withdrawn as they are. */
export interface PluginCommits {
  readonly title?: ((next: string) => Promise<Answer>) | undefined;
  readonly content?: ((next: JsonValue) => Promise<Answer>) | undefined;
  readonly map?:
    ((next: JsonValue, options?: { readonly sizeHint?: Size }) => Promise<Answer>) | undefined;
  readonly store?: PluginStore | undefined;
}

/** A Claim as the host hands it out, before the plugin's types are put on it. */
export interface PluginHostClaim {
  /** Let the Claim go: at once, or as soon as nothing runs inside it. */
  release(): void;
  exclusively<T>(work: (own: PluginCommits) => Promise<T>): Promise<T | 'busy'>;
  /** The surface that took it is gone: it and every Claim inside it are released. */
  unmount(): void;
}

/**
 * Who holds a Claim on a Resource, as one drawing of it reads it: that drawing,
 * another drawing of the same Resource, or none.
 */
export type ClaimHolder = 'this-drawing' | 'another-drawing' | 'none';

/**
 * What a plugin kind offers beyond its Title on a surface: the commits the
 * surface offers, each present or absent, and a Claim where one may be taken.
 * Flat, so a kind offering nothing carries its kind alone.
 */
export interface PluginOperations {
  /** The Resource's kind: a plugin's, or one no plugin in this build draws, which the default plugin does. */
  readonly kind: ResourceKind;
  readonly commitTitle?: PluginCommits['title'];
  readonly commitContent?: PluginCommits['content'];
  readonly commitMap?: PluginCommits['map'];
  /**
   * The asset store and the author's file picker, offered where commits are
   * and withdrawn as they are: a kept store answers refused, and a kept pick
   * answers no files, while exclusive work runs (ADR 0142).
   */
  readonly commitStore?: PluginStore | undefined;
  readonly pick?: ((accept: string) => Promise<File[]>) | undefined;
  /**
   * A Claim for the drawing keyed `drawing`: a key the surface mints for its
   * own lifetime, so two drawings of one Resource never share a Claim.
   */
  readonly claim?: ((drawing: symbol) => PluginHostClaim | undefined) | undefined;
  /**
   * Who holds a Claim on this Resource, as the drawing keyed `drawing` reads it
   * when asked. A drawing whose Resource another drawing holds is offered no
   * commit, and a commit it kept answers refused.
   */
  readonly claimHolder?: ((drawing: symbol) => ClaimHolder) | undefined;
  /**
   * Exclusive work runs elsewhere: the surface offers no authoring, its
   * host-drawn Title and Actions included, until it ends (ADR 0142).
   */
  readonly withdrawn?: boolean | undefined;
  /** The Replacement epoch the surface was offered in, which its failure boundary is keyed on. */
  readonly epoch?: number | undefined;
  /** Told what the plugin threw while drawing. */
  readonly onFailure?: ((error: Error) => void) | undefined;
  /**
   * The Map embedding's own commands, which the host draws on this Resource's
   * rail while the plugin embeds a Map it may choose for (ADR 0142): the Map
   * and Graph chooser, the shown Space's Map and Graph authoring and its links.
   * Never the plugin's: it is the host's, and the plugin is not told of it.
   */
  readonly mapRail?: ReactNode;
  /** What the Map embedding says in place of the Map, as while the Space it shows is read. */
  readonly mapNote?: string | undefined;
}

/** What a host mounts a plugin's view with. */
export interface PluginSurfaceInput {
  readonly resourceId: string;
  /** The Resource's stored kind, which its plugin is given as it is stored. */
  readonly kind: ResourceKind;
  readonly title: string;
  /** The Resource's content as it is stored, which the plugin's schema parses here. */
  readonly content: unknown;
  /** The Map content the plugin is given, or its own value on a surface with no Map. */
  readonly mapContent: JsonValue;
  readonly size: Size;
  readonly selected: boolean;
  readonly operations: PluginOperations;
  /** The key the surface minted for its lifetime, which a Claim taken through it is granted to. */
  readonly drawing: symbol;
  readonly assets: Assets;
  readonly Embed: ComponentType<EmbedProps>;
  /** Told of each Claim handed out through this surface, so unmounting releases it. */
  readonly onClaim: (claim: PluginHostClaim) => void;
}

/**
 * A Resource a creation asks the host for, as the host takes it: its content
 * JSON its plugin's schema accepted; a function of the Space it names that
 * answers such JSON and throws {@link NotCreatableContent} on anything else; or
 * an item whose content its schema refused, which the host refuses once its
 * own checks have passed.
 */
export type HostNew =
  | { readonly title?: string | undefined; readonly content: JsonValue }
  | {
      readonly title?: string | undefined;
      readonly contentFor: (space: NewSpace) => JsonValue;
      readonly newSpace?: true | undefined;
    }
  | { readonly notCreatable: true };

/** Thrown by a content function whose answer its plugin's schema refuses. */
export class NotCreatableContent extends Error {
  constructor(kind: string) {
    super(`The ${kind} plugin created content its schema refuses.`);
    this.name = 'NotCreatableContent';
  }
}

/** What the host gives a creation's `run`, before the plugin's types are put on it. */
export interface HostCreationHost {
  create(items: readonly HostNew[]): Promise<Answer>;
  readonly assets: Assets;
  report(words: string): void;
}

/** A plugin's creation as the host runs it (ADR 0142), each `from` with the input it is given. */
export type HostCreation =
  | ({
      readonly from: 'dock';
      readonly run: (host: HostCreationHost) => void | Promise<void>;
    } & NotCreated)
  | ({
      readonly from: 'data';
      readonly types: readonly string[];
      readonly accepts?: ((data: CreationData) => boolean) | undefined;
      readonly run: (host: HostCreationHost, data: CreationData) => void | Promise<void>;
    } & NotCreated)
  | ({
      readonly from: 'resource';
      readonly label: string;
      readonly accepts?: ((resource: ApiResource) => boolean) | undefined;
      readonly run: (host: HostCreationHost, resource: ApiResource) => void | Promise<void>;
    } & NotCreated)
  | {
      readonly from: 'spaces';
      readonly run: (host: HostCreationHost, space: OfferedSpace) => void | Promise<void>;
    };

/** One plugin's creation, with the kind it creates and what one of its Resources is called. */
export interface PluginCreationEntry {
  readonly kind: PluginKind;
  readonly name: string;
  readonly creation: HostCreation;
}

/** One plugin, both halves, behind a door that takes the host's values. */
export interface PluginEntry {
  /** What one of its Resources is called. */
  readonly name: string;
  /** How its Resources are created, in the order it declares them. */
  readonly creations: readonly HostCreation[];
  readonly Glyph: ComponentType<{ readonly size?: number | undefined }>;
  /** Whether the canvas strokes no border while the Resource is in no Graph and not selected. */
  readonly bareAtRest: boolean;
  /** Whether the plugin draws its Title; the host draws the Title editor over one that does not. */
  readonly drawsTitle: boolean;
  readonly render: (input: PluginSurfaceInput) => ReactElement;
}

/** The plugin entries a host draws through: its own Resource's, and an embedded one's by kind. */
export interface PluginSurfaceEntries {
  readonly entry: PluginEntry;
  /** The entry an embedded Resource of this kind is drawn through; absent, the build's. */
  readonly entryFor?: ((kind: ResourceKind) => PluginEntry) | undefined;
}

/** Why a commit was refused before it reached the host: the value was not JSON. */
const NOT_JSON: Answer = { refused: 'This change cannot be kept.' };

/** Content a plugin created, as the host takes it: its schema's, and JSON; or `undefined`. */
const creatableJson = <C,>(plugin: ResourcePlugin<C, unknown>, value: C): JsonValue | undefined => {
  const parsed = plugin.content.safeParse(value);
  if (!parsed.success) return undefined;
  const json = jsonValueSchema.safeParse(parsed.data);
  return json.success ? json.data : undefined;
};

/**
 * A plugin's creation with its types erased: each item's content is parsed by
 * the plugin's own schema and checked to be JSON before the host takes it. An
 * item the plugin got wrong reaches the host as not creatable, so the host
 * refuses the whole create after its own checks, and reports it as it reports
 * any refused create; a content function answering such a value throws
 * {@link NotCreatableContent} inside the host, which refuses it the same way.
 */
export function hostCreation<C>(
  plugin: ResourcePlugin<C, unknown>,
  creation: Creation<C>,
): HostCreation {
  const typed = (host: HostCreationHost): CreationHost<C> => ({
    assets: host.assets,
    report: (words) => host.report(words),
    create: (items: readonly New<C>[]) => {
      const erased: HostNew[] = [];
      for (const item of items) {
        if ('contentFor' in item) {
          const { contentFor } = item;
          erased.push({
            title: item.title,
            newSpace: item.newSpace,
            contentFor: (space) => {
              const json = creatableJson(plugin, contentFor(space));
              if (json === undefined) throw new NotCreatableContent(plugin.kind);
              return json;
            },
          });
        } else {
          const json = creatableJson(plugin, item.content);
          erased.push(
            json === undefined ? { notCreatable: true } : { title: item.title, content: json },
          );
        }
      }
      return host.create(erased);
    },
  });
  switch (creation.from) {
    case 'dock':
      return {
        from: 'dock',
        notCreated: creation.notCreated,
        run: (host) => creation.run(typed(host)),
      };
    case 'data':
      return {
        from: 'data',
        notCreated: creation.notCreated,
        types: creation.types,
        accepts: creation.accepts,
        run: (host, data) => creation.run(typed(host), data),
      };
    case 'resource':
      return {
        from: 'resource',
        label: creation.label,
        notCreated: creation.notCreated,
        accepts: creation.accepts,
        run: (host, resource) => creation.run(typed(host), resource),
      };
    case 'spaces':
      return { from: 'spaces', run: (host, space) => creation.run(typed(host), space) };
  }
}

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
    const { title, content, map: ownMap, store } = own;
    return {
      title,
      store,
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
    const { operations, onClaim, drawing } = input;
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
              const held = hostClaim(drawing);
              if (held === undefined) return undefined;
              onClaim(held);
              return {
                release: () => held.release(),
                exclusively: (work) => held.exclusively((own) => work(exclusiveOf(own))),
              };
            },
      [hostClaim, onClaim, drawing],
    );
    const content = plugin.content.safeParse(input.content);
    if (!content.success) {
      throw new Error(`Resource ${input.resourceId}'s content is not the ${input.kind} plugin's.`);
    }
    const mapContent = plugin.mapContent.schema.safeParse(input.mapContent);
    if (!mapContent.success) {
      throw new Error(
        `Resource ${input.resourceId}'s Map content is not the ${input.kind} plugin's.`,
      );
    }
    // The outline the canvas strokes was asked for outside any boundary, where
    // a throw or a value outside the vocabulary is drawn as a rectangle; asked
    // again here, either fails this Resource's drawing and is reported.
    declaredOutline(plugin, mapContent.data);
    const surface: Surface<C, M> = {
      resource: {
        id: input.resourceId,
        title: input.title,
        kind: input.kind,
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
  const PluginGlyph = view.Glyph;
  /** The plugin's glyph, drawn as nothing where it throws, so the rail or Dock it is in survives. */
  function Glyph({ size }: { readonly size?: number | undefined }) {
    return (
      <ResourceFailureBoundary fallback={null}>
        <PluginGlyph size={size} />
      </ResourceFailureBoundary>
    );
  }
  return {
    name: plugin.name,
    creations: (view.creates ?? []).map((creation) => hostCreation(plugin, creation)),
    Glyph,
    bareAtRest: plugin.bareAtRest === true,
    drawsTitle: plugin.drawsTitle !== false,
    render,
  };
}

/** Every plugin's entry, typed so a plugin the list names and this file omits fails to compile. */
const PLUGIN_ENTRIES = {
  [imageKind.id]: pluginEntry(imagePlugin, imagePluginView),
  [markdownKind.id]: pluginEntry(markdownPlugin, markdownPluginView),
  [referenceKind.id]: pluginEntry(referencePlugin, referencePluginView),
  [spaceKind.id]: pluginEntry(spacePlugin, spacePluginView),
  [urKind.id]: pluginEntry(urPlugin, urPluginView),
} satisfies Record<PluginKind, PluginEntry>;

/**
 * The default plugin's entry (ADR 0142): what draws a Resource whose kind
 * names no plugin in this build. It is in no list, so no kind selects it; the
 * host takes it when nothing else matches.
 */
const DEFAULT_ENTRY = pluginEntry(defaultPlugin, defaultPluginView);

/** The entry of the plugin that draws this kind: its own, or the default plugin where it has none. */
export const pluginEntryFor = (kind: ResourceKind): PluginEntry =>
  isPluginKind(kind) ? PLUGIN_ENTRIES[kind] : DEFAULT_ENTRY;

/** The glyph of the plugin that draws this kind. */
export const pluginGlyph = (kind: ResourceKind): PluginEntry['Glyph'] => pluginEntryFor(kind).Glyph;

/**
 * Every plugin's creations, in build order (the plugin list's), each with the
 * kind it creates: where the host finds what a gesture may create.
 */
export const pluginCreations = (): readonly PluginCreationEntry[] =>
  PLUGIN_KINDS.flatMap((kind) =>
    PLUGIN_ENTRIES[kind].creations.map((creation) => ({
      kind,
      name: PLUGIN_ENTRIES[kind].name,
      creation,
    })),
  );
