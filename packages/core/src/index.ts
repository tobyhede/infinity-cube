export * from './schema';
export * from './title';
export * from './types';
export * from './resource-geometry';
export * from './compact-uuid';
export * from './assets';
export * from './graph-head-shape';
export * from './resource-shape';
export * from './resource-size';
export * from './resource-content';
export * from './json-value';
export * from './kinds/kind-module';
export { PLUGINS, PLUGIN_KINDS, type PluginKind } from './kinds/plugins';
export { declaredOutline, type PluginContent } from './kinds/plugin-kind';
export * from './kinds/ur';
export * from './kinds/image';
export * from './kinds/markdown';
export * from './kinds/reference';
export * from './kinds/space';
export {
  KIND_IDS,
  canonicalResource,
  contentTarget,
  drawnByPlugin,
  takesOpen,
  isKindId,
  isRegisteredKind,
  kindFlags,
  isPluginKind,
  keepsMapContent,
  mapContentProblem,
  mapContentWithoutMap,
  resolvedMapContent,
  resourceOutline,
  lifetimeSpaceReferences,
  mayBeTarget,
  DEFAULT_KIND,
  UNRESOLVED_CONTENT,
  newDefaultResourceDocument,
  resolveContent,
  resourceReferences,
  spaceReferences,
  selectSpaceView,
  spaceSelection,
  spaceSelectionProblem,
  type KindId,
  type KindedResource,
} from './kinds/registry';
