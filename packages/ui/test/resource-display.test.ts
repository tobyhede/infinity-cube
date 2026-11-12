import fc from 'fast-check';
import { uuidSchema, type ResourceContent, type SpaceView } from '@project/core';
import { describe, expect, it } from 'vitest';
import { CLOSED_DISPLAY, type ResourceDisplay } from '../src/resource-display';
import { spaceViewOf } from '../src/kinds/space';

const view: SpaceView = {
  spaceId: uuidSchema.parse('00000000-0000-4000-8000-000000000001'),
  map: uuidSchema.parse('00000000-0000-4000-8000-000000000002'),
  graph: uuidSchema.parse('00000000-0000-4000-8000-000000000003'),
  framing: undefined,
};

const via = fc.constantFrom('self' as const, 'target' as const);

const content: fc.Arbitrary<ResourceContent> = fc.oneof(
  fc.record({
    kind: fc.constant('markdown' as const),
    content: fc.constant({ url: '/assets/47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU' as const }),
    via,
  }),
  fc.record({
    kind: fc.constant('image' as const),
    content: fc.record({ url: fc.webUrl() }),
    via,
  }),
  fc.record({ kind: fc.constant('space' as const), view: fc.constant(view), via }),
  fc.record({ kind: fc.constant('ur' as const), content: fc.constant({}), via }),
  fc.constant({ kind: 'unresolved' as const, via: 'target' as const }),
);

const display: fc.Arbitrary<ResourceDisplay> = fc.oneof(
  fc.constant(CLOSED_DISPLAY),
  content.map((value) => ({ shown: 'open' as const, content: value })),
);

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
