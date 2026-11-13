import { describe, expect, it } from 'vitest';
import { block, declared, stylesheet, token } from './canvas-resource-stylesheet';

/**
 * The Title ladder's typography, read off the stylesheet that declares it.
 *
 * Two properties are being held here and neither is visible to a renderer test.
 *
 * The first is a **regression** guard: a Title with no break in it keeps the
 * single-line typography, as ADR 0083 says in as many words. Its four numbers —
 * 18px, weight 600, leading 1.12, tracking -0.02em — are asserted as numbers
 * rather than left to a reviewer's eye, because a ladder built on top of them
 * is exactly the change that could move them without anything failing.
 *
 * The second is that the two rungs below the name are **derived** rather than
 * authored: a ratio of the `title` role's own size, so the scale moves as one.
 * Three independent `font-size` declarations would draw the same picture today
 * and drift the day the name's size changes.
 *
 * jsdom computes no CSS, so a rendering test cannot see any of it; the browser
 * suites see the drawn result but not which declaration produced it. Reading
 * the source is what is left, and `canvas-resource-embedded-map.test.ts` already
 * does it for the one other number this stylesheet shares with the domain.
 */

const rung = (role: string): string => block(`.canvas-resource__title-line[data-role='${role}']`);

/**
 * Every declaration the editing field takes, in cascade order.
 *
 * The field is written by two rules — one it shares with its wrapper and one of
 * its own — and {@link block} answers the first rule whose selector opens a
 * line, which is the shared one. Joining them is what the browser does anyway,
 * and the property this file asks after is declared exactly once across the two.
 */
const titleInput = (): string =>
  [...stylesheet.matchAll(/^\.canvas-resource \.resource__title-input\s*\{([^}]*)\}/gmu)]
    .map((found) => found[1] ?? '')
    .join(';');

describe('a single-line Title', () => {
  /**
   * The regression guard. A Title of one line is only ever the `title` role,
   * so these four values are the whole of what draws it.
   */
  it('is still drawn at 18px, weight 600, leading 1.12 and tracking -0.02em', () => {
    expect(token('--canvas-resource-title-size', 'px')).toBe(18);
    expect(token('--canvas-resource-title-weight')).toBe(600);
    expect(token('--canvas-resource-title-leading')).toBe(1.12);

    const heading = block('.canvas-resource__title');
    expect(declared(heading, 'font-size')).toBe('var(--canvas-resource-title-size)');
    expect(declared(heading, 'font-weight')).toBe('var(--canvas-resource-title-weight)');
    expect(declared(heading, 'line-height')).toBe('var(--canvas-resource-title-leading)');
    expect(declared(heading, 'letter-spacing')).toBe('-0.02em');

    expect(declared(rung('title'), 'font-size')).toBe('var(--canvas-resource-title-size)');
    expect(declared(rung('title'), 'font-weight')).toBe('var(--canvas-resource-title-weight)');
  });

  /**
   * And it wraps at the `title` role for as many visual lines as it needs, to
   * a three-line clamp. The break the box
   * chooses is not a rung.
   */
  it('still clamps to three visual lines at the title role', () => {
    expect(declared(rung('title'), '-webkit-line-clamp')).toBe('3');
    expect(declared(block('.canvas-resource__title-line'), 'white-space')).toBe('normal');
  });
});

