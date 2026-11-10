import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { uuidSchema, type MapId } from '@project/core';
import type { AssetRef } from '@project/resource-api/domain';
import type { Assets } from '@project/resource-api/view';
import { PluginAssetsProvider } from '@project/ui';
import type { OpenSpace } from '../src/open-spaces';
import { useResourcePlacement } from '../src/resource-placement';
import {
  MAP_ID,
  OTHER_MAP_ID,
  derivationSpace,
  openDerivationSpace,
} from './app-derivation-fixtures';
import { mintingIds } from './minting';

/**
 * The Image plugin's creation from dropped files, as `useResourcePlacement`
 * runs it, driven while the picture it brings is still being stored.
 */

const CREATED = uuidSchema.parse('00000000-0000-4000-8000-0000000000e1');
const STORED: AssetRef = '/assets/LCa0a2j_xo_5m0U8HTBBNBNCLXBkg7-g-YpeiGJm564';
const AT = { x: 30, y: 40 };

const GIF_BYTES = Uint8Array.from([...new TextEncoder().encode('GIF89a'), 5, 0, 1, 0]);

/** A file whose bytes can be read, which jsdom's `File` cannot do. */
class ReadableFile extends File {
  override arrayBuffer(): Promise<ArrayBuffer> {
    return Promise.resolve(GIF_BYTES.slice().buffer);
  }
}

/** A GIF whose header gives its size, so it is sized without being loaded. */
const gif = (): File => new ReadableFile([GIF_BYTES], 'a.gif', { type: 'image/gif' });

/** An asset store whose every store waits for `release`. */
const heldStore = () => {
  const waiting: (() => void)[] = [];
  const assets: Assets = {
    url: (ref) => ref,
    read: () => Promise.resolve({ refused: 'Nothing is read here.' }),
    store: () =>
      new Promise((resolve) => {
        waiting.push(() => resolve(STORED));
      }),
  };
  return {
    assets,
    release: () => {
      for (const resolve of waiting.splice(0)) resolve();
    },
  };
};

const drawnMap = (mapId: MapId = MAP_ID) => {
  const resolved = derivationSpace().lookup.map(mapId);
  if (resolved === undefined) throw new Error('The fixture has no drawn Map.');
  return resolved.map;
};

const place = (opened: OpenSpace, assets: Assets) =>
  renderHook(
    () =>
      useResourcePlacement(opened, {
        map: drawnMap(),
        presenting: false,
        replacementEpoch: 0,
        reportBreak: () => undefined,
      }),
    {
      wrapper: ({ children }: { readonly children: ReactNode }) => (
        <PluginAssetsProvider value={assets}>{children}</PluginAssetsProvider>
      ),
    },
  );

const placedIn = (opened: OpenSpace, mapId: MapId): readonly string[] =>
  Object.keys(
    opened.session.getState().working.document.maps?.find(({ id }) => id === mapId)?.positions ??
      {},
  );

/** Settle every promise the gesture chained on the answer. */
const settled = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

describe('an Image Resource drop the author moves away from', () => {
  it('places the Resource on the Map it was made on, and owes no Title on the Map drawn now', async () => {
    const storing = heldStore();
    const opened = openDerivationSpace(mintingIds(CREATED));
    const { result } = place(opened, storing.assets);

    act(() => result.current.createFromData({ kind: 'files', files: [gif()] }, AT));
    await settled();
    act(() => opened.app.navigation.selectMap(OTHER_MAP_ID));
    storing.release();
    await settled();

    expect(placedIn(opened, MAP_ID)).toContain(CREATED);
    expect(placedIn(opened, OTHER_MAP_ID)).not.toContain(CREATED);
    expect(opened.app.navigation.getState().selectedMapId).toBe(OTHER_MAP_ID);
    expect(opened.app.continuation.getState().pending).toBeNull();
  });

  it('continues in the Title while the Map it was made on is still drawn', async () => {
    const storing = heldStore();
    const opened = openDerivationSpace(mintingIds(CREATED));
    const { result } = place(opened, storing.assets);

    act(() => result.current.createFromData({ kind: 'files', files: [gif()] }, AT));
    await settled();
    storing.release();
    await settled();

    expect(placedIn(opened, MAP_ID)).toContain(CREATED);
    expect(opened.app.continuation.getState().pending).toEqual({
      target: { kind: 'resource', resourceId: CREATED },
      select: true,
      then: 'rename',
    });
  });
});

describe('an Image Resource drop that brought no files', () => {
  it('leaves a gesture still in flight to settle', async () => {
    const storing = heldStore();
    const opened = openDerivationSpace(mintingIds(CREATED));
    const { result } = place(opened, storing.assets);

    act(() => result.current.createFromData({ kind: 'files', files: [gif()] }, AT));
    act(() => result.current.createFromData({ kind: 'files', files: [] }, AT));
    await settled();
    storing.release();
    await settled();

    expect(opened.app.continuation.getState().pending).toEqual({
      target: { kind: 'resource', resourceId: CREATED },
      select: true,
      then: 'rename',
    });
  });
});

describe('an Image Resource picked after the author moved to another Map', () => {
  it('places it on the Map drawn when the picker answers, and continues in its Title there', async () => {
    let answer: (files: File[]) => void = () => undefined;
    const assets: Assets = {
      url: (ref) => ref,
      read: () => Promise.resolve({ refused: 'Nothing is read here.' }),
      pick: () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
      store: () => Promise.resolve(STORED),
    };
    const opened = openDerivationSpace(mintingIds(CREATED));
    let mapId: MapId = MAP_ID;
    const { result, rerender } = renderHook(
      () =>
        useResourcePlacement(opened, {
          map: drawnMap(mapId),
          presenting: false,
          replacementEpoch: 0,
          reportBreak: () => undefined,
        }),
      {
        wrapper: ({ children }: { readonly children: ReactNode }) => (
          <PluginAssetsProvider value={assets}>{children}</PluginAssetsProvider>
        ),
      },
    );

    act(() => result.current.createFromDock('image'));
    act(() => opened.app.navigation.selectMap(OTHER_MAP_ID));
    mapId = OTHER_MAP_ID;
    rerender();
    answer([gif()]);
    await settled();

    expect(placedIn(opened, OTHER_MAP_ID)).toContain(CREATED);
    expect(placedIn(opened, MAP_ID)).not.toContain(CREATED);
    expect(opened.app.continuation.getState().pending).toEqual({
      target: { kind: 'resource', resourceId: CREATED },
      select: true,
      then: 'rename',
    });
  });
});
