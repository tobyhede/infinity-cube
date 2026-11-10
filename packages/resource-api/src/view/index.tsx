import { useLayoutEffect, useState, type ComponentType, type ReactNode } from 'react';
import type { Answer, AssetRef, Kept, Resource, ResourceId, ResourcePlugin, Size } from '../domain';
import { useResourceHost } from './host';

/**
 * The view half of the Resource API (ADR 0142): what a surface gives a
 * plugin's one view, and the components a plugin draws its Title, its own
 * pointer region and its commands with. A host provides those components'
 * behaviour through `ResourceHostProvider`, which the host-only `/view/host`
 * entry exports; a plugin never learns which surface it is on, only which
 * capabilities are present.
 */

/** A Map content commit, which may carry a size hint on an author's gesture. */
export type MapCommit<M> = (next: M, options?: { readonly sizeHint?: Size }) => Promise<Answer>;

/** A Map content value and its commit, when the surface offers one. */
export interface KeptMap<M> {
  readonly value: M;
  readonly commit?: MapCommit<M> | undefined;
}

/** What a surface offers for reaching assets (ADR 0142). */
export interface Assets {
  /** The URL an asset is drawn from. */
  readonly url: (ref: AssetRef) => string;
  /** An asset's bytes, or why they cannot be read. */
  readonly read: (ref: AssetRef) => Promise<Blob | { readonly refused: string }>;
  /** Ask the author for files, called in the press. */
  readonly pick?: ((accept: string) => Promise<File[]>) | undefined;
  /** Store bytes, answering their reference. */
  readonly store?: ((bytes: Blob) => Promise<AssetRef | { readonly refused: string }>) | undefined;
}

/** A Claim: who is interacting (ADR 0142). */
export interface Claim {
  /**
   * Let it go. Never refused, and releasing again changes nothing: while a
   * Claim inside it or its own exclusive work runs, the host keeps it until
   * that ends and then releases it, so a plugin never retries a release.
   */
  release(): void;
}

/**
 * The commits and store the surface offered, live only while exclusive work
 * runs. Each writes only the calling plugin's Resource.
 */
export interface Exclusive<C, M> {
  readonly title?: ((next: string) => Promise<Answer>) | undefined;
  readonly content?: ((next: C) => Promise<Answer>) | undefined;
  readonly map?: MapCommit<M> | undefined;
  readonly store?: ((bytes: Blob) => Promise<AssetRef | { readonly refused: string }>) | undefined;
}

/** A Claim the plugin holds on its own surface, through which exclusivity is reached. */
export interface OwnClaim<C, M> extends Claim {
  /**
   * Run `work` exclusively: every other commit, store and pick on every surface
   * is withdrawn until it settles, and only `own` may commit. `busy` answers
   * before any work starts when other exclusive work runs.
   */
  exclusively<T>(work: (own: Exclusive<C, M>) => Promise<T>): Promise<T | 'busy'>;
}

/** The Map of another Space an embedding draws. */
export interface EmbeddedMap {
  readonly spaceId: string;
  readonly map: string;
  readonly graph: string;
}

/**
 * What the host-owned embedding draws: another Resource, or a Map. The Map
 * embedding draws the selection chooser and writes a choice through `select`,
 * so withdrawal covers it.
 */
export type EmbedProps =
  | { readonly resource: ResourceId; readonly title: Kept<string> }
  | {
      readonly map: EmbeddedMap;
      readonly select?: Kept<EmbeddedMap>;
      readonly claim?: Claim;
    };

/**
 * What a surface hosts a plugin's view with: the Resource, its Title, content
 * and Map content each with the commit the surface offers, the dimensions to
 * draw into, whether it is selected, and the surface's capabilities.
 */
export interface Surface<C, M> {
  readonly resource: Resource<C>;
  readonly title: Kept<string>;
  readonly content: Kept<C>;
  readonly map: KeptMap<M>;
  readonly size: Size;
  readonly selected: boolean;
  readonly claim?: (() => OwnClaim<C, M> | undefined) | undefined;
  readonly assets: Assets;
  /** One component for the surface's lifetime: unmounting releases, so a new type per render would release every Claim inside it. */
  readonly Embed: ComponentType<EmbedProps>;
}

/** What a plugin's view is rendered with. */
export interface PluginViewProps<C, M> {
  readonly surface: Surface<C, M>;
}

/** A plugin's view half. */
export interface PluginView<C, M> {
  readonly kind: string;
  readonly View: ComponentType<PluginViewProps<C, M>>;
  readonly Glyph: ComponentType<{ readonly size?: number | undefined }>;
}

/** Declare a plugin's view half for its domain half. */
export function definePluginView<const K extends string, C, M>(
  plugin: ResourcePlugin<C, M> & { readonly kind: K },
  view: Omit<PluginView<C, M>, 'kind'>,
): PluginView<C, M> & { readonly kind: K } {
  return { kind: plugin.kind, View: view.View, Glyph: view.Glyph };
}

/** One choice in a choice command. */
export interface RailChoice {
  readonly id: string;
  readonly label: string;
  readonly icon?: ReactNode;
}

/**
 * A command a plugin emits for the canvas to draw on its rail. Run in the
 * press, so a picker opened from it keeps the gesture.
 */
