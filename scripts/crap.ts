/**
 * Scores the TypeScript under `packages/*\/src` on the CRAP metric from the
 * coverage `pnpm test:coverage` writes, and gates the packages
 * `crap.config.ts` names. `scripts/crap/score.ts` holds the metric; this reads
 * the files, prints and exits.
 *
 *     pnpm crap:ts                     # the gate: fails on a gated function over the threshold
 *     pnpm crap:ts --report            # every package's worst, worst first; never fails
 *     pnpm crap:ts --format github     # one `::error` annotation per problem, for CI
 *     pnpm crap:ts --summary <file>    # also append the verdict and worst functions to <file>
 *     pnpm crap:ts --coverage <file>   # read another coverage-final.json
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { crapConfig } from '../crap.config';
import { functionComplexities, judgeCrap, scoreFunctions, type ScoredFunction } from './crap/score';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** How many of the worst functions a report and the CI summary list. */
const TOP = 20;

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
    // Forward slashes on every platform, as `crap.config.ts` writes its keys.
    const file = relative(repositoryRoot, entry.path).split(sep).join('/');
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

/** One reason the gate fails, printed as a CI annotation or a line of text. */
interface Problem {
  readonly file: string;
  readonly line: number | null;
  readonly title: string;
  readonly message: string;
}

const problemsOf = (
  failures: readonly ScoredFunction[],
  staleAllowances: readonly string[],
): readonly Problem[] => [
  ...failures.map((fn) => ({
    file: fn.file,
    line: fn.startLine,
    title: `CRAP above ${crapConfig.threshold}`,
    message: `${fn.name} has CRAP score ${fn.crap.toFixed(1)} (CC=${fn.complexity}, cov=${percent(fn.coverage)})`,
  })),
  ...staleAllowances.map((key) => ({
    file: 'crap.config.ts',
    line: null,
    title: 'Stale CRAP allowance',
    message: `${key} names no function above ${crapConfig.threshold}; delete its entry`,
  })),
];

const printProblem = (problem: Problem, format: string): void => {
  const at = problem.line === null ? problem.file : `${problem.file}:${problem.line}`;
  if (format === 'github') {
    const line = problem.line === null ? '' : `,line=${problem.line}`;
    console.log(`::error file=${problem.file}${line},title=${problem.title}::${problem.message}`);
  } else console.log(`✗ ${problem.message} (${at})`);
};

const main = (): number => {
  const { values } = parseArgs({
    options: {
      coverage: { type: 'string', default: 'coverage/coverage-final.json' },
      format: { type: 'string', default: 'text' },
      report: { type: 'boolean', default: false },
      summary: { type: 'string' },
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
  const worst = scored.slice(0, TOP);
  const { threshold } = crapConfig;

  if (values.report) {
    console.log(`  CRAP   CC  Cover.  Function  Location`);
    for (const fn of worst) console.log(row(fn));
    const over = scored.filter((fn) => fn.crap > threshold).length;
    console.log(`\n${scored.length} function(s) scored; ${over} above ${threshold}.`);
    return 0;
  }

  const { gated, failures, allowed, staleAllowances } = judgeCrap(crapConfig, scored);
  const problems = problemsOf(failures, staleAllowances);
  const passed = problems.length === 0;
  for (const problem of problems) printProblem(problem, values.format);

  if (values.summary !== undefined)
    appendFileSync(
      values.summary,
      [
        `## TypeScript CRAP gate ${passed ? 'passed' : 'failed'} (threshold ${threshold})`,
        '',
        failures.length === 0 ? '' : markdownTable('Gated functions over the threshold', failures),
        markdownTable(`Worst ${TOP}, every package (only gated packages fail)`, worst),
      ].join('\n'),
    );

  if (!passed) {
    console.log(
      `\n${failures.length} gated function(s) above CRAP ${threshold}; ${staleAllowances.length} stale allowance(s). Add tests or simplify; do not add to the allow-list to pass.`,
    );
    return 1;
  }
  console.log(
    `✓ ${gated.length} gated function(s) scored; none above CRAP ${threshold} (${allowed.length} allowed).`,
  );
  return 0;
};

process.exitCode = main();
