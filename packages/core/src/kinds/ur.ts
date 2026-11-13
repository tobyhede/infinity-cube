import { urPlugin } from '@project/plugin-ur/domain';
import { kindFromPlugin, type PluginContent } from './plugin-kind';

/**
 * The Ur kind (ADR 0113), drawn by the Ur plugin (ADR 0142): a Resource with
 * no content, whose Shape on each Map is its plugin's Map content (ADR 0121).
 * This module reads that plugin's domain half as a kind module; everything it
 * says is the plugin's.
 */
export const urKind = kindFromPlugin(urPlugin);

/** The Ur kind's id. */
export type UrKindId = typeof urKind.id;

/** What an Ur Resource's content resolves to: nothing but its kind. */
export type UrContent = PluginContent<UrKindId, typeof urKind.newContent>;
