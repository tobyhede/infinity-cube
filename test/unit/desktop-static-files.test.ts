import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { builtFiles } from '../../src/desktop/static-files';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/**
 * A built application beside a file it must never serve:
 * `<root>/secret.txt` and `<root>/built-other/secret.txt` sit outside `<root>/built`.
 */
const builtBesideASecret = async () => {
  const root = await mkdtemp(join(tmpdir(), 'infinity-cube-built-'));
  roots.push(root);
  const built = join(root, 'built');
  await mkdir(join(built, 'assets'), { recursive: true });
  await writeFile(join(built, 'assets', 'index-abc123.js'), 'console.log(1)');
  await writeFile(join(built, 'name with space.txt'), 'spaced');
  await writeFile(join(root, 'secret.txt'), 'secret');
  await mkdir(join(root, 'built-other'));
  await writeFile(join(root, 'built-other', 'secret.txt'), 'secret');
  return builtFiles(built);
};

const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

describe('The built files the desktop sidecar serves', () => {
  it('serves a built file, typed by its extension', async () => {
    const file = await (await builtBesideASecret())('/assets/index-abc123.js');
    expect(file && text(file.bytes)).toBe('console.log(1)');
    expect(file?.contentType).toBe('text/javascript; charset=utf-8');
  });

  it('decodes an escaped name inside the build', async () => {
    const file = await (await builtBesideASecret())('/name%20with%20space.txt');
    expect(file && text(file.bytes)).toBe('spaced');
  });

  it.each([
    '/../secret.txt',
    '/assets/../../secret.txt',
    '/%2e%2e/secret.txt',
    '/..%2fsecret.txt',
    '/%2e%2e%2fsecret.txt',
    '/assets%2f..%2f..%2fsecret.txt',
    '/../built-other/secret.txt',
    '/..%2fbuilt-other%2fsecret.txt',
  ])('never serves %s, which climbs out of the build', async (pathname) => {
    expect(await (await builtBesideASecret())(pathname)).toBeUndefined();
  });

  it.each(['/', '/assets', '/assets/', '/missing.js', '/a%00b', '/%E0%A4%A', '/%'])(
    'answers %s, which is not a built file, with nothing',
    async (pathname) => {
      expect(await (await builtBesideASecret())(pathname)).toBeUndefined();
    },
  );
});
