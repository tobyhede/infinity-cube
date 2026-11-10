import { createHash } from 'node:crypto';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { z } from 'zod';
import { EMPTY_ASSET, type AssetRef } from '@project/resource-api/domain';
import type { Assets } from '@project/resource-api/view';
import { PluginAssetsProvider } from '@project/ui';

/**
 * A memory asset store for the application's tests (ADR 0142): a Markdown
 * Resource's text is an asset its content names by SHA-256, so a test that
 * wants a Resource to read some text names it with {@link textAsset}, and the
 * store {@link TEST_ASSETS} reads it back and stores a Save's text.
 *
 * Content addressing makes one store shared by every test harmless: a text
 * names one reference wherever it is stored.
 */
const TEXTS = new Map<AssetRef, string>([[EMPTY_ASSET, '']]);

const refOf = (bytes: Uint8Array): AssetRef =>
  `/assets/${createHash('sha256').update(bytes).digest('base64url')}`;

/** Store `text` and answer the reference a Markdown Resource names it by. */
export function textAsset(text: string): AssetRef {
  const ref = refOf(new TextEncoder().encode(text));
  TEXTS.set(ref, text);
  return ref;
}

/** The text `ref` names, or `undefined` when nothing stored it. */
export const textAt = (ref: string): string | undefined =>
  [...TEXTS].find(([stored]) => stored === ref)?.[1];

/** The store a mounted test Space hands its plugins. */
export const TEST_ASSETS: Assets = {
  url: (ref) => ref,
  read: (ref) => {
    const text = TEXTS.get(ref);
    return Promise.resolve(
      text === undefined
        ? { refused: 'No test stored that text.' }
        : new Blob([text], { type: 'text/markdown' }),
    );
  },
  store: (bytes) =>
    new Promise((resolve) => {
      // jsdom's Blob reads only through a FileReader.
      const reader = new FileReader();
      reader.onload = () => resolve(textAsset(z.string().parse(reader.result)));
      reader.readAsText(bytes);
    }),
};

/** `ui` drawn inside {@link TEST_ASSETS}, as a composition supplies its asset store. */
export const withTestAssets = (ui: ReactElement): ReactElement =>
  createElement(PluginAssetsProvider, { value: TEST_ASSETS }, ui);

/** A render wrapper drawing inside {@link TEST_ASSETS}, kept across a `rerender`. */
export const TestAssets = ({ children }: { readonly children?: ReactNode }): ReactElement =>
  createElement(PluginAssetsProvider, { value: TEST_ASSETS }, children);
