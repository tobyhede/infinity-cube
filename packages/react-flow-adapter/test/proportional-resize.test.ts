import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { proportionalSize } from '../src/proportional-resize';

const floor = { width: 260, height: 146 };

describe('proportionalSize', () => {
  it('shrinks when the pointer moves inward on width alone', () => {
    // A Shift-drag straight left: React Flow proposes a narrower rect at the
    // start height.
    expect(
      proportionalSize({ width: 600, height: 400 }, { width: 450, height: 400 }, floor),
    ).toEqual({
      width: 450,
      height: 300,
    });
  });

  it('shrinks when the pointer moves inward on height alone', () => {
    expect(
      proportionalSize({ width: 600, height: 400 }, { width: 600, height: 300 }, floor),
    ).toEqual({
      width: 450,
      height: 300,
    });
  });

  it('follows the axis that changed more when the axes disagree', () => {
    // Down-left: width shrinks by a quarter, height grows by an eighth.
    expect(
      proportionalSize({ width: 600, height: 400 }, { width: 450, height: 450 }, floor),
    ).toEqual({
      width: 450,
      height: 300,
    });
  });

  it('grows with the axis that changed more', () => {
    expect(
      proportionalSize({ width: 600, height: 400 }, { width: 680, height: 410 }, floor),
    ).toEqual({
      width: 680,
      height: 453,
    });
  });

  it.each([
    [
      { width: 400, height: 300 },
      { width: 260, height: 195 },
    ],
    [
      { width: 600, height: 200 },
      { width: 438, height: 146 },
    ],
  ])('stops %o at both floors as %o', (start, stopped) => {
    expect(proportionalSize(start, { width: 1, height: 1 }, floor)).toEqual(stopped);
  });

  it('never answers a size under either floor, or a fractional one', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 50, max: 1600 }),
        fc.integer({ min: 50, max: 1200 }),
        fc.double({ min: 1, max: 3000, noNaN: true }),
        fc.double({ min: 1, max: 3000, noNaN: true }),
        (startWidth, startHeight, width, height) => {
          const size = proportionalSize(
            { width: startWidth, height: startHeight },
            { width, height },
            floor,
          );
          expect(size.width).toBeGreaterThanOrEqual(floor.width);
          expect(size.height).toBeGreaterThanOrEqual(floor.height);
          expect(Number.isInteger(size.width)).toBe(true);
          expect(Number.isInteger(size.height)).toBe(true);
        },
      ),
    );
  });
});
