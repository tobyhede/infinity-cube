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

/** A name that substitutes a value: `%s` and its kin, the row index `%#` or `%$`, or an object member's `$name`. */
const SUBSTITUTES = /%[sdifjo#$]|\$\w/u;

/**
 * A row of a table a case runs over: its cells written as text (a string,
 * template or number), keyed by position in an array row (a lone string is
 * position 0) and by member name in an object row. A cell written any other
 * way is absent.
 */
export type Row = Readonly<Record<string, string>>;

/** The table a case runs over, and the name that substitutes each row's values. */
export interface CaseTable {
  readonly title: string;
  /** The table's rows, or `undefined` where it is not an array written in the file. */
  readonly rows: readonly Row[] | undefined;
}

const unwrapped = (expression: ts.Expression): ts.Expression =>
  ts.isAsExpression(expression) ||
  ts.isSatisfiesExpression(expression) ||
  ts.isParenthesizedExpression(expression)
    ? unwrapped(expression.expression)
    : expression;

const cellText = (expression: ts.Expression): string | undefined => {
  const cell = unwrapped(expression);
  if (
    ts.isStringLiteral(cell) ||
    ts.isNoSubstitutionTemplateLiteral(cell) ||
    ts.isNumericLiteral(cell)
  ) {
    return cell.text;
  }
  return undefined;
};

/** Each cell of a row as written, keyed, its text `undefined` where it is not written as text. */
const writtenCells = (row: ts.Expression): (readonly [string, string | undefined])[] => {
  if (ts.isArrayLiteralExpression(row)) {
    return row.elements.map((element, index) => [String(index), cellText(element)] as const);
  }
  if (ts.isObjectLiteralExpression(row)) {
    return row.properties
      .filter(ts.isPropertyAssignment)
      .flatMap(({ name, initializer }) =>
        ts.isIdentifier(name) || ts.isStringLiteral(name)
          ? [[name.text, cellText(initializer)] as const]
          : [],
      );
  }
  return [['0', cellText(row)]];
};

const rowOf = (expression: ts.Expression) =>
  Object.fromEntries(
    writtenCells(unwrapped(expression)).flatMap(([key, text]) =>
      text === undefined ? [] : [[key, text] as const],
    ),
  );

/**
 * The rows of `table`: an array written there, or one a top-level `const` of
 * `source` declares, as itself or as the one array argument of a call
 * (`targetCases([…])`).
 */
const rowsOf = (table: ts.Expression | undefined, source: ts.SourceFile): Row[] | undefined => {
  if (table === undefined) return undefined;
  let written = unwrapped(table);
  if (ts.isIdentifier(written)) {
    const name = written.text;
    const declared = source.statements
      .filter(ts.isVariableStatement)
      .flatMap((statement) => statement.declarationList.declarations)
      .find((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === name);
    if (declared?.initializer === undefined) return undefined;
    written = unwrapped(declared.initializer);
    if (ts.isCallExpression(written) && written.arguments.length === 1) {
      const [argument] = written.arguments;
      if (argument !== undefined) written = unwrapped(argument);
    }
  }
  return ts.isArrayLiteralExpression(written) ? written.elements.map(rowOf) : undefined;
};

/** The table a curried call (`it.each(table)(…)`, `describe.for(table)(…)`) runs over, if it takes one. */
const tableArgument = (call: ts.CallExpression): ts.Expression | undefined => {
  const callee = call.expression;
  if (
    ts.isCallExpression(callee) &&
    ts.isPropertyAccessExpression(callee.expression) &&
    (callee.expression.name.text === 'each' || callee.expression.name.text === 'for')
  ) {
    return callee.arguments[0];
  }
  return undefined;
};

/**
 * The values of `row` that `title` substitutes, joined by `, `: each `%s` and
 * its kin takes the next position, each `$name` that member, and a cell not
 * written as text is `*`. The row index (`%#`, `%$`) is no value of the row.
 */
export const substitutedValue = (title: string, row: Row): string => {
  let position = 0;
  const values: string[] = [];
  for (const match of title.matchAll(/%([sdifjo#$%])|\$(\w+)/gu)) {
    const [, specifier, member] = match;
    if (member !== undefined) {
      values.push(row[member] ?? '*');
    } else if (specifier !== '#' && specifier !== '$' && specifier !== '%') {
      values.push(row[String(position)] ?? '*');
      position += 1;
    }
  }
  return values.join(', ');
};

/** A case as written, with the describe blocks around it. */
export interface DescribedCase {
  readonly name: string;
  /** The line its call starts on, counted from 1. */
  readonly line: number;
  /** The title of each describe block around it, outermost first. */
  readonly describes: readonly string[];
  /** Whether it runs once per value: its name substitutes one, or a describe block around it runs per value. */
  readonly perValue: boolean;
  /** The table it runs over: its own, or else the nearest describe block's around it. */
  readonly table?: CaseTable | undefined;
}

/**
 * Every case `text`, the source of `file`, declares, in the order written. A
 * case that runs over a table of its own (`it.each`, `test.for`) and whose
 * name substitutes no value of it is refused by throwing, naming the file,
 * line and case: it would otherwise be read as one run.
 */
export const describedCasesIn = (file: string, text: string): DescribedCase[] => {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const cases: DescribedCase[] = [];
  const visit = (
    node: ts.Node,
    describes: readonly string[],
    each: boolean,
    around: CaseTable | undefined,
  ): void => {
    if (ts.isCallExpression(node)) {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      const table = tableArgument(node);
      const block = describeOf(node);
      if (block !== undefined) {
        const title = caseName(node.arguments[0]) ?? `<untitled describe at ${file}:${line}>`;
        const inner = table === undefined ? around : { title, rows: rowsOf(table, source) };
        node.arguments.forEach((argument) => {
          visit(argument, [...describes, title], each || block.each, inner);
        });
        return;
      }
      if (declaresCase(node)) {
        const name = caseName(node.arguments[0]) ?? `<unnamed case at ${file}:${line}>`;
        if (table !== undefined && !SUBSTITUTES.test(name)) {
          throw new Error(
            `${file}:${String(line)}: '${name}' runs over a table and substitutes no value of it, so its runs cannot be named apart`,
          );
        }
        const own = table === undefined ? around : { title: name, rows: rowsOf(table, source) };
        cases.push({
          name,
          line,
          describes,
          perValue: each || SUBSTITUTES.test(name),
          table: own,
        });
      }
    }
    ts.forEachChild(node, (child) => {
      visit(child, describes, each, around);
    });
  };
  visit(source, [], false, undefined);
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

/** The comment that marks a port: `// Case: <name>`, or `// TypeScript case: <name>`. */
export type Marker = 'Case' | 'TypeScript case';

const MARKERS: Readonly<Record<Marker, RegExp>> = {
  Case: /^\s*\/\/ Case: (.+)$/gmu,
  'TypeScript case': /^\s*\/\/ TypeScript case: (.+)$/gmu,
};

/** The case names `files` mark with `marker`, in the order written. */
export const markedIn = (files: readonly string[], marker: Marker = 'Case'): string[] =>
  files.flatMap((file) =>
    [...readRepositoryFile(file).matchAll(MARKERS[marker])].map((match) => match[1] ?? ''),
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
