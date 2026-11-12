import { defaultPlugin } from '@project/plugin-default/domain';
import { kindFromPlugin } from './plugin-kind';

/**
 * The default plugin read as a kind module (ADR 0142): the rules the core
 * applies to a Resource whose kind names no plugin in this build. It is not
 * registered, so no stored kind is ever its; the registry reads its flags and
 * Map content for every kind that is missing.
 */
export const defaultKind = kindFromPlugin(defaultPlugin);
