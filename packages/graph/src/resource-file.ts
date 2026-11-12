import {
  declaredKind,
  isKindId,
  KIND_UNREGISTERED,
  resourceFileSchema,
  type Resource,
} from '@project/core';

/** A file of a Space directory's `resources/`, as read from disk: where it was found, and its text. */
export interface ResourceFile {
  readonly path: string;
  readonly text: string;
}

export type ResourceFileErrorKind = 'invalid-json' | 'invalid-resource-file';

export interface ResourceFileError {
  kind: ResourceFileErrorKind;
  /** The file that failed, so a message can say which one. */
  path: string;
  message: string;
}

/** A Resource and the Resource file it was read from. */
export interface DecodedResourceFile {
  readonly path: string;
  readonly resource: Resource;
}

export type ParseResourceFilesResult =
  | { ok: true; resources: readonly DecodedResourceFile[] }
  | { ok: false; errors: ResourceFileError[] };

/** A Resource file's fields, the envelope's and its content's, decoded from JSON. */
type FileDecoding =
  | { readonly ok: true; readonly resource: Resource }
  | { readonly ok: false; readonly errors: ResourceFileError[] };

/**
 * A Resource file's JSON, refused unless its `kind` is declared, with no
 * default kind (ADR 0128), and is a kind id; then the file's schema refuses a kind this build does not
 * register, which this door quotes beside the registered ones the schema
 * names, and holds the envelope and the kind's content each strict.
 */
function decodeFile(file: ResourceFile): FileDecoding {
  let json: unknown;
  try {
    json = JSON.parse(file.text);
  } catch (error) {
    return {
      ok: false,
      errors: [
        {
          kind: 'invalid-json',
          path: file.path,
          message: `${file.path}: is not valid JSON — ${String(error)}`,
        },
      ],
    };
  }
  const refused = (errors: ResourceFileError[]): FileDecoding => ({ ok: false, errors });
  const fail = (kind: ResourceFileErrorKind, message: string): FileDecoding =>
    refused([{ kind, path: file.path, message: `${file.path}: ${message}` }]);

  const kind = declaredKind(json);
  if (kind === undefined) {
    return fail('invalid-resource-file', 'kind: a Resource file must declare its kind');
  }
  if (!isKindId(kind)) {
    return fail(
      'invalid-resource-file',
      `kind: "${kind}" is not a kind id — a bare id or vnd.<owner>.<name>, each part ASCII letters, digits and hyphens`,
    );
  }

  const parsed = resourceFileSchema.safeParse(json);
  if (!parsed.success) {
    return refused(
      parsed.error.issues.map((issue) => ({
        kind: 'invalid-resource-file',
        path: file.path,
        // A file is read as written, so its door quotes the kind it declares.
        message:
          issue.code === 'custom' && issue.params?.['code'] === KIND_UNREGISTERED
            ? `${file.path}: kind: "${kind}" ${issue.message}`
            : `${file.path}: ${issue.path.join('.') || '(resource)'}: ${issue.message}`,
      })),
    );
  }
  return { ok: true, resource: parsed.data };
}

/**
 * Read a Space directory's Resource files into Resources. Each is one
 * `resources/<id>.json`, and holds the Resource itself: the same value a store
 * holds and the wire carries (ADR 0142). No file beside it is read; a
 * Resource's bytes are assets, which `assets/` holds.
 */
export function parseResourceFiles(files: readonly ResourceFile[]): ParseResourceFilesResult {
  const errors: ResourceFileError[] = [];
  const resources: DecodedResourceFile[] = [];
  for (const file of files) {
    const decoded = decodeFile(file);
    if (decoded.ok) resources.push({ path: file.path, resource: decoded.resource });
    else errors.push(...decoded.errors);
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, resources };
}

/**
 * A Resource as its files, by path relative to the Space directory: its one
 * Resource file `resources/<id>.json`, which holds the Resource as it is. The
 * inverse of {@link parseResourceFiles}, and held to that by a round-trip
 * property.
 *
 * The JSON is pretty-printed with two spaces and a closing newline, keys in
 * envelope order, so a file a human then edits reads the way the published
 * examples do.
 */
export function serializeResource(resource: Resource): readonly ResourceFile[] {
  const { id, title, kind, content } = resource;
  return [
    {
      path: `resources/${id}.json`,
      text: `${JSON.stringify({ id, title, kind, content }, null, 2)}\n`,
    },
  ];
}
