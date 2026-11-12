import { afterEach, describe, expect, it, vi } from 'vitest';
import { measurePictureInBrowser } from '../src/browser-picture-measure';

afterEach(() => {
  vi.useRealTimers();
});

describe('measuring a picture in the browser', () => {
  it('answers nothing once the picture has taken too long', async () => {
    vi.useFakeTimers();

    const measured = measurePictureInBrowser('https://example.com/slow.png', 50);
    await vi.advanceTimersByTimeAsync(50);

    await expect(measured).resolves.toBeUndefined();
  });
});
