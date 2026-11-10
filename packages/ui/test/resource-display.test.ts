import fc from 'fast-check';
import { uuidSchema, type ResourceContent, type SpaceView } from '@project/core';
import { describe, expect, it } from 'vitest';
import { atRest, CLOSED_DISPLAY, type ResourceDisplay } from '../src/resource-display';
import { beginEditing } from '../src/kinds/markdown';
import { spaceViewOf } from '../src/kinds/space';
import type { CanvasResourceBodyEditor } from '../src/CanvasResource';

const view: SpaceView = {
  spaceId: uuidSchema.parse('00000000-0000-4000-8000-000000000001'),
  map: uuidSchema.parse('00000000-0000-4000-8000-000000000002'),
  graph: uuidSchema.parse('00000000-0000-4000-8000-000000000003'),
  framing: undefined,
};

const via = fc.constantFrom('self' as const, 'target' as const);

const content: fc.Arbitrary<ResourceContent> = fc.oneof(
  fc.record({ kind: fc.constant('markdown' as const), source: fc.string(), via }),
  fc.record({
    kind: fc.constant('image' as const),
    content: fc.record({ url: fc.webUrl() }),
    via,
  }),
  fc.record({ kind: fc.constant('space' as const), view: fc.constant(view), via }),
  fc.record({ kind: fc.constant('ur' as const), content: fc.constant({}), via }),
  fc.constant({ kind: 'unresolved' as const, via: 'target' as const }),
);

const editor: CanvasResourceBodyEditor = { onComplete: () => 'completed', onEnd: () => undefined };

const shown: fc.Arbitrary<ResourceDisplay> = fc.oneof(
  fc.constant(CLOSED_DISPLAY),
  content.map((value) => ({ shown: 'open' as const, content: value })),
);

/** Every display, including the two only the helpers make. */
const display: fc.Arbitrary<ResourceDisplay> = fc.oneof(
  shown,
  fc.tuple(shown, fc.boolean()).map(([value, autoFocus]) => beginEditing(value, editor, autoFocus)),
);

const openOwn = (value: ResourceDisplay, kind: 'markdown'): boolean =>
  value.shown === 'open' && value.content.kind === kind && value.content.via === 'self';

describe('the display states only a Resource’s own content enters', () => {
  it('begins editing only Open own Markdown, and returns to it at rest', () => {
    fc.assert(
      fc.property(display, fc.boolean(), (value, autoFocus) => {
        const editing = beginEditing(value, editor, autoFocus);
        if (!openOwn(value, 'markdown')) {
          expect(editing).toBe(value);
          return;
        }
        expect(editing).toMatchObject({
          shown: 'editing',
          kind: 'markdown',
          edit: { editor, autoFocus },
        });
        expect(atRest(editing)).toEqual(value);
      }),
    );
  });

  it('never edits an Open Ur or Image Resource, its own or a Target’s', () => {
    for (const reached of ['self', 'target'] as const) {
      const open: ResourceDisplay = {
        shown: 'open',
        content: { kind: 'ur', content: {}, via: reached },
      };
      expect(beginEditing(open, editor, true)).toBe(open);
      const picture: ResourceDisplay = {
        shown: 'open',
        content: { kind: 'image', content: { url: 'https://example.com/a.png' }, via: reached },
      };
      expect(beginEditing(picture, editor, true)).toBe(picture);
    }
  });

  it('leaves every display that is not editing as it is at rest', () => {
    fc.assert(
      fc.property(shown, (value) => {
        expect(atRest(value)).toBe(value);
      }),
    );
  });
});

describe('the Space view a display shows', () => {
  it('answers the view and how it was reached for an Open Space', () => {
    for (const reached of ['self', 'target'] as const)
      expect(
        spaceViewOf({ shown: 'open', content: { kind: 'space', view, via: reached } }),
      ).toEqual({ view, via: reached });
  });

  it('answers nothing for a Closed display, or one showing anything but a Space', () => {
    fc.assert(
      fc.property(display, (value) => {
        const drawsSpace = value.shown === 'open' && value.content.kind === 'space';
        expect(spaceViewOf(value) === undefined).toBe(!drawsSpace);
      }),
    );
    expect(spaceViewOf(CLOSED_DISPLAY)).toBeUndefined();
  });
});
