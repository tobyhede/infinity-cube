import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { PassThrough } from 'node:stream';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { EMPTY_ASSET_REF, newUuid, uuidSchema } from '@project/core';
import { AGGREGATE_FILE_NAME } from '@project/aggregate';
import { afterEach, describe, expect, it } from 'vitest';
import { serveMcpOverStdio } from '../../src/cli/mcp-stdio';
import { describeRunRefusal } from '../../src/cli/run-refusal';
import { createAggregateMcpServer } from '../../src/mcp/aggregate-mcp-server';
import { checkAggregate } from '../../src/run/run';
import {
  filesUnder,
  markdownResourceFiles,
  textAssetFiles,
  textAssetRef,
  writeAggregateInto,
} from '../support/aggregate-directory';
import { callTool } from '../support/mcp-tool-answer';

const SPACE_ID = uuidSchema.parse('11111111-1111-4111-8111-111111111111');
const OPENING_ID = uuidSchema.parse('66666666-6666-4666-8666-666666666666');
const OPENING_TEXT = 'Hello.\n';
/** The Opening Resource's text, as its asset file under `assets/` (ADR 0142). */
const OPENING_ASSET = `assets/${textAssetRef(OPENING_TEXT).slice('/assets/'.length)}.md`;

const temporaryDirectories: string[] = [];
const clients: Client[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

const makeTemporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'infinity-cube-mcp-unit-'));
  temporaryDirectories.push(directory);
  return directory;
};

const writeTalk = async (root?: string): Promise<string> =>
  writeAggregateInto(
    root ?? (await makeTemporaryDirectory()),
    SPACE_ID,
    [
      {
        name: SPACE_ID,
        spaceFile: JSON.stringify({ version: 1, id: SPACE_ID, title: 'Talk' }),
        resources: markdownResourceFiles(OPENING_ID, 'Opening', OPENING_TEXT),
      },
    ],
    textAssetFiles(OPENING_TEXT),
  );

/** A client connected in memory to the server for `directory`, as a local MCP client connects. */
const connect = async (directory: string): Promise<Client> => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createAggregateMcpServer(directory, newUuid).connect(serverTransport);
  const client = new Client({ name: 'aggregate-mcp-server-test', version: '0.0.0' });
  await client.connect(clientTransport);
  clients.push(client);
  return client;
};

