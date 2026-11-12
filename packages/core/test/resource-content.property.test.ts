import fc from 'fast-check';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  authorsContent,
  isOwnContent,
  embedsMap,
  drawsContentArea,
  EMPTY_ASSET_REF,
  uuidSchema,
  type ContentVia,
  type OwnResourceContent,
  type ResourceContent,
} from '../src/index';

const id = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const contents = (via: ContentVia): ResourceContent[] => [
  { kind: 'markdown', content: { url: EMPTY_ASSET_REF }, via },
  { kind: 'image', content: { url: 'https://example.com/image.png' }, via },
  { kind: 'space', content: { spaceId: id, map: id, graph: id }, via },
  { kind: 'ur', content: {}, via },
];
const UNRESOLVED: ResourceContent = { kind: 'unresolved', via: 'target' };

const viaArbitrary = fc.constantFrom<ContentVia>('self', 'target');
const contentArbitrary: fc.Arbitrary<ResourceContent> = fc.oneof(
  fc.record({
    kind: fc.constant('markdown' as const),
    content: fc.constant({ url: EMPTY_ASSET_REF }),
    via: viaArbitrary,
  }),
  fc.record({
    kind: fc.constant('image' as const),
    content: fc.record({ url: fc.webUrl() }),
    via: viaArbitrary,
  }),
  fc.record({
    kind: fc.constant('space' as const),
    content: fc.constant({ spaceId: id, map: id, graph: id }),
    via: viaArbitrary,
  }),
  fc.record({ kind: fc.constant('ur' as const), content: fc.constant({}), via: viaArbitrary }),
  fc.constant(UNRESOLVED),
);
const asSelf = (content: ResourceContent): ResourceContent =>
  content.kind === 'unresolved' ? content : { ...content, via: 'self' };

describe('content facts', () => {
  it('offers authoring only for own content of a kind that authors it', () => {
    fc.assert(
      fc.property(contentArbitrary, (content) => {
        const offered = authorsContent(content);
        // `unresolved` is always `via: 'target'`, so `via` alone excludes it. A
        // plugin kind authors its own content, so the canvas offers none.
        expect(offered).toBe(content.via === 'self' && content.kind === 'space');
      }),
    );
  });

  it('narrows to the Resource’s own content exactly when it is its own', () => {
    for (const content of [...contents('self'), ...contents('target'), UNRESOLVED]) {
      expect(isOwnContent(content)).toBe(content.via === 'self');
      if (isOwnContent(content)) expectTypeOf(content).toEqualTypeOf<OwnResourceContent>();
    }
    expectTypeOf<OwnResourceContent['via']>().toEqualTypeOf<'self'>();
    expectTypeOf(authorsContent).returns.toEqualTypeOf<boolean>();
  });

  it('answers Map embedding and content area regardless of via', () => {
    fc.assert(
      fc.property(contentArbitrary, (content) => {
        const self = asSelf(content);
        expect(embedsMap(content)).toBe(embedsMap(self));
        expect(drawsContentArea(content)).toBe(drawsContentArea(self));
      }),
    );
  });

  it('answers each kind’s own authoring and content facts', () => {
    expect(contents('self').map(authorsContent)).toEqual([false, false, true, false]);
    expect(authorsContent(UNRESOLVED)).toBe(false);
    expect([...contents('self'), UNRESOLVED].map(embedsMap)).toEqual([
      false,
      false,
      true,
      false,
      false,
    ]);
    // A plugin draws inside its own rect, so no content area is drawn
    // for one; `unresolved` draws its "Target not found" notice there.
    expect([...contents('self'), UNRESOLVED].map(drawsContentArea)).toEqual([
      false,
      false,
      false,
      false,
      true,
    ]);
  });
});
