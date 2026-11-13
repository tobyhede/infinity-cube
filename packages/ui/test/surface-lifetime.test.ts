import { describe, expect, it, vi } from 'vitest';
import type { PluginHostClaim } from '../src/plugin-catalog';
import { createSurfaceLifetime } from '../src/surface-lifetime';

/**
 * The lifetime every Map and embedded surface mints: a drawing of its own, and
 * the latest Claim handed out through it, whose `unmount` tells the host once
 * that the surface is gone when it ends.
 */

const claim = () => {
  const unmount = vi.fn();
  const held: PluginHostClaim = {
    release: () => undefined,
    unmount,
    exclusively: () => Promise.resolve<'busy'>('busy'),
  };
  return { held, unmount };
};

describe('a surface lifetime', () => {
  it('tells the host once that it is gone, through the latest Claim it holds', () => {
    const lifetime = createSurfaceLifetime();
    const first = claim();
    const second = claim();
    lifetime.hold(first.held);
    lifetime.hold(second.held);
    expect(first.unmount).not.toHaveBeenCalled();

    lifetime.end();
    lifetime.begin();
    lifetime.end();

    expect(first.unmount).not.toHaveBeenCalled();
    expect(second.unmount).toHaveBeenCalledTimes(1);
  });

  it('is drawn until it ends and again once it begins', () => {
    const lifetime = createSurfaceLifetime();
    expect(lifetime.drawn()).toBe(true);
    lifetime.end();
    expect(lifetime.drawn()).toBe(false);
    lifetime.begin();
    expect(lifetime.drawn()).toBe(true);
  });

  it('mints a drawing of its own for each surface', () => {
    expect(createSurfaceLifetime().drawing).not.toBe(createSurfaceLifetime().drawing);
  });
});