describe('the Aggregate directory MCP server', () => {
  it('offers exactly the file tools, the asset writer and check', async () => {
    const client = await connect(await writeTalk());

    const { tools } = await client.listTools();

    expect(tools.map(({ name }) => name).sort()).toEqual([
      'check',
      'delete_file',
      'list_files',
      'read_file',
      'write_asset',
      'write_file',
    ]);
  });

  it('lists every file by its path relative to the directory, leaving out dot-entries', async () => {
    const directory = await writeTalk();
    await mkdir(join(directory, '.git'));
    await writeFile(join(directory, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    await writeFile(join(directory, SPACE_ID, '.DS_Store'), '');
    const client = await connect(directory);

    const answer = await callTool(client, 'list_files');

    expect(answer.isError).toBe(false);
    expect(answer.text.split('\n')).toEqual([
      `${SPACE_ID}/resources/${OPENING_ID}.json`,
      `${SPACE_ID}/space.json`,
      AGGREGATE_FILE_NAME,
      OPENING_ASSET,
    ]);
  });

  it("reads a file's text", async () => {
    const client = await connect(await writeTalk());

    const answer = await callTool(client, 'read_file', { path: OPENING_ASSET });

    expect(answer).toEqual({ text: OPENING_TEXT, isError: false });
  });

  it('writes a new file, creating its parent directories, and replaces an existing one', async () => {
    const directory = await writeTalk();
    const client = await connect(directory);
    const spaceFile = `${SPACE_ID}/space.json`;
    const retitled = JSON.stringify({ version: 1, id: SPACE_ID, title: 'Retitled' });

    const created = await callTool(client, 'write_file', {
      path: 'notes/draft/outline.md',
      content: '# Outline\n',
    });
    const replaced = await callTool(client, 'write_file', { path: spaceFile, content: retitled });

    expect(created.isError).toBe(false);
    expect(replaced.isError).toBe(false);
    await expect(readFile(join(directory, 'notes/draft/outline.md'), 'utf8')).resolves.toBe(
      '# Outline\n',
    );
    await expect(readFile(join(directory, spaceFile), 'utf8')).resolves.toBe(retitled);
    expect(Object.keys(await filesUnder(directory)).sort()).toEqual(
      [
        AGGREGATE_FILE_NAME,
        'notes/draft/outline.md',
        `${SPACE_ID}/resources/${OPENING_ID}.json`,
        OPENING_ASSET,
        spaceFile,
      ].sort(),
    );
  });

  it("carries a binary file's bytes unchanged as base64", async () => {
    const directory = await writeTalk();
    const client = await connect(directory);
    const bytes = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0xfe,
    ]);
    const image = 'assets/picture.png';

    const written = await callTool(client, 'write_file', {
      path: image,
      content: Buffer.from(bytes).toString('base64'),
      encoding: 'base64',
    });
    const read = await callTool(client, 'read_file', { path: image, encoding: 'base64' });

    expect(written.isError).toBe(false);
    expect(new Uint8Array(await readFile(join(directory, image)))).toEqual(bytes);
    expect(read).toEqual({ text: Buffer.from(bytes).toString('base64'), isError: false });
  });

  it('refuses to read a file that is not UTF-8 as text, naming base64', async () => {
    const directory = await writeTalk();
    await mkdir(join(directory, 'assets'), { recursive: true });
    await writeFile(join(directory, 'assets', 'picture.png'), Uint8Array.from([0x89, 0xff, 0x00]));
    const client = await connect(directory);

    const answer = await callTool(client, 'read_file', { path: 'assets/picture.png' });

    expect(answer.isError).toBe(true);
    expect(answer.text).toContain('base64');
  });

  it('deletes one file', async () => {
    const directory = await writeTalk();
    const client = await connect(directory);

    const answer = await callTool(client, 'delete_file', { path: OPENING_ASSET });

    expect(answer.isError).toBe(false);
    expect(Object.keys(await filesUnder(directory))).not.toContain(OPENING_ASSET);
  });

  it('checks an accepted directory as cube check does', async () => {
    const directory = await writeTalk();
    const client = await connect(directory);

    const answer = await callTool(client, 'check');

    expect(answer).toEqual({ text: `${directory} is a valid aggregate.\n`, isError: false });
  });

  it('checks a refused directory with the problems cube check prints', async () => {
    const directory = await writeTalk();
    await writeFile(
      join(directory, SPACE_ID, 'resources', `${OPENING_ID}.json`),
      JSON.stringify({
        id: OPENING_ID,
        title: 'Opening',
        kind: 'markdown',
        content: { path: `${OPENING_ID}.md`, mediaType: 'text/markdown' },
      }),
    );
    const refused = await checkAggregate(directory, newUuid);
    if (refused.kind === 'valid') throw new Error('Import accepted Markdown content by path');
    const client = await connect(directory);

    const answer = await callTool(client, 'check');

    expect(answer).toEqual({ text: describeRunRefusal(refused, directory), isError: true });
    expect(answer.text).toContain(OPENING_ID);
  });

  /** The whole of adding a Markdown Resource, as an MCP client does it, with no other tool (ADR 0142). */
  it('adds a Markdown Resource with its tools alone, and check names a Resource file it refuses', async () => {
    const directory = await writeTalk();
    const client = await connect(directory);
    const added = uuidSchema.parse('77777777-7777-4777-8777-777777777777');

    const stored = await callTool(client, 'write_asset', { content: '# Added\n\nBy tools.\n' });
    expect(stored.isError).toBe(false);
    const url = textAssetRef('# Added\n\nBy tools.\n');
    expect(stored.text).toContain(url);
    const resourceFile = `${SPACE_ID}/resources/${added}.json`;
    const written = await callTool(client, 'write_file', {
      path: resourceFile,
      content: JSON.stringify({ id: added, title: 'Added', kind: 'markdown', content: { url } }),
    });
    expect(written.isError).toBe(false);
    expect(await callTool(client, 'check')).toEqual({
      text: `${directory} is a valid aggregate.\n`,
      isError: false,
    });
    await expect(
      readFile(join(directory, 'assets', `${url.slice('/assets/'.length)}.md`), 'utf8'),
    ).resolves.toBe('# Added\n\nBy tools.\n');

    await callTool(client, 'write_file', {
      path: resourceFile,
      content: JSON.stringify({
        id: added,
        title: 'Added',
        kind: 'markdown',
        content: { url: 'https://example.com/added.md' },
      }),
    });
    const refused = await callTool(client, 'check');
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain(`resources/${added}.json`);
  });

  it('checks a Resource file naming text not yet written by naming the file to write, which write_asset then writes', async () => {
    const directory = await writeTalk();
    const client = await connect(directory);
    const added = uuidSchema.parse('77777777-7777-4777-8777-777777777777');
    const text = '# Added\n\nBy tools.\n';
    const url = textAssetRef(text);
    const hash = url.slice('/assets/'.length);

    await callTool(client, 'write_file', {
      path: `${SPACE_ID}/resources/${added}.json`,
      content: JSON.stringify({ id: added, title: 'Added', kind: 'markdown', content: { url } }),
    });
    const absent = await callTool(client, 'check');
    expect(absent.isError).toBe(false);
    expect(absent.text).toContain(`${url} has no file: write its bytes to assets/${hash}.`);
    expect(absent.text).toContain(`assets/${hash}.md`);

    expect((await callTool(client, 'write_asset', { content: text })).text).toContain(url);
    expect(await callTool(client, 'check')).toEqual({
      text: `${directory} is a valid aggregate.\n`,
      isError: false,
    });
  });

  it('writes Markdown text with `\\n` line endings, naming it by those bytes', async () => {
    const directory = await writeTalk();
    const client = await connect(directory);
    const url = textAssetRef('# Lines\nOne\nTwo\n');

    const stored = await callTool(client, 'write_asset', { content: '# Lines\r\nOne\rTwo\r\n' });

    expect(stored.text).toContain(url);
    await expect(
      readFile(join(directory, 'assets', `${url.slice('/assets/'.length)}.md`), 'utf8'),
    ).resolves.toBe('# Lines\nOne\nTwo\n');
  });

  it('refuses to write an asset whose bytes a file of another extension already holds', async () => {
    const directory = await writeTalk();
    const client = await connect(directory);
    const hash = textAssetRef('Plain.\n').slice('/assets/'.length);
    await callTool(client, 'write_asset', { content: 'Plain.\n', extension: 'txt' });

    const refused = await callTool(client, 'write_asset', { content: 'Plain.\n' });

    expect(refused.isError).toBe(true);
    expect(refused.text).toContain(`assets/${hash}.txt`);
    expect(await callTool(client, 'check')).toEqual({
      text: `${directory} is a valid aggregate.\n`,
      isError: false,
    });
  });

  it('refuses bytes carried as base64 that name no extension, writing nothing', async () => {
    const directory = await writeTalk();
    const client = await connect(directory);
    const assets = join(directory, 'assets');
    const before = await readdir(assets);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');

    const refused = await callTool(client, 'write_asset', { content: png, encoding: 'base64' });

    expect(refused.isError).toBe(true);
    expect(refused.text).toContain('extension');
    expect(await readdir(assets)).toEqual(before);
  });

  it('refuses Markdown whose bytes are not UTF-8 text, writing nothing', async () => {
    const directory = await writeTalk();
    const client = await connect(directory);
    const assets = join(directory, 'assets');
    const before = await readdir(assets);
    const notText = Buffer.from([0x23, 0x20, 0xff, 0xfe, 0x0a]).toString('base64');

    const refused = await callTool(client, 'write_asset', {
      content: notText,
      encoding: 'base64',
      extension: 'md',
    });

    expect(refused.isError).toBe(true);
    expect(refused.text).toContain('UTF-8');
    expect(await readdir(assets)).toEqual(before);
  });

  it('answers the empty asset’s URL without writing a file, as no file is needed for it', async () => {
    const directory = await writeTalk();
    const client = await connect(directory);
    const assets = join(directory, 'assets');
    const before = await readdir(assets);

    const stored = await callTool(client, 'write_asset', { content: '' });

    expect(stored.isError).toBe(false);
    expect(stored.text).toContain(EMPTY_ASSET_REF);
    expect(await readdir(assets)).toEqual(before);
  });

  it('refuses to write an asset whose bytes a file named by the bare hash already holds', async () => {
    const directory = await writeTalk();
    const client = await connect(directory);
    const assets = join(directory, 'assets');
    const before = await readdir(assets);
    const hash = textAssetRef('Plain.\n').slice('/assets/'.length);
    await callTool(client, 'write_file', { path: `assets/${hash}`, content: 'Plain.\n' });

    const refused = await callTool(client, 'write_asset', { content: 'Plain.\n' });

    expect(refused.isError).toBe(true);
    expect(refused.text).toContain(`assets/${hash} already`);
    expect((await readdir(assets)).sort()).toEqual([...before, hash].sort());
  });

  it('checks an empty directory by saying what to write, naming no command', async () => {
    const directory = await makeTemporaryDirectory();
    const client = await connect(directory);

    const answer = await callTool(client, 'check');

    expect(answer.isError).toBe(true);
    expect(answer.text).toContain(AGGREGATE_FILE_NAME);
    expect(answer.text).not.toContain('pnpm');
  });

  it.each([
    { tool: 'read_file', path: '/etc/passwd' },
    { tool: 'read_file', path: '../outside.txt' },
    { tool: 'read_file', path: `${SPACE_ID}/../../outside.txt` },
    { tool: 'read_file', path: '.git/HEAD' },
    { tool: 'read_file', path: `${SPACE_ID}/.hidden` },
    { tool: 'read_file', path: '' },
    { tool: 'read_file', path: 'linked/secret.txt' },
    { tool: 'write_file', path: '/tmp/written-by-the-mcp-server.txt' },
    { tool: 'write_file', path: '../outside.txt' },
    { tool: 'write_file', path: '.git/config' },
    { tool: 'write_file', path: 'linked/secret.txt' },
    { tool: 'write_file', path: 'linked/new/file.txt' },
    { tool: 'write_file', path: '.' },
    { tool: 'write_file', path: 'dangling/file.txt' },
    { tool: 'write_file', path: `inner/space.json` },
    { tool: 'read_file', path: `inner/space.json` },
    { tool: 'delete_file', path: '/etc/hostname' },
    { tool: 'delete_file', path: '../outside.txt' },
    { tool: 'delete_file', path: '.git/HEAD' },
    { tool: 'delete_file', path: 'linked/secret.txt' },
  ])('refuses $tool on $path, touching nothing', async ({ tool, path }) => {
    const outside = await makeTemporaryDirectory();
    await writeFile(join(outside, 'secret.txt'), 'secret\n');
    const parent = await makeTemporaryDirectory();
    await writeFile(join(parent, 'outside.txt'), 'outside\n');
    const directory = join(parent, 'talk');
    await mkdir(directory);
    await writeTalk(directory);
    await mkdir(join(directory, '.git'));
    await writeFile(join(directory, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    await symlink(outside, join(directory, 'linked'));
    await symlink(join(outside, 'missing'), join(directory, 'dangling'));
    await symlink(join(directory, SPACE_ID), join(directory, 'inner'));
    const before = await filesUnder(parent);
    const outsideBefore = await filesUnder(outside);
    const client = await connect(directory);

    const answer = await callTool(client, tool, { path, content: 'overwritten\n' });

    expect(answer.isError).toBe(true);
    expect(answer.text).toMatch(/absolute|not a file inside|dot-entry|symbolic link/);
    await expect(readFile('/tmp/written-by-the-mcp-server.txt')).rejects.toThrow();
    expect(answer.text).not.toMatch(/secret\n|outside\n|ref: refs/);
    expect(await filesUnder(parent)).toEqual(before);
    expect(await filesUnder(outside)).toEqual(outsideBefore);
  });

  it('serves over a pair of streams until the client ends its input', async () => {
    const directory = await writeTalk();
    const input = new PassThrough();
    const output = new PassThrough();
    const lines: string[] = [];
    output.on('data', (chunk: Buffer) => lines.push(...chunk.toString('utf8').split('\n')));

    const served = serveMcpOverStdio(directory, newUuid, input, output);
    input.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'streams', version: '0.0.0' } } })}\n`,
    );
    input.end();

    await expect(served).resolves.toBe(0);
    const responses = lines.filter((line) => line !== '');
    expect(responses).toHaveLength(1);
    expect(responses[0]).toContain('"serverInfo":{"name":"infinity-cube"');
    expect(responses[0]).toContain('"id":1}');
  });
});
