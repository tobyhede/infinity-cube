import { readFileSync, readdirSync, statSync } from 'node:fs';
import ts from 'typescript';

/*
 * What a test holding Rust ports to TypeScript cases reads: each case a
 * TypeScript file declares, by name, and the `// Case: <name>` lines in Rust
 * files. A case's name is the first argument of its `it`, `it.each(…)(…)` or
 * `it.skipIf(…)(…)` call, as written: a template literal's substitutions are
 * each written `*`, and an `it.each` name keeps its `%s`.
 */

/** The text of `file`, a path from the repository root. */
export const readRepositoryFile = (file: string): string =>
  readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

const isIt = (expression: ts.Expression): boolean =>
  ts.isIdentifier(expression) && expression.text === 'it';

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

/** Every case `file` declares, by name, in the order written. */
export const casesOf = (file: string): string[] => {
  const source = ts.createSourceFile(file, readRepositoryFile(file), ts.ScriptTarget.Latest, true);
  const names: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const declaresCase =
        isIt(callee) ||
        (ts.isCallExpression(callee) &&
          ts.isPropertyAccessExpression(callee.expression) &&
          isIt(callee.expression.expression));
      const name = declaresCase ? caseName(node.arguments[0]) : undefined;
      if (declaresCase) names.push(name ?? `<unnamed case at ${file}:${String(node.pos)}>`);
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