describe('the rungs below the name', () => {
  it('derive their size from the title role by ratio rather than restating one', () => {
    expect(declared(rung('subtitle'), 'font-size')).toBe(
      'calc(var(--canvas-resource-title-size) * var(--canvas-resource-subtitle-ratio))',
    );
    expect(declared(rung('caption'), 'font-size')).toBe(
      'calc(var(--canvas-resource-title-size) * var(--canvas-resource-caption-ratio))',
    );

    // Descending, and by enough to be read as a step rather than a wobble.
    const subtitle = token('--canvas-resource-subtitle-ratio');
    const caption = token('--canvas-resource-caption-ratio');
    expect(subtitle).toBeLessThan(1);
    expect(caption).toBeLessThan(subtitle);
  });

  it('step the weight 600 / 500 / 400', () => {
    expect(token('--canvas-resource-title-weight')).toBe(600);
    expect(token('--canvas-resource-subtitle-weight')).toBe(500);
    expect(token('--canvas-resource-caption-weight')).toBe(400);

    expect(declared(rung('title'), 'font-weight')).toBe('var(--canvas-resource-title-weight)');
    expect(declared(rung('subtitle'), 'font-weight')).toBe(
      'var(--canvas-resource-subtitle-weight)',
    );
    expect(declared(rung('caption'), 'font-weight')).toBe('var(--canvas-resource-caption-weight)');
  });

  /**
   * The size and the weight step are already saying "descending". A third
   * mechanism saying it again would be dimming, on a Resource where the Graph
   * colour is carrying information of its own — so no rung sets an ink or an
   * opacity, and all three take `--canvas-resource-title` from the heading.
   */
  it('keep the heading own colour and are not dimmed', () => {
    expect(declared(block('.canvas-resource__title'), 'color')).toBe(
      'var(--canvas-resource-title)',
    );
    for (const role of ['title', 'subtitle', 'caption']) {
      expect(declared(rung(role), 'color')).toBeUndefined();
      expect(declared(rung(role), 'opacity')).toBeUndefined();
    }
  });

  /** Clamping counts visual lines, and it counts them per role. */
  it('clamp visual lines per role', () => {
    const clamps = ['title', 'subtitle', 'caption'].map((role) =>
      Number(declared(rung(role), '-webkit-line-clamp')),
    );
    expect(clamps.every((count) => Number.isInteger(count) && count > 0)).toBe(true);

    const base = block('.canvas-resource__title-line');
    expect(declared(base, 'display')).toBe('-webkit-box');
    expect(declared(base, '-webkit-box-orient')).toBe('vertical');
    expect(declared(base, 'overflow')).toBe('hidden');
  });
});

describe('the ladder ceiling', () => {
  /**
   * The heading clips at the ceiling rather than growing past it; that the
   * ceiling fits a Closed Resource is held by `canvas-resource-title-room.test.tsx`.
   */
  it('is a clip on the heading, not a size the Resource grows to', () => {
    const heading = block('.canvas-resource__title');
    const ceiling = declared(heading, 'max-height') ?? '';
    expect(ceiling.startsWith('calc(')).toBe(true);
    for (const name of [
      '--canvas-resource-title-size',
      '--canvas-resource-title-leading',
      '--canvas-resource-title-ladder-lines',
    ]) {
      expect(ceiling).toContain(name);
    }
    expect(declared(heading, 'overflow')).toBe('hidden');
    expect(declared(heading, 'height')).toBeUndefined();
    expect(declared(heading, 'min-height')).toBeUndefined();
  });
});

describe('the field that writes the Title', () => {
  /**
   * The one size and the one leading are authored on the Resource, and the field an
   * author types into is drawn by the same two. Restating them here is what lets
   * the ladder and the field disagree: move `--canvas-resource-title-size` and the
   * heading, all three rungs and the clamp follow it while the field stays where
   * it was, so the Title changes size and baseline the moment it is clicked into
   * — which is the one moment the two are meant to be indistinguishable.
   */
  it('takes its type from the ladder tokens rather than restating them', () => {
    const input = titleInput();
    expect(declared(input, 'font-size')).toBe('var(--canvas-resource-title-size)');
    expect(declared(input, 'line-height')).toBe('var(--canvas-resource-title-leading)');
    expect(declared(input, 'font-weight')).toBe('var(--canvas-resource-title-weight)');
    expect(declared(input, 'letter-spacing')).toBe('-0.02em');
  });

  /**
   * And it stops growing where the drawn ladder stops.
   *
   * A Title is clamped to the room available and never accommodated (ADR 0083),
   * and the field is not exempt from that: it grows with its content, inside a
   * Resource whose height is authored. Uncapped, the fifth line pushes the Resource's
   * own rail up out of the top of a Closed Resource, where `overflow: hidden` takes
   * it — the kind glyph, the Actions menu and Open all gone while the author is
   * still typing. Capping it at the ladder's own ceiling makes what an author
   * can see while writing exactly what the Resource will draw.
   */
  it('is capped at the ceiling the drawn ladder is capped at', () => {
    const input = titleInput();
    const cap = declared(input, 'max-height') ?? '';
    expect(cap.startsWith('calc(')).toBe(true);
    for (const name of [
      '--canvas-resource-title-size',
      '--canvas-resource-title-leading',
      '--canvas-resource-title-ladder-lines',
    ]) {
      expect(cap).toContain(name);
    }
    // Scrolled rather than clipped: the field is the one place the whole Title
    // has to stay reachable, however many lines the author has typed.
    expect(declared(input, 'overflow-y')).toBe('auto');
  });
});
