/**
 * The CRAP (Change Risk Anti-Patterns) metric for this repository's TypeScript.
 *
 *     CRAP = CC² × (1 − coverage)³ + CC
 *
 * CC is a function's cyclomatic complexity and coverage the fraction of its
 * lines a test reached. A simple or fully covered function scores about its
 * complexity; a complex, untested one scores into the hundreds. `cargo crap`
 * scores the Rust crates by the same formula.
 *
 * Everything here is pure: complexity from source text, coverage from the hit
 * counts Vitest records per line and per function, and a verdict from both. `scripts/crap.ts` is
 * the shell that reads the files and prints.
 */
import ts from 'typescript';

/** One function found in a source file, before coverage is applied. */
export interface FunctionComplexity {
  /** `Class.method`, the declared or assigned name, or `<anonymous>`. */
  readonly name: string;
  /** 1-based line the function starts on. */
  readonly startLine: number;
  /** 0-based column it starts at, as Istanbul's `fnMap` records it. */
  readonly startColumn: number;
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

export interface CrapVerdict {
  /** Every function in a gated package. */
  readonly gated: readonly ScoredFunction[];
  /** Gated functions over the threshold and not allowed. */
  readonly failures: readonly ScoredFunction[];
  /** Gated functions over the threshold that the allow-list names. */
  readonly allowed: readonly ScoredFunction[];
  /** Allow-list entries that no longer name a function over the threshold. */
  readonly staleAllowances: readonly string[];
  /** Allow-list entries whose key names more than one gated function. */
  readonly ambiguousAllowances: readonly string[];
}

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
 * Whether `node` is the target of a destructuring assignment, or an element
 * nested in one: `[a, b]` in `[a, b] = pair`, or in `for ([a, b] of pairs)`.
 */
const isAssignmentTarget = (node: ts.Node): boolean => {
  const parent = node.parent;
  if (ts.isBinaryExpression(parent))
    return parent.left === node && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken;
  if (ts.isForOfStatement(parent) || ts.isForInStatement(parent))
    return parent.initializer === node;
  if (ts.isArrayLiteralExpression(parent) || ts.isSpreadElement(parent))
    return isAssignmentTarget(parent);
  if (ts.isPropertyAssignment(parent) || ts.isSpreadAssignment(parent))
    return isAssignmentTarget(parent.parent);
  return false;
};

/**
 * `a = 1` in `[a = 1] = xs` or `({ k: a = 1 } = o)`: a default in a
 * destructuring assignment, where the parser writes an assignment expression
 * rather than an initializer. A plain assignment is not a default.
 */
const isDefaultInAssignmentTarget = (node: ts.Node): boolean => {
  if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.EqualsToken)
    return false;
  const parent = node.parent;
  if (ts.isArrayLiteralExpression(parent)) return isAssignmentTarget(parent);
  return ts.isPropertyAssignment(parent) && isAssignmentTarget(parent.parent);
};

/**
 * Whether a node adds a path through the function that holds it: the decision
 * points ESLint's `complexity` rule counts. Only the node itself is judged;
 * its children are visited separately.
 */
const isDecisionPoint = (node: ts.Node): boolean => {
  if (BRANCHING_KINDS.has(node.kind)) return true;
  // A default value is a branch: the caller passed one or did not.
  if (ts.isParameter(node) || ts.isBindingElement(node)) return node.initializer !== undefined;
  if (ts.isShorthandPropertyAssignment(node)) return node.objectAssignmentInitializer !== undefined;
  if (isDefaultInAssignmentTarget(node)) return true;
  if (ts.isBinaryExpression(node)) return LOGICAL_OPERATORS.has(node.operatorToken.kind);
  // `a?.b`, `a?.[k]` and `f?.()`: each `?.` short-circuits or does not.
  return (
    (ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node) ||
      ts.isCallExpression(node)) &&
    node.questionDotToken !== undefined
  );
};

