import type { GlobalProvider } from '@ladle/react';
import { PluginAssetsProvider, TooltipProvider } from '@project/ui';
import '@xyflow/react/dist/style.css';
import '../src/styles.css';
import '../src/tailwind.css';
import '../src/theme-dark.css';
// Composed for its effect: `data-theme` on the root, before any story draws.
import '../stories/support/catalogue-color-scheme';
import { STORY_ASSETS } from '../stories/support/story-assets';

/**
 * Load the same providers and stylesheets used by production compositions, and
 * the catalogue's asset store where an application supplies its own.
 */
export const Provider: GlobalProvider = ({ children }) => (
  <TooltipProvider>
    <PluginAssetsProvider value={STORY_ASSETS}>{children}</PluginAssetsProvider>
  </TooltipProvider>
);
