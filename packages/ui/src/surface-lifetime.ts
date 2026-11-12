import type { PluginHostClaim } from './kinds/plugin-views';

/**
 * One mounted surface's lifetime: the key its drawing is known by, whether it
 * is still drawn, and a Claim it was granted, whose `unmount` tells the host
 * this surface is gone, releasing every Claim taken through it. One is kept,
 * the latest, since each says the same of the same surface; keeping every one
 * would grow with each Claim taken and tell the host once per Claim. A surface
 * on the Map and one inside an embedding each mint one.
 */
export interface SurfaceLifetime {
  readonly drawing: symbol;
  readonly drawn: () => boolean;
  readonly hold: (claim: PluginHostClaim) => void;
  readonly begin: () => void;
  readonly end: () => void;
}

export function createSurfaceLifetime(): SurfaceLifetime {
  let drawn = true;
  let held: PluginHostClaim | null = null;
  return {
    drawing: Symbol('drawing'),
    drawn: () => drawn,
    hold: (claim) => {
      held = claim;
    },
    begin: () => {
      drawn = true;
    },
    end: () => {
      drawn = false;
      const last = held;
      held = null;
      last?.unmount();
    },
  };
}