const isFunctionLike = (node: ts.Node): node is ts.FunctionLikeDeclaration =>
  ts.isFunctionDeclaration(node) ||
  ts.isFunctionExpression(node) ||
  ts.isArrowFunction(node) ||
  ts.isMethodDeclaration(node) ||
  ts.isConstructorDeclaration(node) ||
  ts.isGetAccessorDeclaration(node) ||
  ts.isSetAccessorDeclaration(node);

const childrenOf = (node: ts.Node): readonly ts.Node[] => {
  const children: ts.Node[] = [];
  ts.forEachChild(node, (child) => {
    children.push(child);
  });
  return children;
};

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

/** `Owner.name` when `holder` sits in a class or a named object literal, else `name`. */
const qualified = (own: string, holder: ts.Node, source: ts.SourceFile): string => {
  const owner = ownerName(holder, source);
  return owner === null ? own : `${owner}.${own}`;
};

/** The name a report shows for a function, from its declaration or what it is assigned to. */
const functionName = (node: ts.FunctionLikeDeclaration, source: ts.SourceFile): string => {
  if (ts.isConstructorDeclaration(node))
    return `${ownerName(node, source) ?? '<class>'}.constructor`;
  if (node.name !== undefined && !ts.isFunctionExpression(node))
    return qualified(nameText(node.name, source), node, source);
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) || ts.isPropertyDeclaration(parent))
    return nameText(parent.name, source);
  if (ts.isPropertyAssignment(parent))
    return qualified(nameText(parent.name, source), parent, source);
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
 * is its own entry, and its decision points count toward it alone. A class
 * static block and a field initializer are entries of their own too, as
 * ESLint scores them: each runs apart from the code around it.
 */
export const functionComplexities = (
  fileName: string,
  sourceText: string,
): readonly FunctionComplexity[] => {
  const source = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  const found: FunctionComplexity[] = [];
  const lineOf = (position: number): number =>
    source.getLineAndCharacterOfPosition(position).line + 1;

  // Counts the decision points under `roots`, recording each function, static
  // block and field initializer among them as an entry of its own rather than
  // counting into it.
  const countWithin = (roots: readonly ts.Node[]): number => {
    let count = 1;
    const visit = (node: ts.Node): void => {
      if (isFunctionLike(node)) {
        // An overload signature or abstract member declares no body to run.
        if (node.body !== undefined) record(functionName(node, source), node, childrenOf(node));
        return;
      }
      if (ts.isClassStaticBlockDeclaration(node)) {
        record(qualified('<static block>', node, source), node, [node.body]);
        return;
      }
      // A field holding a function is that function, named for the field.
      if (
        ts.isPropertyDeclaration(node) &&
        node.initializer !== undefined &&
        !isFunctionLike(node.initializer)
      ) {
        const name = qualified(`<${nameText(node.name, source)} initializer>`, node, source);
        record(name, node.initializer, [node.initializer]);
        // A computed name runs when the class is defined, in the code around it.
        if (ts.isComputedPropertyName(node.name)) visit(node.name);
        return;
      }
      if (isDecisionPoint(node)) count += 1;
      ts.forEachChild(node, visit);
    };
    roots.forEach(visit);
    return count;
  };

  const record = (name: string, node: ts.Node, roots: readonly ts.Node[]): void => {
    const start = source.getLineAndCharacterOfPosition(node.getStart(source));
    found.push({
      name,
      startLine: start.line + 1,
      startColumn: start.character,
      endLine: lineOf(node.getEnd()),
      complexity: countWithin(roots),
    });
  };

  countWithin(childrenOf(source));
  return found.sort((a, b) => a.startLine - b.startLine);
};

/** The key Istanbul's call counts are looked up by: where a function starts. */
export const startKey = (line: number, column: number): string => `${line}:${column}`;

