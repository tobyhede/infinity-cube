/**
 * The CRAP (Change Risk Anti-Patterns) metric for this repository's TypeScript.
 *
 *     CRAP = CC² × (1 − coverage)³ + CC
 *
 * CC is a function's cyclomatic complexity and coverage the fraction of its
 * lines a test reached. A simple or fully covered function scores about its
 * complexity; a complex, untested one scores into the hundreds. The Rust crates
 * are scored by `cargo crap` against `.cargo-crap.toml`; this is the same
 * formula and threshold over Vitest's coverage, because no maintained tool
 * scores TypeScript from it.
 *
 * Everything here is pure: complexity from source text, coverage from the hit
 * counts Vitest records per line, and a verdict from both. `scripts/crap.ts` is
 * the shell that reads the files and prints.
 */
import ts from 'typescript';

/** One function found in a source file, before coverage is applied. */
export interface FunctionComplexity {
  /** `Class.method`, the declared or assigned name, or `<anonymous>`. */
  readonly name: string;
  /** 1-based line the function starts on. */
  readonly startLine: number;
  /** 1-based line the function ends on. */
  readonly endLine: number;
  /** McCabe cyclomatic complexity, counted as ESLint's `complexity` rule counts it. */
  readonly complexity: number;
}

/** One function with its coverage and score. */
export interface ScoredFunction extends FunctionComplexity {
  /** Repository-relative path of the file that declares it. */
  readonly file: string;
  /** Fraction of its lines a test reached, from 0 to 1. */
  readonly coverage: number;
  readonly crap: number;
}

/** What `crap.config.ts` declares. */
export interface CrapConfig {
  /** Score above which a function fails the gate. */
  readonly threshold: number;
  /** Repository-relative path prefixes whose functions the gate holds. */
  readonly gated: readonly string[];
  /** `<file>:<name>` of each function let past the gate, with why. */
  readonly allow: Readonly<Record<string, string>>;
}

export type CrapVerdict = {
  /** Gated functions over the threshold and not allowed. */
  readonly failures: readonly ScoredFunction[];
  /** Allow-list entries that no longer name a function over the threshold. */
  readonly staleAllowances: readonly string[];
};

/** The score: CC² × (1 − coverage)³ + CC. */
export const crapScore = (complexity: number, coverage: number): number =>
  complexity ** 2 * (1 - coverage) ** 3 + complexity;

/** The key an allow-list entry names a function by. */
export const functionKey = (scored: ScoredFunction): string => `${scored.file}:${scored.name}`;

const LOGICAL_OPERATORS = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
]);

/** Statements and clauses that are a decision wherever they appear. */
const BRANCHING_KINDS = new Set([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ConditionalExpression,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.CaseClause,
  ts.SyntaxKind.CatchClause,
]);

/**
 * Whether a node adds a path through the function that holds it: the decision
 * points ESLint's `complexity` rule counts. Only the node itself is judged;
 * its children are visited separately.
 */
const isDecisionPoint = (node: ts.Node): boolean => {
  if (BRANCHING_KINDS.has(node.kind)) return true;
  if (ts.isBinaryExpression(node)) return LOGICAL_OPERATORS.has(node.operatorToken.kind);
  // A default value is a branch: the caller passed one or did not.
  if (ts.isParameter(node) || ts.isBindingElement(node)) return node.initializer !== undefined;
  // `a?.b` and `f?.()`: each `?.` short-circuits or does not.
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
    return node.questionDotToken !== undefined;
  if (ts.isCallExpression(node)) return node.questionDotToken !== undefined;
  return false;
};

const isFunctionLike = (node: ts.Node): node is ts.FunctionLikeDeclaration =>
  ts.isFunctionDeclaration(node) ||
  ts.isFunctionExpression(node) ||
  ts.isArrowFunction(node) ||
  ts.isMethodDeclaration(node) ||
  ts.isConstructorDeclaration(node) ||
  ts.isGetAccessorDeclaration(node) ||
  ts.isSetAccessorDeclaration(node);

const nameText = (name: ts.PropertyName | ts.BindingName, source: ts.SourceFile): string =>
  ts.isIdentifier(name) || ts.isPrivateIdentifier(name) || ts.isStringLiteral(name)
    ? name.text
    : name.getText(source);

const ownerName = (node: ts.Node, source: ts.SourceFile): string | null => {
  const parent = node.parent;
  if (ts.isClassLike(parent) && parent.name !== undefined) return parent.name.text;
  if (ts.isObjectLiteralExpression(parent)) {
    const holder = parent.parent;
    if (ts.isVariableDeclaration(holder) || ts.isPropertyAssignment(holder))
      return nameText(holder.name, source);
  }
  return null;
};

