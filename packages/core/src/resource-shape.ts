import { RECTANGLE } from '@project/resource-api/domain';
import type { ResourceShape } from './types';

/**
 * The outline a Resource is drawn in where nothing declares another: the
 * rectangle (ADR 0142). A plugin's declared outline, from its Map content, is
 * `resourceOutline`'s answer.
 */
export const DEFAULT_RESOURCE_SHAPE: ResourceShape = RECTANGLE;
