import { describe, expect, it } from 'vitest';
import { canonicalJsonObject, canonicalJsonValue, sameJsonValue } from '@project/core';

describe('the canonical form of a JSON value nothing reads', () => {
  it('sorts every object’s keys at every depth and keeps array order', () => {
    const value = { zeta: [{ b: 1, a: [3, { y: null, x: true }] }, 'last'], alpha: 'first' };

    const canonical = canonicalJsonValue(value);

    expect(JSON.stringify(canonical)).toBe(
      '{"alpha":"first","zeta":[{"a":[3,{"x":true,"y":null}],"b":1},"last"]}',
    );
    expect(sameJsonValue(canonical, value)).toBe(true);
  });

  it('answers one text whatever key order it is given', () => {
    const written = { source: 's', legend: 'l', options: { nodes: [1], direction: 'TD' } };
    const reordered = { options: { direction: 'TD', nodes: [1] }, legend: 'l', source: 's' };

    expect(JSON.stringify(canonicalJsonObject(reordered))).toBe(
      JSON.stringify(canonicalJsonObject(written)),
    );
  });

  it('orders keys by code unit, not by locale or length', () => {
    expect(Object.keys(canonicalJsonObject({ b: 1, B: 2, aa: 3, a: 4 }))).toEqual([
      'B',
      'a',
      'aa',
      'b',
    ]);
  });

  it('leaves a scalar as it is', () => {
    for (const scalar of ['text', 3, false, null]) {
      expect(canonicalJsonValue(scalar)).toBe(scalar);
    }
  });
});
