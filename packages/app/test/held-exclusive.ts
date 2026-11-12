import type { PluginGate } from '../src/plugin-host/plugin-gate';

/** Exclusive work running under `gate` until it is released, as a Replace runs. */
export interface HeldExclusive {
  /** Settles once the work has ended and its Claim is released. */
  readonly running: Promise<void>;
  readonly release: () => void;
  /** End the work by rejecting with `cause`, as a Replace whose upload fails ends. */
  readonly fail: (cause: Error) => void;
}

/**
 * Claim `resourceId`'s surface and run exclusive work that waits for
 * `release`, so every composed Space withdraws authoring and navigation until
 * it ends (ADR 0126). `undefined` when there is no gate or it refuses the Claim.
 */
export const holdExclusive = (
  gate: PluginGate | undefined,
  resourceId: string,
): HeldExclusive | undefined => {
  const claim = gate?.claim([resourceId], () => ({}));
  if (claim === undefined) return undefined;
  const ended = Promise.withResolvers<undefined>();
  const running = claim
    .exclusively(() => ended.promise)
    .then(
      () => undefined,
      () => undefined,
    )
    .then(() => {
      claim.release();
    });
  return {
    running,
    release: () => ended.resolve(undefined),
    fail: (cause) => ended.reject(cause),
  };
};
