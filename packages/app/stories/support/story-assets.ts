import { EMPTY_ASSET, type AssetRef } from '@project/resource-api/domain';
import type { Assets } from '@project/resource-api/view';

/**
 * The catalogue's asset store: the texts its stories' Markdown Resources name
 * (ADR 0142), read back through the same `Assets` a running application
 * supplies, so a story draws the text its Resource names.
 *
 * A story's reference is minted from its text by a synchronous hash rather
 * than its SHA-256, because a story's snapshot is a module constant and the
 * browser computes SHA-256 only asynchronously. Nothing in the catalogue
 * checks a reference against its bytes, so the name only has to be stable and
 * distinct.
 */
const TEXTS = new Map<AssetRef, string>([[EMPTY_ASSET, '']]);

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const LAST = 'AEIMQUYcgkosw048';

/** Name `text` as the catalogue's asset store holds it. */
export function storyText(text: string): AssetRef {
  let state = 0x811c9dc5;
  let name = '';
  for (let round = 0; name.length < 42; round += 1) {
    for (const character of `${round}:${text}`) {
      state = Math.imul(state ^ (character.codePointAt(0) ?? 0), 0x01000193) >>> 0;
    }
    for (let shift = 0; shift < 30 && name.length < 42; shift += 6) {
      name += BASE64URL.charAt((state >>> shift) & 63);
    }
  }
  // The last of a SHA-256's 43 characters carries four bits and two of padding.
  name += LAST.charAt(state & 15);
  const ref: AssetRef = `/assets/${name}`;
  TEXTS.set(ref, text);
  return ref;
}

/**
 * Reads each text {@link storyText} named, and the empty asset; any other
 * reference is refused. A story that authors stores its Save's text here,
 * named as {@link storyText} names it.
 */
export const STORY_ASSETS: Assets = {
  url: (ref) => ref,
  store: async (bytes) => storyText(await bytes.text()),
  read: (ref) => {
    const text = TEXTS.get(ref);
    return Promise.resolve(
      text === undefined
        ? { refused: 'The catalogue holds no such asset.' }
        : new Blob([text], { type: 'text/markdown' }),
    );
  },
};
