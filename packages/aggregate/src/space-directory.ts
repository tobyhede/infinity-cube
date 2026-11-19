import {
  importSpaceFileSchema,
  importSpaceSchema,
  type ImportSpace,
  type ImportSpaceFile,
  parseJsonText,
} from '@project/core';
import { documentRefusal, fieldOf, located, parseResourceFiles } from '@project/graph';
import { spaceErrorRefusal, type IntakeRefusal } from './intake-refusal';

type AggregateDirectoryErrorKind = 'discovery' | 'parsing';

/**
 * Why an Aggregate directory's files did not read as an aggregate:
 * `diagnostics` in the words an author reads, and `refusals`, the kind and
 * place of each fault (ADR 0156). The two are separate lists, not one per
 * line: a line may summarise several faults.
 */
export class AggregateDirectoryError extends Error {
  readonly kind: AggregateDirectoryErrorKind;
  readonly diagnostics: readonly string[];
  readonly refusals: readonly IntakeRefusal[];

  constructor(
    kind: AggregateDirectoryErrorKind,
    diagnostics: readonly string[],
    refusals: readonly IntakeRefusal[],
  ) {
    super(diagnostics.join('\n'));
    this.name = 'AggregateDirectoryError';
    this.kind = kind;
    this.diagnostics = diagnostics;
    this.refusals = refusals;
  }
}

/**
 * A Space directory's files, by the path diagnostics name them by, as text,
 * and `relative`, which answers such a path relative to the Aggregate
 * directory, the form a refusal names a file in.
 */
export interface SpaceDirectoryFiles {
  readonly spaceFile: string;
  readonly spaceText: string;
  readonly resources: readonly { readonly path: string; readonly text: string }[];
  readonly relative: (path: string) => string;
}

/** The Space directory holding `spaceFile`, relative to the Aggregate directory. */
const spaceDirectoryOf = (relative: (path: string) => string, spaceFile: string): string => {
  const file = relative(spaceFile);
  const slash = file.lastIndexOf('/');
  return slash === -1 ? '.' : file.slice(0, slash);
};

/** The space file's JSON value, and why it is not JSON when it is not. */
interface SpaceJson {
  readonly json: unknown;
  readonly diagnostic?: string;
}

/**
 * The space file parsed as JSON, or the diagnostic saying why it is not JSON.
 * An unparseable file leaves `json` undefined, which `documentRefusal` answers
 * `null` for.
 */
const parseSpaceJson = (spaceFile: string, spaceText: string | undefined): SpaceJson => {
  if (spaceText === undefined) return { json: undefined };
  try {
    return { json: parseJsonText(spaceText) };
  } catch (error) {
    return { json: undefined, diagnostic: `${spaceFile}: ${String(error)}` };
  }
};

/**
 * Refuse a document this version cannot read, before anything else about it is
 * answered. `documentRefusal`'s docblock is where the argument for one composed
 * gate lives. It is asked before `importSpaceFileSchema`, which would otherwise
 * answer first with a cascade of moved keys for a version it cannot read, and
 * silence for a retired space-level `graphs`; and before a read failure, because
 * a document refused outright was never going to load.
 */
const refuseDocument = (
  spaceFile: string,
  relative: (path: string) => string,
  { json }: SpaceJson,
): void => {
  const refusal = documentRefusal(json);
  if (refusal !== null) {
    throw new AggregateDirectoryError(
      'parsing',
      [`${spaceFile}: ${refusal.message}`],
      [spaceErrorRefusal(spaceDirectoryOf(relative, spaceFile), refusal)],
    );
  }
};

/**
 * Refuse a space file's text whose document this version cannot read, and do
 * nothing for any other text, an unparseable one included. The aggregate
 * reader and `readSingleSpace` ask it when one of a Space directory's files
 * could not be read, so that a document refused outright is reported as that
 * rather than as the read failure.
 */
export const refuseSpaceDocument = (
  spaceFile: string,
  spaceText: string | undefined,
  relative: (path: string) => string,
): void => {
  refuseDocument(spaceFile, relative, parseSpaceJson(spaceFile, spaceText));
};

/**
 * Parse one Space directory's files, already read, into the Space Import takes.
 * The aggregate reader parses through this whatever its source, so a file
 * Export would write is judged by exactly the rule Import reads it by.
 */
export const parseSingleSpace = ({
  spaceFile,
  spaceText,
  resources: resourceFiles,
  relative,
}: SpaceDirectoryFiles): ImportSpace => {
  const spaceJson = parseSpaceJson(spaceFile, spaceText);
  refuseDocument(spaceFile, relative, spaceJson);

  const diagnostics: string[] = [];
  const refusals: IntakeRefusal[] = [];
  const file = relative(spaceFile);
  let parsedSpaceFile: ImportSpaceFile | undefined;
  if (spaceJson.diagnostic !== undefined) {
    diagnostics.push(spaceJson.diagnostic);
    refusals.push({ kind: 'invalid-json', file });
  } else {
    const parsed = importSpaceFileSchema.safeParse(spaceJson.json);
    if (parsed.success) {
      parsedSpaceFile = parsed.data;
    } else {
      for (const issue of parsed.error.issues) {
        diagnostics.push(`${spaceFile}: ${issue.path.join('.') || '(space)'}: ${issue.message}`);
        refusals.push({ kind: 'invalid-shape', ...located(file, fieldOf(issue.path)) });
      }
    }
  }

  const parsedResources = parseResourceFiles(resourceFiles);
  const resources = parsedResources.ok
    ? parsedResources.resources.map(({ resource: { id, ...document } }) => ({ id, document }))
    : [];
  if (!parsedResources.ok) {
    for (const error of parsedResources.errors) {
      diagnostics.push(error.message);
      // Located at the file's own name, whatever id it holds: the file is what
      // failed, before it was read as a Resource.
      refusals.push({ kind: error.kind, ...error.at, file: relative(error.path) });
    }
  }

  if (diagnostics.length > 0 || parsedSpaceFile === undefined) {
    throw new AggregateDirectoryError('parsing', diagnostics, refusals);
  }

  const { id, ...document } = parsedSpaceFile;
  return importSpaceSchema.parse(
    id === undefined ? { document, resources } : { id, document, resources },
  );
};
