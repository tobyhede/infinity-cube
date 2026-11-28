import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CloseIcon, OpenIcon } from '@project/resource-api/view';

const linesOf = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('path'), (path) => path.getAttribute('d'));

describe('the Open and Close glyphs', () => {
  it('draws Open as three full lines, the detail', () => {
    const { container } = render(<OpenIcon />);
    expect(linesOf(container)).toEqual(['M3 5h18', 'M3 12h18', 'M3 19h18']);
  });

  it('draws Close as Open without its middle line, the summary', () => {
    const { container } = render(<CloseIcon />);
    expect(linesOf(container)).toEqual(['M3 5h18', 'M3 19h18']);
  });

  it.each([
    ['Open', OpenIcon],
    ['Close', CloseIcon],
  ])('draws %s at the rail’s 14px, hidden from assistive technology', (_name, Icon) => {
    const { container } = render(<Icon />);
    const glyph = container.querySelector('svg');
    expect(glyph).toHaveAttribute('width', '14');
    expect(glyph).toHaveAttribute('height', '14');
    expect(glyph).toHaveAttribute('aria-hidden', 'true');
  });
});
