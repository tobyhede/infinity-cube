import { describe, expect, it } from 'vitest';
import { leastPanToShow, visibleCanvasCap } from '../src/visible-canvas-cap';

describe('keeping an editor in view (ADR 0178)', () => {
  const area = { width: 1000, height: 800 };

  it('caps at the visible canvas less a margin, at the zoom', () => {
    expect(visibleCanvasCap(area, 1)).toEqual({ width: 904, height: 704 });
    expect(visibleCanvasCap(area, 0.5)).toEqual({ width: 1808, height: 1408 });
  });

  it('shrinks each margin before using space needed for the Closed Size', () => {
    const narrow = { width: 300, height: 400 };
    expect(visibleCanvasCap(narrow, 1)).toEqual({ width: 260, height: 304 });
    expect(
      leastPanToShow({ x: 0, y: 0, width: 260, height: 304 }, { x: 0, y: 0, zoom: 1 }, narrow),
    ).toEqual({ x: 20, y: 48 });

    const short = { width: 1000, height: 180 };
    expect(visibleCanvasCap(short, 1)).toEqual({ width: 904, height: 146 });
    expect(
      leastPanToShow({ x: 100, y: 25, width: 300, height: 146 }, { x: 0, y: 0, zoom: 1 }, short),
    ).toEqual({ x: 0, y: -8 });
  });

  it('uses the whole visible axis when the zoomed Closed Size cannot fit', () => {
    const viewport = { width: 100, height: 90 };
    const zoom = 4;
    const cap = visibleCanvasCap(viewport, zoom);
    expect(cap).toEqual({ width: 25, height: 22.5 });
    expect(leastPanToShow({ x: 10, y: 5, ...cap }, { x: 0, y: 0, zoom }, viewport)).toEqual({
      x: -40,
      y: -20,
    });
  });

  it('pans nothing for a rect already in view', () => {
    const rect = { x: 100, y: 100, width: 300, height: 200 };
    expect(leastPanToShow(rect, { x: 0, y: 0, zoom: 1 }, area)).toEqual({ x: 0, y: 0 });
  });

  it('pans the least distance that shows a rect reaching past the right and bottom', () => {
    const rect = { x: 600, y: 500, width: 500, height: 400 };
    expect(leastPanToShow(rect, { x: 0, y: 0, zoom: 1 }, area)).toEqual({ x: -148, y: -148 });
  });

  it('pans to show a rect reaching past the left and top, at the zoom', () => {
    const rect = { x: -100, y: -50, width: 200, height: 100 };
    expect(leastPanToShow(rect, { x: 0, y: 0, zoom: 2 }, area)).toEqual({ x: 248, y: 148 });
  });

  it('keeps the top-left in view for a rect larger than the visible canvas', () => {
    const rect = { x: 0, y: 0, width: 2000, height: 2000 };
    expect(leastPanToShow(rect, { x: -10, y: -10, zoom: 1 }, area)).toEqual({ x: 58, y: 58 });
  });
});
