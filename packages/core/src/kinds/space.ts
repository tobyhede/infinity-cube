import { spacePlugin, type SpaceContent as SpacePluginContent } from '@project/plugin-space/domain';
import { kindFromPlugin, type PluginContent } from './plugin-kind';
import type { ResourceDocument } from './registry';

/**
 * The Space kind (ADR 0068), drawn by the Space plugin (ADR 0142): a Resource
 * that shows a selected view of another Space through the host's Map
 * embedding. Its one Space reference is the Space it shows, whose lifetime it
 * holds (ADR 0074); the core enforces cycles, lifetime and rooting from that
 * declaration, and that its selection resolves there (ADR 0128). This module
 * reads that plugin's domain half as a kind module; everything it says is the
 * plugin's.
 */
export const spaceKind = kindFromPlugin(spacePlugin);

/** The Space kind's id. */
export type SpaceKindId = typeof spaceKind.id;

/** What a Space Resource's content resolves to: the plugin's content, which its view draws. */
export type SpaceContent = PluginContent<SpaceKindId, SpacePluginContent>;

/** A stored Space Resource document: a Resource document of the Space kind. */
export type SpaceResourceDocument = Extract<ResourceDocument, { kind: SpaceKindId }>;
