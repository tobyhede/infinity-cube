import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { crapConfig } from '../../crap.config';
import {
  crapScore,
  functionComplexities,
  isGated,
  judgeCrap,
  scoreFunctions,
  startKey,
  type CrapConfig,
  type ScoredFunction,
} from '../../scripts/crap/score';

const complexityOf = (source: string): ReadonlyMap<string, number> =>
  new Map(functionComplexities('fixture.ts', source).map((fn) => [fn.name, fn.complexity]));

describe('crapScore', () => {
  it('is the complexity alone when every line is covered', () => {
    expect(crapScore(12, 1)).toBe(12);
  });

  it('is CC² + CC when nothing is covered', () => {
    expect(crapScore(10, 0)).toBe(110);
  });

  it('crosses 30 for a CC-10 function at about 42% coverage', () => {
    expect(crapScore(10, 0.41)).toBeGreaterThan(30);
    expect(crapScore(10, 0.43)).toBeLessThan(30);
  });
});

describe('functionComplexities', () => {
  it('scores a function with no decision as 1', () => {
    expect(complexityOf('function plain() { return 1; }').get('plain')).toBe(1);
  });

  it('counts each decision point ESLint’s complexity rule counts', () => {
    const source = `
      function busy(a: number[], b?: { c?: number }, d = 1) {
        if (a.length > 0) {}
        for (const x of a) {}
        for (let i = 0; i < 1; i++) {}
        for (const k in b) {}
        while (false) {}
        do {} while (false);
        switch (d) { case 1: break; case 2: break; default: break; }
        try {} catch {}
        const e = a.length > 1 ? 1 : 2;
        const f = (a[0] && a[1]) || (a[2] ?? 0);
        let g = 0; g ||= 1; g &&= 2; g ??= 3;
        return b?.c ?? e + f;
      }`;
    // 1 + if + for-of + for + for-in + while + do + 2 cases + catch + ternary
    // + && + || + ?? + ||= + &&= + ??= + default parameter + ?. + ??
    expect(complexityOf(source).get('busy')).toBe(20);
  });

  it('gives a nested function its own decisions, not its parent’s', () => {
    const source = `
      const outer = (xs: number[]) => {
        if (xs.length === 0) return [];
        return xs.map((x) => (x > 0 ? x : -x));
      };`;
    const found = complexityOf(source);
    expect(found.get('outer')).toBe(2);
    expect(found.get('<map callback>')).toBe(2);
  });

  it('names methods by their class and callbacks by what holds them', () => {
    const source = `
      class Store { get(k: string) { return k; } constructor() {} }
      const handlers = { onClick() { return 1; }, onKey: () => 2 };
      const onDrop = useCallback(() => 3, []);
      export default function () { return 4; }`;
    expect([...complexityOf(source).keys()]).toEqual([
      'Store.get',
      'Store.constructor',
      'handlers.onClick',
      'handlers.onKey',
      'onDrop',
      '<anonymous>',
    ]);
  });

  it('skips an overload signature, which has no body', () => {
    const source = `
      function pick(a: string): string;
      function pick(a: number): number;
      function pick(a: string | number) { return a; }`;
    expect(functionComplexities('fixture.ts', source)).toHaveLength(1);
  });
});

