import { spaceKind } from '@project/core';
import { spacePlugin } from '@project/plugin-space/domain';
import { SpaceResourceIcon } from '../icons';
import type { PluginListing } from './plugin-listing';
import type { PluginOperations } from './plugin-views';

/**
 * The Space kind's place in this package's kind registry, taken from its
 * plugin (ADR 0068, ADR 0142): its names are the plugin's, and its Resources
 * are drawn by `PluginResource` and `PresentedPluginResource`, whose Map
 * embedding draws the Map it selects. Its silhouette is the Space cube every
 * list draws a Space with.
 */
export const spaceListing: PluginListing<PluginOperations> = {
  name: spacePlugin.name,
  listName: spacePlugin.listName,
  referenceName: spacePlugin.referenceName,
  Glyph: SpaceResourceIcon,
  bareOperations: { kind: spaceKind.id },
};
