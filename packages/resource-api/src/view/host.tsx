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