/**
 * Which function a line's hit count belongs to: the innermost one that spans
 * it and started on an earlier line. The line a function starts on holds the
 * statement that declares or passes it, which runs whether or not the function
 * is ever called, so it belongs to the enclosing function. A line no function
 * started before goes to the outermost function starting on it.
 */
const ownerOfLine = (functions: readonly FunctionComplexity[], line: number): number => {
  const span = (fn: FunctionComplexity): number => fn.endLine - fn.startLine;
  let inner = -1;
  let outerStartingHere = -1;
  functions.forEach((fn, index) => {
    if (line < fn.startLine || line > fn.endLine) return;
    if (fn.startLine < line) {
      const current = functions[inner];
      if (current === undefined || span(fn) <= span(current)) inner = index;
    } else {
      const current = functions[outerStartingHere];
      if (current === undefined || span(fn) > span(current)) outerStartingHere = index;
    }
  });
  return inner >= 0 ? inner : outerStartingHere;
};

/**
 * The coverage of each function: the fraction of the instrumented lines it
 * owns (`ownerOfLine`) that a test reached. Istanbul's call count overrides
 * that where it has one for the function: never called is 0% covered, and a
 * function with no line of its own is 100% if it was called. Otherwise a
 * function with no line of its own takes its first line's hit, and with no
 * hit recorded either scores as uncovered: code the coverage run never saw is
 * risk too.
 */
export const scoreFunctions = (
  file: string,
  functions: readonly FunctionComplexity[],
  lineHits: ReadonlyMap<number, number>,
  callCounts: ReadonlyMap<string, number>,
): readonly ScoredFunction[] => {
  const lines = functions.map(() => 0);
  const hit = functions.map(() => 0);
  for (const [line, hits] of lineHits) {
    const owner = ownerOfLine(functions, line);
    if (owner < 0) continue;
    lines[owner] = (lines[owner] ?? 0) + 1;
    if (hits > 0) hit[owner] = (hit[owner] ?? 0) + 1;
  }
  return functions.map((fn, index) => {
    const owned = lines[index] ?? 0;
    const calls = callCounts.get(startKey(fn.startLine, fn.startColumn));
    const firstLineHit = (lineHits.get(fn.startLine) ?? 0) > 0;
    const coverage =
      calls === 0
        ? 0
        : owned > 0
          ? (hit[index] ?? 0) / owned
          : calls !== undefined || firstLineHit
            ? 1
            : 0;
    return { ...fn, file, coverage, crap: crapScore(fn.complexity, coverage) };
  });
};

/** Whether the gate holds a file, by the prefixes `crap.config.ts` names. */
export const isGated = (config: CrapConfig, file: string): boolean =>
  config.gated.some((prefix) => file.startsWith(prefix));

/**
 * The gate's verdict: each gated function over the threshold that the
 * allow-list does not name; each allow-list entry that names nothing over it
 * any more, which fails too, so the list only shrinks; and each entry whose
 * key names more than one function, which fails because it would let every
 * function of that name past.
 */
export const judgeCrap = (config: CrapConfig, scored: readonly ScoredFunction[]): CrapVerdict => {
  const gated = scored.filter((fn) => isGated(config, fn.file));
  const over = gated.filter((fn) => fn.crap > config.threshold);
  const isAllowed = (fn: ScoredFunction): boolean => Object.hasOwn(config.allow, functionKey(fn));
  const overKeys = new Set(over.map(functionKey));
  const gatedKeyCounts = new Map<string, number>();
  for (const fn of gated)
    gatedKeyCounts.set(functionKey(fn), (gatedKeyCounts.get(functionKey(fn)) ?? 0) + 1);
  return {
    gated,
    failures: over.filter((fn) => !isAllowed(fn)),
    allowed: over.filter(isAllowed),
    staleAllowances: Object.keys(config.allow).filter((key) => !overKeys.has(key)),
    ambiguousAllowances: Object.keys(config.allow).filter(
      (key) => (gatedKeyCounts.get(key) ?? 0) > 1,
    ),
  };
};
