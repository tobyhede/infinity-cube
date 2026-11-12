import type { PluginHostClaim } from './kinds/plugin-views';

/**
 * One mounted surface's lifetime: the key its drawing is known by, whether it
 * is still drawn, and the Claims it was granted, which go with it when it
 * unmounts. A surface on the Map and one inside an embedding each mint one.
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
  const held: PluginHostClaim[] = [];
  return {
    drawing: Symbol('drawing'),
    drawn: () => drawn,
    hold: (claim) => {
      held.push(claim);
    },
    begin: () => {
      drawn = true;
    },
    end: () => {
      drawn = false;
      for (const claim of held.splice(0)) claim.unmount();
    },
  };
}
