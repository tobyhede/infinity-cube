import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The directories the suite runs a host on, and how it reads one back. Every
 * host runs on a temporary copy of the tracked fixture, never on the fixture
 * itself, because a host writes its edits into the directory it runs.
 */

export const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const FIXTURE = join(REPOSITORY_ROOT, 'packages/app/fixture');

/** The fixture's Meta Space, as its `aggregate.json` names it. */
export const META_SPACE_ID = '00000000-0000-4000-8000-000000000040';

/** A temporary directory, removed by {@link removeTemporaryDirectories}. */
const temporaryDirectories: string[] = [];
/** The stand-in build, once {@link standInBuild} has written it into a temporary directory. */
let written: Promise<string> | undefined;

export const temporaryDirectory = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'infinity-cube-http-conformance-'));
  temporaryDirectories.push(root);
  return root;
};

export const removeTemporaryDirectories = async (): Promise<void> => {
  written = undefined;
  await Promise.all(
    temporaryDirectories.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
};

/** A fresh copy of the fixture, in a temporary directory of its own. */
export const fixtureCopy = async (): Promise<string> => {
  const directory = join(await temporaryDirectory(), 'talk');
  await cp(FIXTURE, directory, { recursive: true });
  return directory;
};

/** Every file under a directory, by its path relative to it, with its bytes. */
export type FileTree = ReadonlyMap<string, Buffer>;

/**
 * A file listed and then gone is left out: Export writes each file beside its
 * target and renames it over, so a read while a host writes can list the
 * temporary file and find it renamed away (`test/unit/http-conformance-directory.test.ts`).
 */
export const readFileTree = async (directory: string): Promise<FileTree> => {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(directory, join(entry.parentPath, entry.name)))
    .sort();
  const read = await Promise.all(
    files.map(async (file): Promise<[string, Buffer] | undefined> => {
      try {
        return [file, await readFile(join(directory, file))];
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
        throw error;
      }
    }),
  );
  return new Map(read.filter((entry) => entry !== undefined));
};

/**
 * How two trees differ, as one line per file, empty when they hold the same
 * files with the same bytes. A list rather than a boolean, so a failing case
 * names the files.
 */
export const fileTreeDifferences = (actual: FileTree, expected: FileTree): readonly string[] => {
  const names = [...new Set([...actual.keys(), ...expected.keys()])].sort();
  return names.flatMap((name) => {
    const left = actual.get(name);
    const right = expected.get(name);
    if (left === undefined) return [`missing ${name}`];
    if (right === undefined) return [`unexpected ${name}`];
    return left.equals(right) ? [] : [`different ${name}`];
  });
};

/**
 * The suite's stand-in for the built application, handed to a host whose
 * command takes `{built}`: the page, one content-named script under
 * `/assets/`, one file outside it, and a file beside the build that no request
 * may reach.
 */
export const STAND_IN_BUILD = {
  /** With one inline script, which the page's policy must admit by its hash. */
  page: '<!doctype html><html><head><title>Stand-in</title><script>window.standIn = true;</script></head><body><div id="root"></div></body></html>\n',
  script: { pathname: '/assets/index-c0nf0rm4.js', text: 'console.log("stand-in");\n' },
  icon: {
    pathname: '/favicon.svg',
    text: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>\n',
  },
  /** Beside the build directory, never inside it. */
  outside: { name: 'outside-the-build.txt', text: 'not served\n' },
} as const;

const writeStandInBuild = async (): Promise<string> => {
  const root = await temporaryDirectory();
  const built = join(root, 'built');
  await mkdir(join(built, 'assets'), { recursive: true });
  await writeFile(join(built, 'index.html'), STAND_IN_BUILD.page);
  await writeFile(join(built, STAND_IN_BUILD.script.pathname), STAND_IN_BUILD.script.text);
  await writeFile(join(built, STAND_IN_BUILD.icon.pathname), STAND_IN_BUILD.icon.text);
  await writeFile(join(root, STAND_IN_BUILD.outside.name), STAND_IN_BUILD.outside.text);
  return built;
};

/**
 * The stand-in build, written into a temporary directory the first time it is
 * asked for and the same directory after, until that directory is removed,
 * answering the build directory.
 */
export const standInBuild = (): Promise<string> => (written ??= writeStandInBuild());
