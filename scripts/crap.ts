/**
 * Scores the TypeScript under `packages/*\/src` on the CRAP metric from the
 * coverage `pnpm test:coverage` writes, and gates the packages
 * `crap.config.ts` names. `scripts/crap/score.ts` holds the metric; this reads
 * the files, prints and exits.
 *
 *     pnpm crap:ts                     # the gate: fails on a gated function over the threshold
 *     pnpm crap:ts --report            # every package, worst first; never fails
 *     pnpm crap:ts --format github     # one `::error` annotation per failure, for CI
 *     pnpm crap:ts --summary <file>    # also append a Markdown table to <file>
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { crapConfig } from '../crap.config';
import {
  functionComplexities,
  functionKey,
  isGated,
  judgeCrap,
  scoreFunctions,
  type ScoredFunction,
} from './crap/score';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The part of Istanbul's `coverage-final.json` this reads: each file's
 * statements and their hit counts. Vitest's v8 provider records one statement
 * per source line.
 */
const coverageFileSchema = z.record(
  z.string(),
  z.object({
    path: z.string(),
    statementMap: z.record(z.string(), z.object({ start: z.object({ line: z.number() }) })),
    s: z.record(z.string(), z.number()),
  }),
);

type CoverageFile = z.infer<typeof coverageFileSchema>;

/** The hit count of each instrumented line, the highest where a line holds several statements. */
const lineHitsOf = (entry: CoverageFile[string]): ReadonlyMap<number, number> => {
  const hits = new Map<number, number>();
  for (const [id, location] of Object.entries(entry.statementMap)) {
    const line = location.start.line;
    hits.set(line, Math.max(hits.get(line) ?? 0, entry.s[id] ?? 0));
  }
  return hits;
};

const scoreAll = (coverage: CoverageFile): readonly ScoredFunction[] =>
  Object.values(coverage).flatMap((entry) => {
    const file = relative(repositoryRoot, entry.path);
    const functions = functionComplexities(file, readFileSync(entry.path, 'utf8'));
    return scoreFunctions(file, functions, lineHitsOf(entry));
  });

const percent = (fraction: number): string => `${(fraction * 100).toFixed(1)}%`;

const row = (fn: ScoredFunction): string =>
  `${fn.crap.toFixed(1).padStart(7)}  ${String(fn.complexity).padStart(3)}  ${percent(fn.coverage).padStart(6)}  ${fn.name}  ${fn.file}:${fn.startLine}`;

const markdownTable = (title: string, functions: readonly ScoredFunction[]): string =>
  [
    `### ${title}`,
    '',
    '| CRAP | CC | Coverage | Function | Location |',
    '| ---: | ---: | ---: | --- | --- |',
    ...functions.map(
      (fn) =>
        `| ${fn.crap.toFixed(1)} | ${fn.complexity} | ${percent(fn.coverage)} | \`${fn.name}\` | \`${fn.file}:${fn.startLine}\` |`,
    ),
    '',
  ].join('\n');

const main = (): number => {
  const { values } = parseArgs({
    options: {
      coverage: { type: 'string', default: 'coverage/coverage-final.json' },
      format: { type: 'string', default: 'text' },
      report: { type: 'boolean', default: false },
      summary: { type: 'string' },
      top: { type: 'string', default: '20' },
    },
  });
  const coveragePath = resolve(process.cwd(), values.coverage);
  let coverageText: string;
  try {
    coverageText = readFileSync(coveragePath, 'utf8');
  } catch (error) {
    console.error(`crap: cannot read ${coveragePath}; run \`pnpm test:coverage\` first.`);
    console.error(error);
    return 2;
  }
  const scored = [...scoreAll(coverageFileSchema.parse(JSON.parse(coverageText)))].sort(
    (a, b) => b.crap - a.crap,
  );
  const top = Number.parseInt(values.top, 10);
  const { threshold } = crapConfig;

  if (values.report) {
    console.log(`  CRAP   CC  Cover.  Function  Location`);
    for (const fn of scored.slice(0, top)) console.log(row(fn));
    const over = scored.filter((fn) => fn.crap > threshold).length;
    console.log(`\n${scored.length} function(s) scored; ${over} above ${threshold}.`);
    if (values.summary !== undefined)
      appendFileSync(
        values.summary,
        markdownTable(`TypeScript CRAP: worst ${top}`, scored.slice(0, top)),
      );
    return 0;
  }

  const gated = scored.filter((fn) => isGated(crapConfig, fn.file));
  const { failures, staleAllowances } = judgeCrap(crapConfig, scored);

  if (values.format === 'github') {
    for (const fn of failures)
      console.log(
        `::error file=${fn.file},line=${fn.startLine},title=CRAP (${fn.crap.toFixed(1)} > ${threshold})::${fn.name} has CRAP score ${fn.crap.toFixed(1)} (CC=${fn.complexity}, cov=${percent(fn.coverage)})`,
      );
    for (const key of staleAllowances)
      console.log(
        `::error file=crap.config.ts,title=Stale CRAP allowance::${key} names no function above ${threshold}; delete its entry`,
      );
  } else {
    for (const fn of failures) console.log(`✗ ${row(fn)}`);
    for (const key of staleAllowances)
      console.log(
        `✗ ${key} names no function above ${threshold}; delete its entry in crap.config.ts`,
      );
  }

  if (values.summary !== undefined) {
    const worst = gated.slice(0, top);
    appendFileSync(
      values.summary,
      markdownTable(
        failures.length === 0 && staleAllowances.length === 0
          ? `TypeScript CRAP gate passed (threshold ${threshold})`
          : `TypeScript CRAP gate failed (threshold ${threshold})`,
        worst,
      ),
    );
  }

  if (failures.length > 0 || staleAllowances.length > 0) {
    console.log(
      `\n${failures.length} gated function(s) above CRAP ${threshold}; ${staleAllowances.length} stale allowance(s). Add tests or simplify; do not add to the allow-list to pass.`,
    );
    return 1;
  }
  const allowed = gated.filter((fn) => Object.hasOwn(crapConfig.allow, functionKey(fn))).length;
  console.log(
    `✓ ${gated.length} gated function(s) scored; none above CRAP ${threshold} (${allowed} allowed).`,
  );
  return 0;
};

process.exitCode = main();
