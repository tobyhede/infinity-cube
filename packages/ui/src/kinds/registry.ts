import {
  imageKind,
  markdownKind,
  referenceKind,
  spaceKind,
  urKind,
  isRegisteredKind,
  type KindId,
  type ResourceKind,
} from '@project/core';
import { defaultListing } from './default';
import { imageListing } from './image';
import type { PluginListing } from './plugin-listing';
import { markdownListing } from './markdown';
import { referenceListing } from './reference';
import { spaceListing } from './space';
import type { PluginOperations } from './plugin-views';
import { urListing } from './ur';

/** What each kind offers beyond its shared Title, by its id. */
export interface KindOperationsByKind {
  [markdownKind.id]: PluginOperations;
  [referenceKind.id]: PluginOperations;
  [imageKind.id]: PluginOperations;
  [urKind.id]: PluginOperations;
  [spaceKind.id]: PluginOperations;
}

/**
 * What a Resource's kind offers beyond its shared Title (ADR 0051): a kind-owned
 * choice of operations, not a kind tag plus an optional field every other kind
 * ignores. Whether it has an Open state at all, and what it draws, is its
 * plugin's (ADR 0142).
 */
export type KindOperations = KindOperationsByKind[KindId];

/**
 * What a Resource of this kind offers beyond its shared Title: its kind's
 * operations, or the default plugin's for a kind no plugin in this build draws.
 */
export type KindOperationsOf<K extends ResourceKind> = K extends KindId
  ? KindOperationsByKind[K]
  : PluginOperations;

/** Each kind's listing, its view half, typed so a surface over a kinded value reads its own kind's. */
type PluginListings = {
  readonly [K in KindId]: PluginListing<KindOperationsByKind[K]>;
};

/** The kinds' listings: the one place in this package each kind is named (ADR 0128). */
const PLUGIN_LISTINGS: PluginListings = {
  [markdownKind.id]: markdownListing,
  [imageKind.id]: imageListing,
  [urKind.id]: urListing,
  [referenceKind.id]: referenceListing,
  [spaceKind.id]: spaceListing,
};

/** What a kind's Resources are called and drawn as. */
export type KindNaming = Pick<
  PluginListing<unknown>,
  'name' | 'listName' | 'referenceName' | 'Glyph'
>;

/**
 * What a kind's Resources are called and drawn as, from its view half, or the
 * default plugin's for a kind no plugin in this build draws.
 */
export const kindNaming = (kind: ResourceKind): KindNaming =>
  isRegisteredKind(kind) ? PLUGIN_LISTINGS[kind] : defaultListing;

/** What every Resource of a kind whose plugin is missing is called and drawn with: the default plugin's. */
export const missingKindNaming: KindNaming = defaultListing;

const registeredBareOperations = <K extends KindId>(kind: K): KindOperationsByKind[K] =>
  PLUGIN_LISTINGS[kind].bareOperations;

/** What a Resource of this kind offers before the composition offers anything. */
export function bareOperations<K extends ResourceKind>(kind: K): KindOperationsOf<K>;
export function bareOperations(kind: ResourceKind): PluginOperations {
  return isRegisteredKind(kind) ? registeredBareOperations(kind) : { kind };
}