describe('scoreFunctions', () => {
  const source = [
    'const outer = (xs: number[]) => {', // 1
    '  if (xs.length === 0) return 0;', // 2
    '  return xs.map((x) => {', // 3
    '    return x > 0 ? x : -x;', // 4
    '  });', // 5
    '};', // 6
  ].join('\n');
  const functions = functionComplexities('f.ts', source);

  const allRun = new Map([1, 2, 3, 4, 5, 6].map((line) => [line, 1]));
  const noCalls = new Map<string, number>();

  it('gives a callback its own lines, and the line that passes it to its caller', () => {
    // The outer ran and passed the callback on line 3; the callback never ran.
    const hits = new Map([
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 0],
      [5, 0],
      [6, 1],
    ]);
    const [outer, callback] = scoreFunctions('f.ts', functions, hits, noCalls);
    // outer owns lines 1, 2, 3 and 6; the callback owns 4 and 5.
    expect(outer?.coverage).toBe(1);
    expect(callback?.coverage).toBe(0);
    expect(callback?.crap).toBe(crapScore(2, 0));
  });

  it('scores a function Istanbul counted no calls of as uncovered, whatever its lines say', () => {
    const callback = functions[1];
    if (callback === undefined) throw new Error('the fixture declares a callback');
    const calls = new Map([[startKey(callback.startLine, callback.startColumn), 0]]);
    const [, scored] = scoreFunctions('f.ts', functions, allRun, calls);
    expect(scored?.coverage).toBe(0);
  });

  it('scores a one-line callback by its call count, having no line of its own', () => {
    const oneLine = functionComplexities('g.ts', 'const f = (xs: number[]) => xs.map((x) => -x);');
    const callback = oneLine[1];
    if (callback === undefined) throw new Error('the fixture declares a callback');
    const key = startKey(callback.startLine, callback.startColumn);
    const hits = new Map([[1, 1]]);
    expect(scoreFunctions('g.ts', oneLine, hits, new Map([[key, 3]]))[1]?.coverage).toBe(1);
    expect(scoreFunctions('g.ts', oneLine, hits, new Map([[key, 0]]))[1]?.coverage).toBe(0);
  });

  it('scores a function with no instrumented line and no call count as uncovered', () => {
    const [outer] = scoreFunctions('f.ts', functions, new Map(), noCalls);
    expect(outer?.coverage).toBe(0);
  });
});

describe('judgeCrap', () => {
  const scored = (file: string, name: string, crap: number): ScoredFunction => ({
    file,
    name,
    crap,
    complexity: 10,
    coverage: 0,
    startLine: 1,
    startColumn: 0,
    endLine: 2,
  });
  const config: CrapConfig = {
    threshold: 30,
    gated: ['packages/core/src/'],
    allow: { 'packages/core/src/a.ts:known': 'reason', 'packages/core/src/a.ts:gone': 'reason' },
  };

  it('fails a gated function over the threshold and passes one at it', () => {
    const verdict = judgeCrap(config, [
      scored('packages/core/src/a.ts', 'over', 30.1),
      scored('packages/core/src/a.ts', 'at', 30),
      scored('packages/core/src/a.ts', 'known', 99),
      scored('packages/core/src/a.ts', 'gone', 3),
    ]);
    expect(verdict.failures.map((fn) => fn.name)).toEqual(['over']);
  });

  it('ignores a package the gate does not hold', () => {
    const verdict = judgeCrap(config, [scored('packages/app/src/a.ts', 'over', 200)]);
    expect(verdict.failures).toEqual([]);
  });

  it('fails an allowance that names nothing over the threshold, so the list only shrinks', () => {
    const verdict = judgeCrap(config, [scored('packages/core/src/a.ts', 'known', 99)]);
    expect(verdict.staleAllowances).toEqual(['packages/core/src/a.ts:gone']);
  });

  it('fails an allowance whose key names two functions, which would let both past', () => {
    const verdict = judgeCrap(config, [
      scored('packages/core/src/a.ts', 'known', 99),
      scored('packages/core/src/a.ts', 'known', 5),
    ]);
    expect(verdict.ambiguousAllowances).toEqual(['packages/core/src/a.ts:known']);
  });
});

describe('crap.config.ts', () => {
  it('allows only functions in packages the gate holds', () => {
    for (const key of Object.keys(crapConfig.allow))
      expect(isGated(crapConfig, key), key).toBe(true);
  });

  it('gates exactly the packages whose coverage vitest.config.ts gates', () => {
    const thresholdKeys = [
      ...readFileSync('vitest.config.ts', 'utf8').matchAll(/'(packages\/[\w-]+\/src\/)\*\*':/g),
    ].map(([, prefix]) => prefix);
    expect(thresholdKeys).not.toEqual([]);
    expect([...crapConfig.gated].sort()).toEqual(thresholdKeys.sort());
  });

  it('holds the threshold .cargo-crap.toml holds, so the two gates agree', () => {
    const rust = /^threshold = (\d+)$/m.exec(readFileSync('.cargo-crap.toml', 'utf8'))?.[1];
    expect(Number(rust)).toBe(crapConfig.threshold);
  });
});
