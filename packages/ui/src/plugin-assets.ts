import { createContext, useContext } from 'react';
import type { Assets } from '@project/resource-api/view';

/**
 * No asset store: a reference is drawn from its own URL and its bytes cannot
 * be read. What a plugin is handed outside an application that supplies one.
 */
export const NO_ASSETS: Assets = {
  url: (ref) => ref,
  read: () => Promise.resolve({ refused: 'Assets are not available here.' }),
};

/**
 * The application's asset store as a plugin's surface reaches it (ADR 0142),
 * supplied once at composition, as the picture resolver is. A host hands it on
 * whole where its Resource is authored, and only `url` and `read` elsewhere.
 */
const PluginAssetsContext = createContext<Assets>(NO_ASSETS);

export const PluginAssetsProvider = PluginAssetsContext.Provider;

/** The asset store the application supplied, or {@link NO_ASSETS} outside one. */
export const usePluginAssets = (): Assets => useContext(PluginAssetsContext);

/** The part of an asset store a surface that authors nothing is handed. */
export const readingAssets = ({ url, read }: Assets): Assets => ({ url, read });
