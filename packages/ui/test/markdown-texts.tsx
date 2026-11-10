import { createHash } from 'node:crypto';
import type { ReactNode } from 'react';
import type { AssetRef } from '@project/resource-api/domain';
import type { Assets } from '@project/resource-api/view';
import { PluginAssetsProvider } from '../src';

/**
 * A reading asset store for `ui`'s tests (ADR 0142): a Markdown Resource's
 * text is an asset its content names by SHA-256, so a test names the text it
 * wants drawn with {@link textAsset} and draws inside {@link WithTexts}.
 */
const TEXTS = new Map<AssetRef, string>();

/** Hold `text` and answer the reference a Markdown Resource names it by. */
export function textAsset(text: string): AssetRef {
  const ref: AssetRef = `/assets/${createHash('sha256').update(text).digest('base64url')}`;
  TEXTS.set(ref, text);
  return ref;
}

const TEST_ASSETS: Assets = {
  url: (ref) => ref,
  read: (ref) => {
    const text = TEXTS.get(ref);
    return Promise.resolve(
      text === undefined
        ? { refused: 'No test held that text.' }
        : new Blob([text], { type: 'text/markdown' }),
    );
  },
};

/** Supplies the texts {@link textAsset} holds, as a composition supplies its asset store. */
export const WithTexts = ({ children }: { readonly children: ReactNode }) => (
  <PluginAssetsProvider value={TEST_ASSETS}>{children}</PluginAssetsProvider>
);
