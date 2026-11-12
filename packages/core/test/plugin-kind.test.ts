import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { definePlugin, type Outline } from '@project/resource-api/domain';
import { declaredOutline, kindFromPlugin } from '../src/kinds/plugin-kind';
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
    expect(PLUGIN_KINDS).toEqual(['image', 'markdown', 'ur']);
    expect(isPluginKind('ur')).toBe(true);
    expect(isPluginKind('image')).toBe(true);
    expect(isPluginKind('markdown')).toBe(true);
    expect(isPluginKind('reference')).toBe(false);
    expect(keepsMapContent('image')).toBe(true);
    expect(keepsMapContent('ur')).toBe(true);
    expect(keepsMapContent('markdown')).toBe(true);
    expect(keepsMapContent('reference')).toBe(false);
  });

  it("answers Map content with the plugin's own schema", () => {
    expect(mapContentProblem('ur', { shape: 'pill' })).toBeUndefined();
    expect(mapContentProblem('ur', { shape: 'hexagon' })).toMatch(/\S/u);
    expect(mapContentProblem('markdown', { open: true })).toBeUndefined();
    expect(mapContentProblem('markdown', { shape: 'rectangle' })).toMatch(/\S/u);
    expect(mapContentProblem('reference', { open: true })).toMatch(/keeps no Map content/u);
  });

  it('gives the plugin its default where the entry stores none, and its value with no Map', () => {
    expect(resolvedMapContent('ur', undefined)).toEqual({ shape: 'rectangle' });
    expect(resolvedMapContent('ur', { shape: 'diamond' })).toEqual({ shape: 'diamond' });
    // A fresh Markdown Resource is Closed on a Map and Open with no Map.
    expect(resolvedMapContent('markdown', undefined)).toEqual({ open: false });
    expect(mapContentWithoutMap('markdown')).toEqual({ open: true });
    expect(resolvedMapContent('reference', undefined)).toBeUndefined();
    expect(mapContentWithoutMap('ur')).toEqual({ shape: 'rectangle' });
  });

  it('strokes the outline the plugin declares, and a rectangle for any other kind', () => {
    expect(resourceOutline('ur', { shape: 'ellipse' })).toBe('ellipse');
    expect(resourceOutline('ur', undefined)).toBe('rectangle');
    expect(resourceOutline('ur', { shape: 'hexagon' })).toBe('rectangle');
    expect(resourceOutline('markdown', undefined)).toBe('rectangle');
  });
});

describe('the references a plugin declares', () => {
  const linking = kindFromPlugin(
    definePlugin({
      apiVersion: 1,
      kind: 'linking',
      name: 'Linking',
      listName: 'Linkings',
      referenceName: null,
      content: z.object({ to: z.string(), space: z.string() }).strict(),
      newContent: { to: '', space: '' },
      mapContent: { schema: z.null(), default: null },
      resourceReferences: (content) => [content.to],
      contentTarget: (content) => content.to,
      spaceReferences: (content) => [content.space],
    }),
  );
  const target = '00000000-0000-4000-8000-0000000000a1';
  const space = '00000000-0000-4000-8000-0000000000b1';

  it('are the UUIDs it names', () => {
    const content = linking.contentSchema.parse({ to: target, space });
    expect(linking.resourceReferences(content)).toEqual([target]);
    expect(linking.contentTarget(content)).toBe(target);
    expect(linking.spaceReferences(content)).toEqual([space]);
  });

  it('refuse content declaring an id that is not a UUID, rather than dropping the reference', () => {
    const notResource = linking.contentSchema.safeParse({ to: 'not-a-uuid', space });
    expect(notResource.success).toBe(false);
    expect(notResource.error?.issues.map(({ message }) => message).join()).toMatch(/not-a-uuid/u);
    expect(linking.contentSchema.safeParse({ to: target, space: 'elsewhere' }).success).toBe(false);
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

describe('a plugin’s outline that fails', () => {
  const outlining = (outline: () => Outline) =>
    definePlugin({
      apiVersion: 1,
      kind: 'outlining',
      name: 'Outlining',
      listName: 'Outlinings',
      referenceName: null,
      content: z.object({}).strict(),
      newContent: {},
      mapContent: { schema: z.null(), default: null },
      outline,
    });
  const throwing = outlining(() => {
    throw new Error('The outline was told to fail.');
  });
  // A plugin outside this repository's type checker can answer any string.
  const unknown = outlining(() => z.custom<Outline>(() => true).parse('hexagon'));

  it('is stroked as a rectangle, so projecting the canvas never throws', () => {
    expect(kindFromPlugin(throwing).mapContent.outline(null)).toBe('rectangle');
    expect(kindFromPlugin(unknown).mapContent.outline(null)).toBe('rectangle');
  });

  it('throws where its host draws the Resource, which reports it', () => {
    expect(() => declaredOutline(throwing, null)).toThrow('The outline was told to fail.');
    expect(() => declaredOutline(unknown, null)).toThrow(/"hexagon", which is not one of/u);
  });
});
