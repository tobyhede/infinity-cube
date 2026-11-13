import { expect, type Locator } from '@playwright/test';

/**
 * Reading an Image Resource's picture, shared by the application proofs in
 * `image-resource.spec` and the story proofs in `ladle-e2e/resource-open.spec`.
 */

/** The tracked picture both proofs draw, whose natural size is 400×300. */
export const HARBOUR_SIZE = { width: 400, height: 300 } as const;

/**
 * Wait until the picture has loaded and has the natural width given. An `<img>`
 * that is absent from the DOM, still loading or broken reads as zero, so this
 * fails unless the picture's own bytes were decoded.
 */
export async function expectPictureLoaded(picture: Locator, naturalWidth: number): Promise<void> {
  await expect
    .poll(() =>
      picture.evaluate((image) =>
        image instanceof HTMLImageElement && image.complete ? image.naturalWidth : 0,
      ),
    )
    .toBe(naturalWidth);
}