export type RailCommand =
  | {
      readonly kind: 'action';
      readonly id: string;
      readonly label: string;
      readonly icon: ReactNode;
      readonly run: () => void;
      readonly disabled?: boolean;
      /**
       * The keys that run it too, as `aria-keyshortcuts` names them. A command
       * that names keys belongs to work running inside the plugin's rect, so
       * pressing it keeps the focus where that work has it.
       */
      readonly keyshortcuts?: string;
    }
  | {
      readonly kind: 'choice';
      readonly id: string;
      /** What the choice is of, which the trigger's name leads with. */
      readonly label: string;
      readonly choices: readonly RailChoice[];
      readonly chosen: string;
      readonly choose: (id: string) => void;
    };

/** What the host draws a plugin's Title with. */
export interface TitleProps {
  readonly className?: string;
}

/** What the host draws a plugin's own region with. */
export interface OwnProps {
  readonly children?: ReactNode;
  readonly className?: string;
}

/** What the host renders Markdown text with. */
export interface RenderedMarkdownProps {
  readonly markdown: string;
  /** A name already drawn above the text: a first heading that only repeats it is left out. */
  readonly drawnName?: string | undefined;
  readonly className?: string;
  /**
   * A press anywhere on the text begins an edit: the host draws the target,
   * named `label` for a screen reader, over the text with nothing visible, so
   * the rail's Edit stays the one keyboard way in.
   */
  readonly edit?: { readonly label: string; readonly begin: () => void } | undefined;
}

/** What the host draws a source editor with. */
export interface SourceEditorProps {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  /** Names the writing surface for a screen reader. */
  readonly ariaLabel: string;
  /** Whether the caret is put in it when it is drawn. */
  readonly autoFocus?: boolean;
  /** What `Mod-Enter` in the editor does: the edit's Save. */
  readonly onSave?: () => void;
  /** What `Escape` in the editor does: the edit's Cancel. */
  readonly onCancel?: () => void;
  readonly className?: string;
}

/** Where a plugin's rail commands go, so the host can draw them wherever its rail is. */
export interface RailOutlet {
  readonly publish: (source: symbol, commands: readonly RailCommand[]) => void;
  readonly withdraw: (source: symbol) => void;
}

/** What a host provides the API's components with. */
export interface ResourceHost {
  readonly Title: ComponentType<TitleProps>;
  readonly Own: ComponentType<OwnProps>;
  readonly rail: RailOutlet;
  /**
   * Markdown rendered as every surface renders it: one parser and sanitiser,
   * so the same text never reads differently on the Map and on the Stage.
   */
  readonly RenderedMarkdown: ComponentType<RenderedMarkdownProps>;
  /**
   * The host's source editor. `Escape` and `Mod-Enter` are left to the plugin:
   * they reach an element wrapped around it.
   */
  readonly SourceEditor: ComponentType<SourceEditorProps>;
}

const ResourceHostContext = createContext<ResourceHost | null>(null);

/** Provide a host for the plugin view rendered inside it. */
export function ResourceHostProvider({
  host,
  children,
}: {
  readonly host: ResourceHost;
  readonly children?: ReactNode;
}) {
  return <ResourceHostContext.Provider value={host}>{children}</ResourceHostContext.Provider>;
}

const useResourceHost = (component: string): ResourceHost => {
  const host = useContext(ResourceHostContext);
  if (host === null) throw new Error(`<${component}> is drawn only inside a Resource surface.`);
  return host;
};

/** The Resource's Title, drawn as the surface draws a Title, with the rename it offers. */
export function Title(props: TitleProps) {
  const { Title: HostTitle } = useResourceHost('Title');
  return <HostTitle {...props} />;
}

/**
 * A region that is the plugin's for the pointer: inside it, pointer and key
 * events are the plugin's rather than the canvas's.
 */
export function Own(props: OwnProps) {
  const { Own: HostOwn } = useResourceHost('Own');
  return <HostOwn {...props} />;
}

/**
 * Markdown text rendered by the host's one parser and sanitiser. Text a plugin
 * reads is untrusted, and is never inserted otherwise.
 */
export function RenderedMarkdown(props: RenderedMarkdownProps) {
  const { RenderedMarkdown: HostRenderedMarkdown } = useResourceHost('RenderedMarkdown');
  return <HostRenderedMarkdown {...props} />;
}

/** The host's source editor, for a plugin whose content is text it edits. */
export function SourceEditor(props: SourceEditorProps) {
  const { SourceEditor: HostSourceEditor } = useResourceHost('SourceEditor');
  return <HostSourceEditor {...props} />;
}

/** A rail outlet a host reads back: the commands published, in the order their sources first published. */
export interface RailStore extends RailOutlet {
  readonly commands: () => readonly RailCommand[];
  readonly subscribe: (listener: () => void) => () => void;
}

/** A rail outlet that keeps what is published, for a host to draw. */
export function createRailStore(): RailStore {
  const published = new Map<symbol, readonly RailCommand[]>();
  const listeners = new Set<() => void>();
  let snapshot: readonly RailCommand[] = [];
  const changed = () => {
    snapshot = [...published.values()].flat();
    for (const listener of [...listeners]) listener();
  };
  return {
    publish: (source, commands) => {
      if (published.get(source) === commands) return;
      published.set(source, commands);
      changed();
    },
    withdraw: (source) => {
      if (!published.delete(source)) return;
      changed();
    },
    commands: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Emit commands for the canvas to draw on this Resource's rail. Draws nothing in place. */
export function Rail({ commands }: { readonly commands: readonly RailCommand[] }) {
  const { rail } = useResourceHost('Rail');
  const [source] = useState(() => Symbol('rail'));
  useLayoutEffect(() => {
    rail.publish(source, commands);
  }, [rail, source, commands]);
  useLayoutEffect(() => () => rail.withdraw(source), [rail, source]);
  return null;
}
