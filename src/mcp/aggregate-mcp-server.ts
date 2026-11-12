import { lstat, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { AGGREGATE_FILE_NAME, assetFileHash, ASSETS_DIRECTORY_NAME } from '@project/aggregate';
import {
  admitAsset,
  EMPTY_ASSET,
  MAX_ASSET_BYTES,
  mediaTypeForExtension,
} from '@project/persistence';
import { lineFeedText } from '@project/resource-api/domain';
import type { UUID } from '@project/core';
import { z } from 'zod';
import { rejectSymbolicLinks, replaceFile } from '../aggregate-directory/write-in-place';
import { describeCheckFailure, describeError } from '../cli/describe-error';
import { describeCheck } from '../cli/run-refusal';

const INSTRUCTIONS = `This server edits one InfinityCube Aggregate directory: a talk's Spaces, Maps, Graphs and Resources as JSON files, and the assets they name, such as a Markdown Resource's text, by paths relative to the directory. Write an asset with write_asset, which names it by its SHA-256 and answers the URL a Resource's content names it by. The format is https://github.com/tobyhede/infinity-cube/blob/main/docs/aggregate-directory.md. Edit only a directory no pnpm cube run is serving, since a run overwrites what you write. Call list_files first; read ${AGGREGATE_FILE_NAME} and each space.json it lists before writing, and if it lists none the directory is empty and check says what to write. Call check after writing: it Imports the directory as a run does and answers what it refuses. Dot-entries and symbolic links are refused.`;

const EMPTY = `The directory holds no aggregate yet. Write ${AGGREGATE_FILE_NAME} and its Meta Space's directory as the format reference describes, then check again.`;

const answer = (text: string, isError = false): CallToolResult => ({
  content: [{ type: 'text', text }],
  isError,
});

class PathRefusal extends Error {}

/** UTF-8 that refuses bytes it cannot decode rather than replacing them. */
const STRICT_UTF8 = new TextDecoder('utf-8', { fatal: true });

/**
 * Markdown text as the Markdown plugin stores what it saves: UTF-8 with `\n`
 * line endings, so the same text is one asset. Bytes that are not UTF-8 are
 * refused rather than decoded with replacement characters.
 */
const markdownBytes = (given: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => {
  let text: string;
  try {
    text = STRICT_UTF8.decode(given);
  } catch {
    throw new PathRefusal('Markdown is UTF-8 text, and these bytes are not.');
  }
  return new TextEncoder().encode(lineFeedText(text));
};

/**
 * The absolute path `path` names inside `root`, refusing an absolute path, one
 * that leaves `root`, one naming a dot-entry, which Import does not read, and
 * the directory itself.
 */
const lexicallyInside = (root: string, path: string): string => {
  if (isAbsolute(path)) {
    throw new PathRefusal(`${path} is absolute; name a path inside the directory.`);
  }
  const target = resolve(root, path);
  const inside = relative(root, target);
  if (inside === '' || inside === '..' || inside.startsWith(`..${sep}`)) {
    throw new PathRefusal(`${path} is not a file inside the directory.`);
  }
  if (inside.split(sep).some((segment) => segment.startsWith('.'))) {
    throw new PathRefusal(`${path} names a dot-entry, which this server does not touch.`);
  }
  return target;
};

/** The file `path` names inside `root`, refused unless it is inside and reached through no link. */
const fileInside = async (root: string, path: string): Promise<string> => {
  const target = lexicallyInside(root, path);
  await rejectSymbolicLinks(
    root,
    [relative(root, target)],
    () =>
      new PathRefusal(`${path} passes through a symbolic link, which this server does not follow.`),
  );
  return target;
};

/** Every file under `root` by `/`-separated relative path, leaving out dot-entries and not following links. */
const filesUnder = async (root: string, prefix = ''): Promise<string[]> => {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) files.push(...(await filesUnder(root, path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
};

/** Run one tool's work, answering a refused path or a failed read or write as a tool error. */
const attempt = async (work: () => Promise<CallToolResult>): Promise<CallToolResult> => {
  try {
    return await work();
  } catch (error) {
    return answer(error instanceof PathRefusal ? error.message : describeError(error), true);
  }
};

/**
 * An MCP server whose tools list, read, write and delete the files of the
 * Aggregate directory `directory` and check it as `pnpm cube check` does.
 */
export const createAggregateMcpServer = (given: string, newId: () => UUID): McpServer => {
  const directory = resolve(given);
  const server = new McpServer(
    { name: 'infinity-cube', version: '0.0.0' },
    { instructions: INSTRUCTIONS },
  );
  const path = z.string().describe('A file path relative to the Aggregate directory');
  const encoding = z
    .enum(['utf8', 'base64'])
    .optional()
    .describe(
      "How the file's bytes are carried as text: utf8, the default, or base64 for a binary file such as an image",
    );

  server.registerTool(
    'list_files',
    {
      description: 'List every file in the Aggregate directory, by path relative to it',
      annotations: { readOnlyHint: true },
    },
    () => attempt(async () => answer((await filesUnder(directory)).sort().join('\n'))),
  );

  server.registerTool(
    'read_file',
    {
      description: "Read a file's text, or its bytes as base64",
      inputSchema: { path, encoding },
      annotations: { readOnlyHint: true },
    },
    ({ path: file, encoding: carried }) =>
      attempt(async () => {
        const bytes = await readFile(await fileInside(directory, file));
        if (carried === 'base64') return answer(bytes.toString('base64'));
        try {
          return answer(STRICT_UTF8.decode(bytes));
        } catch {
          throw new PathRefusal(`${file} is not UTF-8 text; read it with encoding base64.`);
        }
      }),
  );

  server.registerTool(
    'write_file',
    {
      description: 'Create or replace a file, creating its parent directories',
      inputSchema: {
        path,
        content: z.string().describe("The file's complete new text, or its bytes as base64"),
        encoding,
      },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    ({ path: file, content, encoding: carried }) =>
      attempt(async () => {
        const target = await fileInside(directory, file);
        await mkdir(dirname(target), { recursive: true });
        await replaceFile(
          target,
          carried === 'base64' ? Buffer.from(content, 'base64') : new TextEncoder().encode(content),
        );
        return answer(`Wrote ${file}.`);
      }),
  );

  server.registerTool(
    'write_asset',
    {
      description:
        'Write bytes as an asset, assets/<hash>.<extension>, named by their SHA-256, answering the URL a Resource\'s content names it by, such as a Markdown Resource\'s { "url": "/assets/<hash>" }',
      inputSchema: {
        content: z.string().describe("The asset's text, or its bytes as base64"),
        encoding,
        extension: z
          .string()
          .regex(/^[A-Za-z0-9]+$/u)
          .optional()
          .describe(
            'The file extension, which names its media type: md, the default for text, for Markdown. Bytes carried as base64 name theirs.',
          ),
      },
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    ({ content, encoding: carried, extension: named }) =>
      attempt(async () => {
        // Bytes carry no media type of their own, so they name the extension
        // that gives them one rather than being taken for Markdown.
        if (carried === 'base64' && named === undefined) {
          throw new PathRefusal(
            'Name the extension of bytes carried as base64, such as png for a PNG image.',
          );
        }
        const extension = named ?? 'md';
        const given = new Uint8Array(
          carried === 'base64' ? Buffer.from(content, 'base64') : new TextEncoder().encode(content),
        );
        // Admitted as Import admits an asset file: typed by its extension,
        // and refused over the host's size cap.
        const admission = await admitAsset(
          extension.toLowerCase() === 'md' ? markdownBytes(given) : given,
          mediaTypeForExtension(extension),
        );
        if (admission.kind === 'refused') {
          throw new PathRefusal(
            `An asset is at most ${MAX_ASSET_BYTES / (1024 * 1024)} MiB, and these bytes are more.`,
          );
        }
        const { hash, bytes } = admission.asset;
        // The empty asset always exists, so no file is written for it.
        if (hash === EMPTY_ASSET.hash) {
          return answer(`Name it as /assets/${hash}; it needs no file.`);
        }
        const name = `${hash}.${extension}`;
        const file = `${ASSETS_DIRECTORY_NAME}/${name}`;
        const target = await fileInside(directory, file);
        await mkdir(dirname(target), { recursive: true });
        // One hash names one file: a file of another extension, or of none,
        // holding these bytes is the asset already, and Import refuses a second.
        const held = (await readdir(dirname(target))).find(
          (other) => other !== name && assetFileHash(other) === hash,
        );
        if (held !== undefined) {
          throw new PathRefusal(
            `${ASSETS_DIRECTORY_NAME}/${held} already holds these bytes; name them as /assets/${hash}, or delete ${ASSETS_DIRECTORY_NAME}/${held} first.`,
          );
        }
        await replaceFile(target, bytes);
        return answer(`Wrote ${file}. Name it as /assets/${hash}.`);
      }),
  );

  server.registerTool(
    'delete_file',
    {
      description: 'Delete one file',
      inputSchema: { path },
      annotations: { destructiveHint: true },
    },
    ({ path: file }) =>
      attempt(async () => {
        const target = await fileInside(directory, file);
        if (!(await lstat(target)).isFile()) throw new PathRefusal(`${file} is not a file.`);
        await rm(target);
        return answer(`Deleted ${file}.`);
      }),
  );

  server.registerTool(
    'check',
    {
      description:
        'Import the Aggregate directory as pnpm cube run does, answering whether it is accepted and, if not, why',
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        const { checkAggregate } = await import('../run/run');
        const result = await checkAggregate(directory, newId);
        if (result.kind === 'empty') return answer(EMPTY, true);
        const { accepted, text } = describeCheck(result, directory);
        return answer(text, !accepted);
      } catch (error) {
        return answer(describeCheckFailure(directory, error), true);
      }
    },
  );

  return server;
};
