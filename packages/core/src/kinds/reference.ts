import {
  referencePlugin,
  type ReferenceContent as ReferencePluginContent,
} from '@project/plugin-reference/domain';
import { kindFromPlugin, type PluginContent } from './plugin-kind';

/**
 * The Reference kind (ADR 0070), drawn by the Reference plugin (ADR 0142): a
 * Resource that shows its Target under its own Title. Its one Resource
 * reference is its Target, and it may not itself be a Target, so referencing
 * is a single hop (ADR 0113). This module reads that plugin's domain half as a
 * kind module; everything it says is the plugin's.
 */
export const referenceKind = kindFromPlugin(referencePlugin);

/** The Reference kind's id. */
export type ReferenceKindId = typeof referenceKind.id;

/** What a Reference Resource's own content resolves to; a Reference draws its Target's (ADR 0070). */
export type ReferenceContent = PluginContent<ReferenceKindId, ReferencePluginContent>;
