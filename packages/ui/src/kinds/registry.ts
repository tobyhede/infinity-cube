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
import { defaultView } from './default';
import { imageView } from './image';
import type { KindView } from './kind-view';
import { markdownView } from './markdown';
import { referenceView } from './reference';
import { spaceView } from './space';
import type { PluginOperations } from './plugin-views';
import { urView } from './ur';

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
 * ignores. Opening and Closing are every Resource's and are not here; what it
 * draws, and whether it is Open, is the display's.
 */
export type KindOperations = KindOperationsByKind[KindId];

/**
 * What a Resource of this kind offers beyond its shared Title: its kind's
 * operations, or the default plugin's for a kind no plugin in this build draws.
 */
export type KindOperationsOf<K extends ResourceKind> = K extends KindId
  ? KindOperationsByKind[K]
  : PluginOperations;

/** Each kind's view half, typed so a surface over a kinded value calls its own kind's view. */
type KindViews = {
  readonly [K in KindId]: KindView<KindOperationsByKind[K]>;
};

/** The kinds' view halves: the one place in this package each kind is named (ADR 0128). */
const KIND_VIEWS: KindViews = {
  [markdownKind.id]: markdownView,
  [imageKind.id]: imageView,
  [urKind.id]: urView,
  [referenceKind.id]: referenceView,
  [spaceKind.id]: spaceView,
};

/** What a kind's Resources are called and drawn as. */
export type KindNaming = Pick<KindView<unknown>, 'name' | 'listName' | 'referenceName' | 'Glyph'>;

/**
 * What a kind's Resources are called and drawn as, from its view half, or the
 * default plugin's for a kind no plugin in this build draws.
 */
export const kindNaming = (kind: ResourceKind): KindNaming =>
  isRegisteredKind(kind) ? KIND_VIEWS[kind] : defaultView;

/** What every Resource of a kind whose plugin is missing is called and drawn with: the default plugin's. */
export const missingKindNaming: KindNaming = defaultView;

const registeredBareOperations = <K extends KindId>(kind: K): KindOperationsByKind[K] =>
  KIND_VIEWS[kind].bareOperations;

/** What a Resource of this kind offers before the composition offers anything. */
export function bareOperations<K extends ResourceKind>(kind: K): KindOperationsOf<K>;
export function bareOperations(kind: ResourceKind): PluginOperations {
  return isRegisteredKind(kind) ? registeredBareOperations(kind) : { kind };
}
