// @vitest-environment jsdom

import { diagramExtent, diagramHeightAt } from '../src/svg-size';

describe('the size a drawn diagram declares', () => {
  it('reads the viewBox and the max-width Mermaid sets', () => {
    expect(
      diagramExtent(
        '<svg id="d" width="100%" style="max-width: 300.5px;" viewBox="-8 -8 300.5 120"></svg>',
      ),
    ).toEqual({ width: 300.5, height: 120, maxWidth: 300.5 });
  });

  it('reads a width and height in pixels where there is no viewBox', () => {
    expect(diagramExtent('<svg width="200" height="100px"></svg>')).toEqual({
      width: 200,
      height: 100,
      maxWidth: 200,
    });
  });

  it('declares none for an SVG with no size, or for what is not an SVG', () => {
    expect(diagramExtent('<svg width="100%"></svg>')).toBeUndefined();
    expect(diagramExtent('<p>not a diagram</p>')).toBeUndefined();
  });

  it('is drawn as wide as the box allows up to its most, at its own aspect', () => {
    const extent = { width: 400, height: 200, maxWidth: 400 };
    expect(diagramHeightAt(extent, 200)).toBe(100);
    expect(diagramHeightAt(extent, 800)).toBe(200);
  });
});
