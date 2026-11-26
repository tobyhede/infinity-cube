/**
 * Shared by the filesystem readers, which face the same question about the
 * same kind of value: each has to tell "this file is not there" from every
 * other reason a read failed, and a second copy of the test is a second place
 * for it to drift.
 */
export const isMissingFile = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';
