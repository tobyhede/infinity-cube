import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { COLLAPSED_RESOURCE_SIZE, isMissingKindId, type JsonValue } from '@project/core';
import { markdownPlugin } from '@project/plugin-markdown/domain';
import { referencePlugin } from '@project/plugin-reference/domain';
import { spacePlugin } from '@project/plugin-space/domain';
import { urPlugin } from '@project/plugin-ur/domain';
import { PluginResource, type PluginResourceProps } from '../src';
import { themeToken, token } from './canvas-resource-stylesheet';
import { WithTexts } from './markdown-texts';

const ID = '00000000-0000-4000-8000-0000000000a1';
const MISSING = 'vnd.example.unavailable';
if (!isMissingKindId(MISSING)) throw new Error('A plugin in this build draws the kind');

/** A Closed Resource of each kind whose plugin draws a Title, at its authored default. */
const CLOSED: readonly {
  readonly kind: PluginResourceProps['kind'];
  readonly content: unknown;
  readonly mapContent: JsonValue;
}[] = [
  {
    kind: 'markdown',
    content: markdownPlugin.newContent,
    mapContent: markdownPlugin.mapContent.default,
  },
  {
    kind: 'reference',
    content: { target: ID },
    mapContent: referencePlugin.mapContent.default,
  },
  {
    kind: 'space',
    content: { spaceId: ID, map: ID, graph: ID },
    mapContent: spacePlugin.mapContent.default,
  },
  { kind: 'ur', content: urPlugin.newContent, mapContent: urPlugin.mapContent.default },
  { kind: MISSING, content: {}, mapContent: {} },
];

/** A length a plugin states inline, in px. */
const px = (value: string): number => {
  if (value === '' || value === '0') return 0;
  expect(value.endsWith('px'), `${value} is not in px`).toBe(true);
  return Number.parseFloat(value);
};

/** The top and bottom of an `inset` shorthand, in px. */
const insetBlock = (inset: string): number => {
  if (inset === '') return 0;
  const [top = '0', , bottom = top] = inset.split(/\s+/u);
  return px(top) + px(bottom);
};

/**
 * The height a plugin takes from the rect around its Title: the inline padding
 * and inset of every element between the Title and the plugin's region.
 */
const takenAround = (title: HTMLElement): number => {
  let taken = 0;
  for (
    let element = title.parentElement;
    element !== null && !element.classList.contains('canvas-resource__plugin');
    element = element.parentElement
  ) {
    taken += px(element.style.paddingTop) + px(element.style.paddingBottom);
    if (element.style.position === 'absolute') taken += insetBlock(element.style.inset);
  }
  return taken;
};

describe('the ladder ceiling', () => {
  /**
   * Placement is authored, so the Title is clamped to the room available and
   * the Resource is never resized to fit one (ADR 0014, ADR 0083).
   *
   * The ceiling is a count of `title`-role lines rather than the room the
   * Resource happens to have, so that the ladder draws the same Open and
   * Closed. What makes that count safe is this: it fits inside the room each
   * plugin leaves a **Closed** Resource's Title (ADR 0142), which is the
   * smaller of the two and the authored default. Nothing in the type system
   * connects these pixels to `COLLAPSED_RESOURCE_SIZE`, so this is what does: a
   * border, a band or a padding change that stole the room would otherwise
   * show up as a Title quietly overrunning its Resource.
   */
  it.each(CLOSED)('fits inside the room a Closed $kind Resource leaves its Title', (closed) => {
    render(
      <WithTexts>
        <PluginResource
          resourceId={ID}
          kind={closed.kind}
          title={{ title: 'Room', readOnly: true, onReturnFocus: () => undefined }}
          content={closed.content}
          mapContent={closed.mapContent}
          outline="rectangle"
          state="rest"
          graphColor="#ffc53d"
          readOnly
          operations={{ kind: closed.kind }}
        />
      </WithTexts>,
    );
    const title = screen.getByRole('heading', { name: 'Room' }).closest('.canvas-resource__title');
    if (!(title instanceof HTMLElement)) throw new Error('The plugin drew no Title');

    // The Resource's own border width is `--canvas-resource-border-width`,
    // declared in `tailwind.css` beside the Resource's colour tokens.
    const border = themeToken('--canvas-resource-border-width', 'px');
    const room = COLLAPSED_RESOURCE_SIZE.height - 2 * border - takenAround(title);
    const ceiling =
      token('--canvas-resource-title-size', 'px') *
      token('--canvas-resource-title-leading') *
      token('--canvas-resource-title-ladder-lines');

    expect(takenAround(title)).toBeGreaterThan(0);
    expect(ceiling).toBeGreaterThan(0);
    expect(ceiling).toBeLessThanOrEqual(room);
  });
});
