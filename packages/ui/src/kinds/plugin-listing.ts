import type { ComponentType } from 'react';

/** The glyph of a kind that draws the Resource it shows with a badge on it, as a Reference Resource does. */
export const BADGED_TARGET_GLYPH = 'badged-target';

/**
 * The view half of a Resource kind as this package lists it (ADR 0120, ADR
 * 0142): what a Resource of it is called and drawn as in a list, and its
 * operations with none offered. Its Resources are drawn by its plugin, on
 * every surface. Each kind declares one under `kinds/`, and the registry is the
 * one place they are listed, so no surface names a kind (ADR 0128).
 */
export interface PluginListing<Operations> {
  /** What one Resource of this kind is called. */
  readonly name: string;
  /** What the Resources list calls this kind's Resources. */
  readonly listName: string;
  /** What a Reference Resource to one of this kind is called, or `null` when one may not be a Target. */
  readonly referenceName: string | null;
  /**
   * The silhouette this kind draws, or {@link BADGED_TARGET_GLYPH} for a kind
   * that draws the glyph of the Resource it shows with a badge on it, as a
   * Reference Resource does. Required, so a new kind chooses one.
   */
  readonly Glyph: ComponentType<{ size?: number | undefined }> | typeof BADGED_TARGET_GLYPH;
  /** What a Resource of this kind offers before the composition offers anything. */
  readonly bareOperations: Operations;
}
