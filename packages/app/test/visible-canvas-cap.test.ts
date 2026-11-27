import { describe, expect, it } from 'vitest';
import { leastPanToShow, visibleCanvasCap } from '../src/visible-canvas-cap';

describe('keeping an editor in view (ADR 0178)', () => {
  const area = { width: 1000, height: 800 };

  it('caps at the visible canvas less a margin, at the zoom', () => {
    expect(visibleCanvasCap(area, 1)).toEqual({ width: 904, height: 704 });
    expect(visibleCanvasCap(area, 0.5)).toEqual({ width: 1808, height: 1408 });
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
