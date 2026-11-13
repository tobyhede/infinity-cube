import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import {
  AGGREGATE_FILE_VERSION,
  type AssetRef,
  type ResourceFileDocument,
  type UUID,
} from '@project/core';
import { AGGREGATE_FILE_NAME, ASSETS_DIRECTORY_NAME } from '@project/aggregate';

/** One Space directory inside a canonical aggregate, written from raw bytes. */
export interface SpaceDirectory {
  /** The directory name, which is where a Space's own identity is written. */
  readonly name: string;
  /** Raw text, so a test can write a space file that does not parse. */
  readonly spaceFile: string;
  /** Files of the Space directory's `resources/`, by name. */
  readonly resources?: Readonly<Record<string, string>>;
}

/**
 * One Resource's file under `resources/`, by name, as an author writes it:
 * `<id>.json` holding the document. Written with `JSON.stringify` rather than
 * the codec, so intake is exercised against files the codec under test did
 * not produce.
 */
export const resourceFiles = (document: ResourceFileDocument) => ({
  [`${document.id}.json`]: `${JSON.stringify(document, null, 2)}\n`,
});

/** The hash a text is stored by: the SHA-256 of its UTF-8 bytes, unpadded base64url. */
const textHash = (text: string): string => createHash('sha256').update(text).digest('base64url');

/** The asset URL a Markdown Resource names `text` by (ADR 0142). */
export const textAssetRef = (text: string): AssetRef => `/assets/${textHash(text)}`;

/** Files of the aggregate's `assets/`, by name: each text under its hash with `.md`. */
export const textAssetFiles = (...texts: readonly string[]): Readonly<Record<string, string>> =>
  Object.fromEntries(texts.map((text) => [`${textHash(text)}.md`, text]));

/**
 * A Markdown Resource's file under `resources/`, naming `text` by its asset URL.
 * The text itself is the aggregate's, under `assets/`: pass {@link textAssetFiles}
 * to {@link writeAggregateInto} when a test reads it.
 */
export const markdownResourceFiles = (id: UUID, title: string, text: string) =>
  resourceFiles({ id, title, kind: 'markdown', content: { url: textAssetRef(text) } });

/**
 * Write a canonical aggregate directory into `root`: a versioned aggregate file
 * naming the Meta Space, and one `<space-uuid>/` child per Space.
 *
 * `assets` are the files of its `assets/`, by name, written only when given.
 *
 * Public import takes nothing else, so every import test starts from this shape
 * rather than a bare Space directory — which is why it lives here rather than in
 * one of them: a change to the format has one place to reach.
 *
 * `root` is the caller's. Each suite owns its own temporary directory naming and
 * cleanup, and this takes no view on either.
 */
export const writeAggregateInto = async (
  root: string,
  metaSpaceId: UUID,
  spaces: readonly SpaceDirectory[],
  assets: Readonly<Record<string, string>> = {},
): Promise<string> => {
  await writeFile(
    join(root, AGGREGATE_FILE_NAME),
    JSON.stringify({ version: AGGREGATE_FILE_VERSION, metaSpaceId }),
  );
  for (const space of spaces) {
    const directory = join(root, space.name);
    await mkdir(join(directory, 'resources'), { recursive: true });
    await writeFile(join(directory, 'space.json'), space.spaceFile);
    for (const [name, text] of Object.entries(space.resources ?? {})) {
      await writeFile(join(directory, 'resources', name), text);
    }
  }
  if (Object.keys(assets).length > 0) {
    await mkdir(join(root, ASSETS_DIRECTORY_NAME), { recursive: true });
    for (const [name, text] of Object.entries(assets)) {
      await writeFile(join(root, ASSETS_DIRECTORY_NAME, name), text);
    }
  }
  return root;
};

/** Every file under `directory`, by relative path, with its contents in base64. */
export const filesUnder = async (directory: string): Promise<Record<string, string>> => {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const files: Record<string, string> = {};
  for (const entry of entries.filter((candidate) => candidate.isFile())) {
    const path = join(entry.parentPath, entry.name);
    files[relative(directory, path)] = await readFile(path, 'base64');
  }
  return files;
};
