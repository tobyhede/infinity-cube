/** How long a picture may take to load before it is taken as one that did not. */
const MEASURE_TIMEOUT_MS = 10_000;

/** A picture's natural size in pixels. */
export interface PictureSize {
  readonly width: number;
  readonly height: number;
}

/**
 * The browser loading a picture to learn its natural size (ADR 0106): the one
 * place the application builds an `Image`, named at the composition root and
 * handed to a Resource plugin as its surface's `measure` (ADR 0109). A picture
 * that errors, never answers within `timeoutMs`, or has no intrinsic size
 * answers `undefined`.
 */
export const measurePictureInBrowser = (
  src: string,
  timeoutMs: number = MEASURE_TIMEOUT_MS,
): Promise<PictureSize | undefined> =>
  new Promise((resolve) => {
    const picture = new Image();
    const settle = (size: PictureSize | undefined): void => {
      clearTimeout(timer);
      picture.onload = null;
      picture.onerror = null;
      resolve(size);
    };
    const timer = setTimeout(() => settle(undefined), timeoutMs);
    picture.onload = () => {
      const { naturalWidth: width, naturalHeight: height } = picture;
      settle(width > 0 && height > 0 ? { width, height } : undefined);
    };
    picture.onerror = () => settle(undefined);
    picture.src = src;
  });
