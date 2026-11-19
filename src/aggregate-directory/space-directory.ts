import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import type { ImportSpace } from '@project/core';
import {
  AggregateDirectoryError,
  compareOrdinal,
  parseSingleSpace,
  refuseSpaceDocument,
  relativeTo as relativeToSlashed,
} from '@project/aggregate';

const resolveSpaceFile = async (inputPath: string): Promise<string> => {
  const absoluteInput = resolve(inputPath);
  return (await stat(absoluteInput)).isDirectory()
    ? join(absoluteInput, 'space.json')
    : absoluteInput;
};

const filesIn = async (directory: string, extensions: readonly string[]): Promise<string[]> =>
  (await readdir(directory, { withFileTypes: true }))
    .filter(
      (entry) => entry.isFile() && extensions.some((extension) => entry.name.endsWith(extension)),
    )
    .map((entry) => join(directory, entry.name));

/**
 * Shared by the filesystem readers, which face the same question about the
 * same kind of value: each has to tell "this file is not there" from every
 * other reason a read failed, and a second copy of the test is a second place
 * for it to drift.
 */
export const isMissingFile = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

/**
 * The files Import reads in a Space directory, in ordinal order of their
 * relative paths: `resources/*.json`, the Resource files. No other file is
 * read: a Resource's bytes are assets (ADR 0142). Export removes exactly these
 * when a Resource leaves, so the two cannot drift.
 */
export const discoverResourceFiles = async (spaceDirectory: string): Promise<string[]> => {
  let nestedFiles: string[];
  try {
    nestedFiles = await filesIn(join(spaceDirectory, 'resources'), ['.json']);
  } catch (error) {
    if (!isMissingFile(error)) throw error;
    nestedFiles = [];
  }

  return nestedFiles.sort((left, right) =>
    compareOrdinal(relative(spaceDirectory, left), relative(spaceDirectory, right)),
  );
};

export const readSingleSpace = async (inputPath: string): Promise<ImportSpace> => {
  // A single Space directory has no Aggregate directory around it, so its
  // refusals name files relative to the directory holding it.
  const slashed = (path: string): string => path.split(sep).join('/');
  const relativeTo =
    (holder: string) =>
    (path: string): string =>
      relativeToSlashed(slashed(holder))(slashed(path));
  let spaceFile: string | undefined;
  let resourcePaths: string[];
  try {
    spaceFile = await resolveSpaceFile(inputPath);
    resourcePaths = await discoverResourceFiles(dirname(spaceFile));
  } catch (error) {
    // Before the space file is found, the input is named as what it was given
    // as: a Space directory, or a `space.json` inside one, each relative to
    // the directory holding the Space directory. After, the resources/ that
    // could not be listed.
    const absoluteInput = resolve(inputPath);
    const inputSpaceDirectory =
      basename(absoluteInput) === 'space.json' ? dirname(absoluteInput) : absoluteInput;
    const file =
      spaceFile === undefined
        ? relativeTo(dirname(inputSpaceDirectory))(absoluteInput)
        : relativeTo(dirname(dirname(spaceFile)))(join(dirname(spaceFile), 'resources'));
    throw new AggregateDirectoryError('discovery', [String(error)], [{ kind: 'unreadable', file }]);
  }
  const relativePath = relativeTo(dirname(dirname(spaceFile)));

  const readPaths = [spaceFile, ...resourcePaths];
  const readResults = await Promise.allSettled(readPaths.map((path) => readFile(path, 'utf8')));
  const readDiagnostics: string[] = [];
  const unreadable: string[] = [];
  let spaceText: string | undefined;
  const resources: { path: string; text: string }[] = [];
  readResults.forEach((result, index) => {
    const path = readPaths[index] ?? spaceFile;
    if (result.status === 'rejected') {
      readDiagnostics.push(`${path}: ${String(result.reason)}`);
      unreadable.push(relativePath(path));
    } else if (index === 0) {
      spaceText = result.value;
    } else {
      resources.push({ path, text: result.value });
    }
  });

  // With no space file there is no document, so `documentRefusal` decides
  // nothing and the read failure is the only available report.
  if (readDiagnostics.length > 0 || spaceText === undefined) {
    refuseSpaceDocument(spaceFile, spaceText, relativePath);
    throw new AggregateDirectoryError(
      'discovery',
      readDiagnostics,
      unreadable.map((file) => ({ kind: 'unreadable', file })),
    );
  }
  return parseSingleSpace({ spaceFile, spaceText, resources, relative: relativePath });
};
