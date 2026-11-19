import { describe, expect, it } from 'vitest';
import { parseJsonText } from '../src/json-text';

/** `\u` followed by `hex`, as JSON text spells an escape. */
const escape = (hex: string): string => `\\u${hex}`;

describe('parseJsonText (ADR 0160)', () => {
  it('parses JSON text as JSON.parse does', () => {
    expect(parseJsonText('{"a":[1,"b",null,true],"c":{"d":2}}')).toEqual({
      a: [1, 'b', null, true],
      c: { d: 2 },
    });
  });

  it('accepts an escaped surrogate pair, and the character it spells written out', () => {
    expect(parseJsonText(`"${escape('d83d')}${escape('de00')}"`)).toBe('\u{1F600}');
    expect(parseJsonText('{"\u{1F600}":"\u{1F600}"}')).toEqual({ '\u{1F600}': '\u{1F600}' });
  });

  it('refuses text that is not JSON, as JSON.parse does', () => {
    expect(() => parseJsonText('{')).toThrow(SyntaxError);
  });

  it.each([
    ['a lone high surrogate', `"a${escape('d800')}b"`],
    ['a lone high surrogate at the end', `"a${escape('dbff')}"`],
    ['a lone low surrogate', `"${escape('dc00')}b"`],
    ['a pair written low then high', `"${escape('dc00')}${escape('d800')}"`],
  ])('refuses %s as the root value', (_name, text) => {
    expect(() => parseJsonText(text)).toThrow(SyntaxError);
  });

  it('refuses a lone surrogate in a value nested in arrays and objects', () => {
    expect(() => parseJsonText(`{"a":[{"b":["ok","${escape('d800')}"]}]}`)).toThrow(SyntaxError);
  });

  it('refuses a lone surrogate in a key, at the root object and nested', () => {
    expect(() => parseJsonText(`{"${escape('d800')}":1}`)).toThrow(SyntaxError);
    expect(() => parseJsonText(`{"a":{"b":{"${escape('dc00')}":1}}}`)).toThrow(SyntaxError);
  });

  it('refuses a lone surrogate in a key whose value is itself an object', () => {
    expect(() => parseJsonText(`{"${escape('d800')}":{"a":1}}`)).toThrow(SyntaxError);
  });

  it('reads an escaped backslash before "ud800" as text, not as an escape', () => {
    expect(parseJsonText(String.raw`"\\ud800"`)).toBe(String.raw`\ud800`);
  });
});