/** The name a report shows for a function, from its declaration or what it is assigned to. */
const functionName = (node: ts.FunctionLikeDeclaration, source: ts.SourceFile): string => {
  if (ts.isConstructorDeclaration(node))
    return `${ownerName(node, source) ?? '<class>'}.constructor`;
  if (node.name !== undefined && !ts.isFunctionExpression(node)) {
    const own = nameText(node.name, source);
    const owner = ownerName(node, source);
    return owner === null ? own : `${owner}.${own}`;
  }
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) || ts.isPropertyDeclaration(parent))
    return nameText(parent.name, source);
  if (ts.isPropertyAssignment(parent)) {
    const own = nameText(parent.name, source);
    const owner = ownerName(parent, source);
    return owner === null ? own : `${owner}.${own}`;
  }
  if (node.name !== undefined) return nameText(node.name, source);
  // `const onDrop = useCallback(() => …)`: the callback takes the name it is held by.
  if (ts.isCallExpression(parent) && ts.isVariableDeclaration(parent.parent))
    return nameText(parent.parent.name, source);
  // `items.map((item) => …)`: named for what it is handed to.
  if (ts.isCallExpression(parent)) {
    const callee = parent.expression;
    const called = ts.isPropertyAccessExpression(callee)
      ? callee.name.text
      : callee.getText(source);
    return `<${called} callback>`;
  }
  return '<anonymous>';
};

/**
 * Every function in a source file with its own complexity. A nested function
 * is its own entry, and its decision points count toward it alone.
 */
export const functionComplexities = (
  fileName: string,
  sourceText: string,
): readonly FunctionComplexity[] => {
  const source = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  const found: FunctionComplexity[] = [];
  const lineOf = (position: number): number =>
    source.getLineAndCharacterOfPosition(position).line + 1;

  const countWithin = (root: ts.FunctionLikeDeclaration): number => {
    let count = 1;
    const visit = (node: ts.Node): void => {
      if (node !== root && isFunctionLike(node)) {
        record(node);
        return;
      }
      if (node !== root && isDecisionPoint(node)) count += 1;
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(root, visit);
    return count;
  };

  const record = (node: ts.FunctionLikeDeclaration): void => {
    // An overload signature or abstract member declares no body to run.
    if (node.body === undefined) return;
    found.push({
      name: functionName(node, source),
      startLine: lineOf(node.getStart(source)),
      endLine: lineOf(node.getEnd()),
      complexity: countWithin(node),
    });
  };

  const visitTop = (node: ts.Node): void => {
    if (isFunctionLike(node)) {
      record(node);
      return;
    }
    ts.forEachChild(node, visitTop);
  };
  ts.forEachChild(source, visitTop);
  return found.sort((a, b) => a.startLine - b.startLine);
};

/**
 * The coverage of each function, from the hit count of each line Vitest
 * instrumented. A line belongs to the innermost function that spans it, so a
 * nested callback's lines count toward the callback and not the function that
 * declares it. A function with no instrumented line of its own scores as
 * uncovered: code the coverage run never saw is risk too.
 */
export const scoreFunctions = (
  file: string,
  functions: readonly FunctionComplexity[],
  lineHits: ReadonlyMap<number, number>,
): readonly ScoredFunction[] => {
  const owned = new Map<FunctionComplexity, { lines: number; hit: number }>();
  for (const fn of functions) owned.set(fn, { lines: 0, hit: 0 });
  for (const [line, hits] of lineHits) {
    let innermost: FunctionComplexity | null = null;
    for (const fn of functions) {
      if (line < fn.startLine || line > fn.endLine) continue;
      if (
        innermost === null ||
        fn.endLine - fn.startLine <= innermost.endLine - innermost.startLine
      )
        innermost = fn;
    }
    if (innermost === null) continue;
    const tally = owned.get(innermost);
    if (tally === undefined) continue;
    tally.lines += 1;
    if (hits > 0) tally.hit += 1;
  }
  return functions.map((fn) => {
    const tally = owned.get(fn);
    const coverage = tally === undefined || tally.lines === 0 ? 0 : tally.hit / tally.lines;
    return { ...fn, file, coverage, crap: crapScore(fn.complexity, coverage) };
  });
};

/** Whether the gate holds a file, by the prefixes `crap.config.ts` names. */
export const isGated = (config: CrapConfig, file: string): boolean =>
  config.gated.some((prefix) => file.startsWith(prefix));

/**
 * The gate's verdict: each gated function over the threshold that the
 * allow-list does not name, and each allow-list entry that names nothing over
 * it any more, which fails too, so the list only shrinks.
 */
export const judgeCrap = (config: CrapConfig, scored: readonly ScoredFunction[]): CrapVerdict => {
  const over = scored.filter((fn) => isGated(config, fn.file) && fn.crap > config.threshold);
  const overKeys = new Set(over.map(functionKey));
  return {
    failures: over.filter((fn) => !Object.hasOwn(config.allow, functionKey(fn))),
    staleAllowances: Object.keys(config.allow).filter((key) => !overKeys.has(key)),
  };
};
