import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/*
 * The HTTP conformance cases are written once, in TypeScript, and ported by
 * hand to Rust for two adapters: the Rust host's application and run
 * (`crates/host/tests/`) and the desktop scheme handler
 * (`packages/desktop/src-tauri/src/scheme/tests.rs`). A case both adapters run
 * is written once, in the table `crates/http-conformance/src/cases.rs`, which
 * each adapter runs by invoking `http_conformance::cases!`; a case only one
 * runs stays in that adapter's own files. This holds each adapter to the case
 * lists: every case is ported, by a Rust test carrying the line
 * `// Case: <name>` above it in the table or the adapter's own files, or
 * exempted below with the reason it cannot run against that adapter.
 *
 * A case's name is the first argument of its `it`, `it.each(…)` or
 * `it.skipIf(…)` call, as written: a template literal's substitutions are
 * each written `*`, and an `it.each` name keeps its `%s`.
 */

const CASE_FILES = [
  'conformance/http/wire-cases.ts',
  'conformance/http/store-condition-cases.ts',
  'conformance/http/process-cases.ts',
] as const;

const read = (file: string): string =>
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
const casesOf = (file: string): string[] => {
  const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
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

/** The case names a Rust port's files mark. */
const markedIn = (files: readonly string[]): string[] =>
  files.flatMap((file) => [...read(file).matchAll(MARKER)].map((match) => match[1] ?? ''));

/** The cases both adapters run, written once. */
const TABLE = 'crates/http-conformance/src/cases.rs';

/** What an adapter's test binary writes to run the table. */
const RUNS_TABLE = 'http_conformance::cases!(';

/** Whether a file invokes the table on a line of its own, not in a comment or a string. */
const runsTable = (text: string): boolean =>
  text.split('\n').some((line) => line.trimStart().startsWith(RUNS_TABLE));

interface Port {
  readonly name: string;
  /** The adapter's own files: the one invoking the table first. */
  readonly files: readonly [string, ...string[]];
  /** Each case that cannot run against the port, with why. */
  readonly exempt: Readonly<Record<string, string>>;
}

interface Marks {
  /** The cases the table marks. */
  readonly table: readonly string[];
  /** The cases the adapter's own files mark. */
  readonly own: readonly string[];
  readonly exempt: Readonly<Record<string, string>>;
}

/** What is wrong with an adapter's marks and exemptions against `cases`. */
const findings = (cases: readonly string[], { table, own, exempt }: Marks) => {
  const marked = [...table, ...own];
  return {
    unported: cases.filter((name) => !marked.includes(name) && !(name in exempt)),
    unknownMarks: marked.filter((name) => !cases.includes(name)),
    unknownExemptions: Object.keys(exempt).filter((name) => !cases.includes(name)),
    exemptAndPorted: Object.keys(exempt).filter((name) => marked.includes(name)),
    inTableAndOwn: own.filter((name) => table.includes(name)),
  };
};

const LISTENER =
  "a listener's, and the host library has none: CI's rust job runs process-cases.ts itself against the Rust CLI's listener";

const NO_LOCK =
  'the scheme handler has no port, Host check or launch secret (Storage ST-121); the window that made a request and its page admit it';

const PORTS: readonly Port[] = [
  {
    name: 'the Rust host',
    files: ['crates/host/tests/wire.rs', 'crates/host/tests/run.rs'],
    exempt: {
      'answers 421 to a request naming any Host but its own': LISTENER,
      'answers 403 to a request without the session cookie, and to a wrong launch secret': LISTENER,
      'trades the launch secret for an HttpOnly, SameSite=Strict session cookie by a redirect':
        LISTENER,
      'refuses a missing directory, announcing why and exiting non-zero': `announcing and exiting are a process's: ${LISTENER}`,
      'writes an edit not yet written when its standard input closes, and exits zero':
        'a standard-input protocol is a process’s, and the Rust CLI keeps none; the library stops by `Run::stop`, which the SIGINT cases hold',
    },
  },
  {
    name: 'the desktop scheme handler',
    files: ['packages/desktop/src-tauri/src/scheme/tests.rs'],
    exempt: {
      'answers / with 503 persistence-unavailable while no Meta Space is established':
        'a talk is served only once its run has Imported its directory into a memory store, which then holds a valid aggregate with its Meta Space; no store that cannot serve stands behind the scheme handler',
      'answers 503 persistence-unavailable for every read and write of an unreachable store':
        'a talk is served from its run’s memory store, and `crates/host/src/memory.rs` constructs no `RepositoryError::Unavailable`; no test holds that, and the scheme handler is not run against a store that can be unreachable',
      'answers 500 internal-error for broken stored state':
        'a talk is served from its run’s memory store, whose only `BrokenStoredState` is Spaces stored with no Meta Space, which its Import never leaves; no test holds that, and the scheme handler is not run against broken stored state',
      'answers a product address over a %s store with %s':
        'a talk is served from its run’s memory store, which can be in neither condition',
      'answers 421 to a request naming any Host but its own': NO_LOCK,
      'answers 403 to a request without the session cookie, and to a wrong launch secret': NO_LOCK,
      'trades the launch secret for an HttpOnly, SameSite=Strict session cookie by a redirect':
        NO_LOCK,
      'refuses a missing directory, announcing why and exiting non-zero':
        'the shell refuses a folder it cannot open before any window or scheme answer exists (`server.rs`, `open_run`)',
      'answers 403 forbidden to a change whose Origin is %s, changing nothing':
        'the scheme handler refuses a change whose Origin is not the talk’s itself, in plain text, before the application sees it (`comes_from`, `scheme.rs`), and its requests name no Host for the application to judge an Origin against',
      'commits a chunked body that declares no length':
        'the scheme handler takes the body as one `Vec<u8>` (`Talk::answer`, `scheme.rs`), so it never reads a body in chunks; whether the webview delivers a chunked upload whole is not tested',
      'answers 413 payload-too-large to a chunked body of * bytes that declares no length':
        'the scheme handler takes the body as one `Vec<u8>` (`Talk::answer`, `scheme.rs`), so it never reads a body in chunks; whether the webview delivers a chunked upload whole is not tested',
      'writes an edit once edits have been quiet, and keeps it on SIGINT':
        'the scheme handler writes nothing: the shell runs the host’s `Run`, which crates/host/tests/run.rs holds',
      'writes an edit not yet written when stopped by SIGINT, and exits zero':
        'the scheme handler writes nothing: the shell runs the host’s `Run`, which crates/host/tests/run.rs holds',
      'writes an edit not yet written when its standard input closes, and exits zero':
        'the shell keeps no standard-input protocol',
      'leaves the directory byte for byte unchanged when opening a Space initializes it (ST-65)':
        'the scheme handler writes nothing: the shell runs the host’s `Run`, which crates/host/tests/run.rs holds',
      'initializes the Space again on a second run over the directory the first run left unchanged (ST-65)':
        'the scheme handler writes nothing: the shell runs the host’s `Run`, which crates/host/tests/run.rs holds',
      'writes the initialization with the next Edit (ST-65)':
        'the scheme handler writes nothing: the shell runs the host’s `Run`, which crates/host/tests/run.rs holds',
    },
  },
];

const CASES = CASE_FILES.flatMap(casesOf);

describe('the HTTP conformance cases', () => {
  it('are each named once, by text', () => {
    expect(CASES.length).toBeGreaterThan(50);
    expect(CASES.filter((name) => name.startsWith('<unnamed case'))).toEqual([]);
    expect(CASES.filter((name, index) => CASES.indexOf(name) !== index)).toEqual([]);
  });
});

describe.each(PORTS)('$name', ({ files, exempt }) => {
  const found = findings(CASES, { table: markedIn([TABLE]), own: markedIn(files), exempt });

  it('runs the table', () => {
    expect(runsTable(read(files[0]))).toBe(true);
  });

  it('ports every case it does not exempt', () => {
    expect(found.unported).toEqual([]);
  });

  it('marks and exempts only cases the lists hold', () => {
    expect(found.unknownMarks).toEqual([]);
    expect(found.unknownExemptions).toEqual([]);
  });

  it('exempts no case it ports', () => {
    expect(found.exemptAndPorted).toEqual([]);
  });

  it('ports no case of the table in its own files too', () => {
    expect(found.inTableAndOwn).toEqual([]);
  });
});

describe('the table check', () => {
  it('finds an invocation that starts its line', () => {
    expect(runsTable(`mod cases {\n    ${RUNS_TABLE}adapter);\n}`)).toBe(true);
  });

  it('finds none in a comment or a string', () => {
    expect(runsTable(`// ${RUNS_TABLE}adapter);`)).toBe(false);
    expect(runsTable(`let text = "${RUNS_TABLE}";`)).toBe(false);
  });
});

describe('the port check', () => {
  const cases = ['shared', 'own', 'exempt'];
  const clean: Marks = { table: ['shared'], own: ['own'], exempt: { exempt: 'why' } };

  it('finds nothing wrong with a case ported once, in the table or its own files, or exempted', () => {
    expect(findings(cases, clean)).toEqual({
      unported: [],
      unknownMarks: [],
      unknownExemptions: [],
      exemptAndPorted: [],
      inTableAndOwn: [],
    });
  });

  it('finds a case with no port and no exemption', () => {
    expect(findings(cases, { ...clean, table: [] }).unported).toEqual(['shared']);
  });

  it('finds a mark naming no case, in the table or its own files', () => {
    expect(findings(cases, { ...clean, table: ['shared', 'gone'] }).unknownMarks).toEqual(['gone']);
    expect(findings(cases, { ...clean, own: ['own', 'gone'] }).unknownMarks).toEqual(['gone']);
  });

  it('finds an exemption naming no case', () => {
    expect(
      findings(cases, { ...clean, exempt: { exempt: 'why', gone: 'why' } }).unknownExemptions,
    ).toEqual(['gone']);
  });

  it('finds a case both exempted and ported', () => {
    expect(
      findings(cases, { ...clean, exempt: { exempt: 'why', shared: 'why' } }).exemptAndPorted,
    ).toEqual(['shared']);
  });

  it('finds a case ported in the table and in its own files', () => {
    expect(findings(cases, { ...clean, own: ['own', 'shared'] }).inTableAndOwn).toEqual(['shared']);
  });
});
