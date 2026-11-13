import {
  createContext,
  useContext,
  useMemo,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from 'react';
import { declaredOutline, jsonValueSchema, type JsonValue, type ResourceKind } from '@project/core';
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
import { DEFAULT_PLUGIN_VIEW, PLUGIN_VIEWS, type PluginHalves } from '@project/plugins/view';
import { ResourceFailureBoundary } from './ResourceFailureBoundary';

/**
 * The plugin catalogue (ADR 0142): each plugin's two halves, from the build's
 * list (`@project/plugins/view`), behind one door that takes the host's
 * values, and the one lookup every surface draws through, falling back to the
 * default plugin. No plugin is named here. The host holds Resource content and
 * Map content as it stores them; an entry parses each through its own
 * plugin's schemas before the plugin sees it, and checks what a plugin
 * commits is JSON before the host takes it, so a plugin's types are its own
 * end to end.
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
  readonly kind: string;
  readonly name: string;
  readonly creation: HostCreation;
}

/** One plugin, both halves, behind a door that takes the host's values. */
export interface PluginEntry {
  /** The kind it draws. */
  readonly kind: string;
  /** What one Resource of it is called. */
  readonly name: string;
  /** What the Resources list calls its Resources. */
  readonly listName: string;
  /** What a Reference Resource to one of it is called, or `null` when one may not be a Target. */
  readonly referenceName: string | null;
  /**
   * Whether its Resources show another's content, as a Reference Resource
   * does (ADR 0070): the host draws such a Resource's glyph as its Target's
   * with a badge on it, and its border dotted at rest, keyed on this
   * declaration and never on a kind.
   */
  readonly showsTarget: boolean;
  /** How its Resources are created, in the order it declares them. */
  readonly creations: readonly HostCreation[];
  readonly Glyph: ComponentType<{ readonly size?: number | undefined }>;
  /** Whether the canvas strokes no border while the Resource is in no Graph and not selected. */
  readonly bareAtRest: boolean;
  /** Whether the plugin draws its Title; the host draws the Title editor over one that does not. */
  readonly drawsTitle: boolean;
  readonly render: (input: PluginSurfaceInput) => ReactElement;
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
    kind: plugin.kind,
    name: plugin.name,
    listName: plugin.listName,
    referenceName: plugin.referenceName,
    showsTarget: plugin.contentTarget !== undefined,
    creations: (view.creates ?? []).map((creation) => hostCreation(plugin, creation)),
    Glyph,
    bareAtRest: plugin.bareAtRest === true,
    drawsTitle: plugin.drawsTitle !== false,
    render,
  };
}

/** A plugin's two halves as an entry the host draws through. */
const entryOf = (halves: PluginHalves): PluginEntry => halves.use(pluginEntry);

/**
 * The plugins a surface draws with: each listed plugin's entry, in list order,
 * and the default plugin's, which draws a Resource whose kind names none of
 * them. A test hands a surface a catalogue with a probe plugin in it.
 */
export interface PluginCatalog {
  /** The listed plugins' entries, in list order. */
  readonly entries: readonly PluginEntry[];
  /** What draws a Resource whose kind names no listed plugin (ADR 0142). */
  readonly fallback: PluginEntry;
}

/** A catalogue of these plugins' halves, with this default. */
export const pluginCatalog = (
  listed: readonly PluginHalves[],
  fallback: PluginHalves = DEFAULT_PLUGIN_VIEW,
): PluginCatalog => ({ entries: listed.map(entryOf), fallback: entryOf(fallback) });

/** The build's catalogue: every plugin in the build's list, and the default plugin. */
export const BUILD_CATALOG: PluginCatalog = pluginCatalog(PLUGIN_VIEWS);

/** The entry of the plugin in this catalogue that draws this kind: its own, or the default plugin's. */
export const catalogEntry = (catalog: PluginCatalog, kind: ResourceKind): PluginEntry =>
  catalog.entries.find((entry) => entry.kind === kind) ?? catalog.fallback;

/** The entry of the plugin that draws this kind in this build. */
export const pluginEntryFor = (kind: ResourceKind): PluginEntry =>
  catalogEntry(BUILD_CATALOG, kind);

/** The glyph of the plugin that draws this kind. */
export const pluginGlyph = (kind: ResourceKind): PluginEntry['Glyph'] => pluginEntryFor(kind).Glyph;

/**
 * Every plugin's creations, in list order, each with the kind it creates:
 * where the host finds what a gesture may create.
 */
export const catalogCreations = (catalog: PluginCatalog): readonly PluginCreationEntry[] =>
  catalog.entries.flatMap((entry) =>
    entry.creations.map((creation) => ({ kind: entry.kind, name: entry.name, creation })),
  );

/** Every plugin's creations in this build, in list order. */
export const pluginCreations = (): readonly PluginCreationEntry[] =>
  catalogCreations(BUILD_CATALOG);

const PluginCatalogContext = createContext<PluginCatalog>(BUILD_CATALOG);

/**
 * Hand the surfaces inside the plugins they draw with (ADR 0142). Without one,
 * a surface draws with the build's catalogue.
 */
export function PluginCatalogProvider({
  catalog,
  children,
}: {
  readonly catalog: PluginCatalog;
  readonly children?: ReactNode;
}) {
  return <PluginCatalogContext.Provider value={catalog}>{children}</PluginCatalogContext.Provider>;
}

/** The catalogue the surface being drawn draws with. */
export const usePluginCatalog = (): PluginCatalog => useContext(PluginCatalogContext);

/** The entry of the plugin that draws this kind, on the surface being drawn. */
export const usePluginEntry = (kind: ResourceKind): PluginEntry =>
  catalogEntry(usePluginCatalog(), kind);
