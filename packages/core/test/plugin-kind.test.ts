import { describe, expect, it } from 'vitest';
import {
  isPluginKind,
  jsonValueSchema,
  keepsMapContent,
  mapContentProblem,
  mapContentWithoutMap,
  PLUGIN_KINDS,
  resolvedMapContent,
  resourceOutline,
  sameJsonValue,
} from '../src/index';

describe('a Resource plugin read as a kind (ADR 0142)', () => {
  it('lists every plugin this build draws, and only those keep Map content', () => {
    expect(PLUGIN_KINDS).toEqual(['ur']);
    expect(isPluginKind('ur')).toBe(true);
    expect(isPluginKind('markdown')).toBe(false);
    expect(keepsMapContent('ur')).toBe(true);
    expect(keepsMapContent('markdown')).toBe(false);
  });

  it("answers Map content with the plugin's own schema", () => {
    expect(mapContentProblem('ur', { shape: 'pill' })).toBeUndefined();
    expect(mapContentProblem('ur', { shape: 'hexagon' })).toMatch(/\S/u);
    expect(mapContentProblem('markdown', { shape: 'rectangle' })).toMatch(/keeps no Map content/u);
  });

  it('gives the plugin its default where the entry stores none, and its value with no Map', () => {
    expect(resolvedMapContent('ur', undefined)).toEqual({ shape: 'rectangle' });
    expect(resolvedMapContent('ur', { shape: 'diamond' })).toEqual({ shape: 'diamond' });
    expect(resolvedMapContent('markdown', undefined)).toBeUndefined();
    expect(mapContentWithoutMap('ur')).toEqual({ shape: 'rectangle' });
  });

  it('strokes the outline the plugin declares, and a rectangle for any other kind', () => {
    expect(resourceOutline('ur', { shape: 'ellipse' })).toBe('ellipse');
    expect(resourceOutline('ur', undefined)).toBe('rectangle');
    expect(resourceOutline('ur', { shape: 'hexagon' })).toBe('rectangle');
    expect(resourceOutline('markdown', undefined)).toBe('rectangle');
  });
});

describe('sameJsonValue', () => {
  it('compares JSON values whole, key order aside', () => {
    expect(sameJsonValue({ a: 1, b: [1, { c: null }] }, { b: [1, { c: null }], a: 1 })).toBe(true);
    expect(sameJsonValue({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameJsonValue([1, 2], [2, 1])).toBe(false);
    expect(sameJsonValue([1], { 0: 1 })).toBe(false);
    expect(sameJsonValue(null, {})).toBe(false);
    expect(sameJsonValue('a', 'a')).toBe(true);
  });
});

describe('jsonValueSchema', () => {
  it('refuses an object carrying a __proto__ key, at any depth, rather than dropping it', () => {
    expect(jsonValueSchema.safeParse(JSON.parse('{"shape":"pill","__proto__":{}}')).success).toBe(
      false,
    );
    expect(jsonValueSchema.safeParse(JSON.parse('[{"a":{"__proto__":1}}]')).success).toBe(false);
    expect(jsonValueSchema.parse(JSON.parse('{"proto":{"a":[1,"b",null,true]}}'))).toEqual({
      proto: { a: [1, 'b', null, true] },
    });
  });
});
