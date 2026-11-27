import { readFileSync, readdirSync, statSync } from 'node:fs';
import ts from 'typescript';

/*
 * What a test holding Rust ports to TypeScript cases reads: each case a
 * TypeScript file declares, by name, and the `// Case: <name>` lines in Rust
 * files. A case's name is the first argument of its `it` or `test` call, of a
 * member such as `it.skip(…)` or `it.concurrent(…)`, or of the call a curried
 * member answers, such as `it.each(…)(…)` or `it.skipIf(…)(…)`, as written: a template literal's substitutions are
 * each written `*`, and an `it.each` name keeps its `%s`. A hook such as
 * `test.afterEach(…)`, or Playwright's `test.describe(…)`, declares no case.
 */

/** The text of `file`, a path from the repository root. */
export const readRepositoryFile = (file: string): string =>
  readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

const isIt = (expression: ts.Expression): boolean =>
  ts.isIdentifier(expression) && (expression.text === 'it' || expression.text === 'test');

/** The `it` members that take a table or a condition and answer the call that names the case. */
const CURRIED = new Set(['each', 'for', 'skipIf', 'runIf']);

/** The name a case is written with, or `undefined` for an argument that is not text. */
const caseName = (argument: ts.Expression | undefined): string | undefined => {
  if (argument === undefined) return undefined;
  if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) {
    return argument.text;
  }
  if (ts.isTemplateExpression(argument)) {
    return (
      argument.head.text + argument.templateSpans.map((span) => `*${span.literal.text}`).join('')
    );
  }
  return undefined;
};

/** The `it` and `test` members that declare no case: hooks, and Playwright's `test.describe`. */
const NOT_CASES = new Set([
  'beforeAll',
  'beforeEach',
  'afterAll',
  'afterEach',
  'describe',
  'use',
  'extend',
  'step',
]);

/** Whether `call` declares a case. */
const declaresCase = (call: ts.CallExpression): boolean => {
  const callee = call.expression;
  return (
    isIt(callee) ||
    (ts.isPropertyAccessExpression(callee) &&
      isIt(callee.expression) &&
      !CURRIED.has(callee.name.text) &&
      !NOT_CASES.has(callee.name.text)) ||
    (ts.isCallExpression(callee) &&
      ts.isPropertyAccessExpression(callee.expression) &&
      isIt(callee.expression.expression))
  );
};

const isDescribe = (expression: ts.Expression): boolean =>
  (ts.isIdentifier(expression) && expression.text === 'describe') ||
  (ts.isPropertyAccessExpression(expression) &&
    expression.name.text === 'describe' &&
    isIt(expression.expression));

/**
 * Whether `call` opens a describe block, and whether that block runs once per
 * value of a table (`describe.each(…)(…)`, `describe.for(…)(…)`).
 */
const describeOf = (call: ts.CallExpression): { readonly each: boolean } | undefined => {
  const callee = call.expression;
  if (isDescribe(callee)) return { each: false };
  if (ts.isPropertyAccessExpression(callee) && isDescribe(callee.expression)) {
    return CURRIED.has(callee.name.text) ? undefined : { each: false };
  }
  if (
    ts.isCallExpression(callee) &&
    ts.isPropertyAccessExpression(callee.expression) &&
    isDescribe(callee.expression.expression)
  ) {
    const member = callee.expression.name.text;
    return { each: member === 'each' || member === 'for' };
  }
  return undefined;
};

/** A name that substitutes a value: `%s` and its kin, or an object member's `$name`. */
const SUBSTITUTES = /%[sdifjo]|\$\w/u;

/** A case as written, with the describe blocks around it. */
export interface DescribedCase {
  readonly name: string;
  /** The line its call starts on, counted from 1. */
  readonly line: number;
  /** The title of each describe block around it, outermost first. */
  readonly describes: readonly string[];
  /** Whether it runs once per value: its name substitutes one, or a describe block around it runs per value. */
  readonly perValue: boolean;
}

/** Every case `text`, the source of `file`, declares, in the order written. */
export const describedCasesIn = (file: string, text: string): DescribedCase[] => {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const cases: DescribedCase[] = [];
  const visit = (node: ts.Node, describes: readonly string[], each: boolean): void => {
    if (ts.isCallExpression(node)) {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      const block = describeOf(node);
      if (block !== undefined) {
        const title = caseName(node.arguments[0]) ?? `<untitled describe at ${file}:${line}>`;
        node.arguments.forEach((argument) => {
          visit(argument, [...describes, title], each || block.each);
        });
        return;
      }
      if (declaresCase(node)) {
        const name = caseName(node.arguments[0]) ?? `<unnamed case at ${file}:${line}>`;
        cases.push({ name, line, describes, perValue: each || SUBSTITUTES.test(name) });
      }
    }
    ts.forEachChild(node, (child) => {
      visit(child, describes, each);
    });
  };
  visit(source, [], false);
  return cases;
};

/** Every case `file` declares, by name, in the order written. */
export const casesOf = (file: string): string[] => {
  const source = ts.createSourceFile(file, readRepositoryFile(file), ts.ScriptTarget.Latest, true);
  const names: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && declaresCase(node)) {
      const name = caseName(node.arguments[0]);
      names.push(name ?? `<unnamed case at ${file}:${String(node.pos)}>`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return names;
};

const MARKER = /^\s*\/\/ Case: (.+)$/gmu;

/** The case names `files` mark, in the order written. */
export const markedIn = (files: readonly string[]): string[] =>
  files.flatMap((file) =>
    [...readRepositoryFile(file).matchAll(MARKER)].map((match) => match[1] ?? ''),
  );

/** Every file under `directory`, a path from the repository root, whose name `keep` admits. */
export const filesUnder = (directory: string, keep: (name: string) => boolean): string[] => {
  const root = new URL(`../../${directory}/`, import.meta.url);
  return readdirSync(root)
    .sort()
    .flatMap((name) => {
      const path = `${directory}/${name}`;
      if (statSync(new URL(name, root)).isDirectory()) return filesUnder(path, keep);
      return keep(name) ? [path] : [];
    });
};
