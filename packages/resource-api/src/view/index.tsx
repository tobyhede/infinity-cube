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
  url(ref: AssetRef): string;
  /** An asset's bytes, or why they cannot be read. */
  read(ref: AssetRef): Promise<Blob | { readonly refused: string }>;
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
