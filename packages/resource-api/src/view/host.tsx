import { createContext, useContext, type ComponentType, type ReactNode } from 'react';
import type {
  OwnProps,
  RailCommand,
  RenderedMarkdownProps,
  SourceEditorProps,
  TitleProps,
} from './index';

/**
 * The host half of the Resource API's view (ADR 0142): what a surface provides
 * the API's components with. A plugin draws through `Title`, `Own` and `Rail`
 * and never reaches this entry, which `eslint.config.js` refuses to a
 * plugin's source, so a plugin cannot put a host of its own around its view.
 */

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
   * The host's source editor. `Escape` and `Mod-Enter` run the plugin's
   * `onCancel` and `onSave`, and go no further.
   */
  readonly SourceEditor: ComponentType<SourceEditorProps>;
  /**
   * The band along the top of the rect the host keeps clear for its rail, in
   * pixels: {@link RAIL_BAND} where it draws a rail over the rect, 0 where it
   * draws none.
   */
  readonly railBand: number;
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

/** The host a plugin's component is drawn inside. */
export const useResourceHost = (component: string): ResourceHost => {
  const host = useContext(ResourceHostContext);
  if (host === null) throw new Error(`<${component}> is drawn only inside a Resource surface.`);
  return host;
};

/**
 * A rail outlet a host reads back: the commands published, its own sources'
 * before its embedded outlet's, each in the order their sources first published.
 */
export interface RailStore extends RailOutlet {
  readonly commands: () => readonly RailCommand[];
  readonly subscribe: (listener: () => void) => () => void;
  /**
   * The outlet for the commands of a Resource drawn inside this one, as an
   * Open Reference draws its Target: drawn after every command published to
   * the store itself, however the two mounted.
   */
  readonly embedded: RailOutlet;
}

/** A rail outlet that keeps what is published, for a host to draw. */
export function createRailStore(): RailStore {
  // A child's layout effect runs before its parent's, so a Resource drawn
  // inside another publishes first when both mount together: the order of the
  // two is the store's, not the mount's.
  const own = new Map<symbol, readonly RailCommand[]>();
  const inner = new Map<symbol, readonly RailCommand[]>();
  const listeners = new Set<() => void>();
  let snapshot: readonly RailCommand[] = [];
  const changed = () => {
    snapshot = [...own.values(), ...inner.values()].flat();
    for (const listener of [...listeners]) listener();
  };
  const outlet = (published: Map<symbol, readonly RailCommand[]>): RailOutlet => ({
    publish: (source, commands) => {
      if (published.get(source) === commands) return;
      published.set(source, commands);
      changed();
    },
    withdraw: (source) => {
      if (!published.delete(source)) return;
      changed();
    },
  });
  return {
    ...outlet(own),
    embedded: outlet(inner),
    commands: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
