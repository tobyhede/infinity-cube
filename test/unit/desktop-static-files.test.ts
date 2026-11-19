import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
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
 * `<root>/secret.txt` and `<root>/built-other/secret.txt` sit outside `<root>/built`,
 * and `<root>/built` holds a link to each: `assets/linked-secret.txt` to the
 * file and `linked-other` to its directory.
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
  await writeFile(join(built, 'assets', 'worker-abc123.mjs'), 'export {}');
  await writeFile(join(built, 'assets', 'module-abc123.wasm'), '\0asm');
  await symlink(join(root, 'secret.txt'), join(built, 'assets', 'linked-secret.txt'));
  await symlink(join(root, 'built-other'), join(built, 'linked-other'));
  return builtFiles(built);
};

const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

describe('The built files the desktop sidecar serves', () => {
  it('serves a built file, typed by its extension', async () => {
    const file = await (await builtBesideASecret())('/assets/index-abc123.js');
    expect(file && text(file.bytes)).toBe('console.log(1)');
    expect(file?.contentType).toBe('text/javascript; charset=utf-8');
  });

  it.each([
    ['/assets/worker-abc123.mjs', 'text/javascript; charset=utf-8'],
    ['/assets/module-abc123.wasm', 'application/wasm'],
  ])('serves %s as %s', async (pathname, contentType) => {
    const file = await (await builtBesideASecret())(pathname);
    expect(file?.contentType).toBe(contentType);
  });

  it.each(['/assets/linked-secret.txt', '/linked-other/secret.txt'])(
    'never serves %s, a link inside the build to a file outside it',
    async (pathname) => {
      expect(await (await builtBesideASecret())(pathname)).toBeUndefined();
    },
  );

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

  // The permission bits do not bind root, which reads the file anyway; the
  // assertion then has no unreadable file to hold and the case returns.
  it('answers nothing for a file whose permissions forbid reading it', async () => {
    const files = await builtBesideASecret();
    const path = join(roots[0] ?? '', 'built', 'assets', 'index-abc123.js');
    await chmod(path, 0o000);
    const readable = await readFile(path).then(
      () => true,
      () => false,
    );
    const answer = await files('/assets/index-abc123.js');
    await chmod(path, 0o644);
    if (readable) return;
    expect(answer).toBeUndefined();
  });
});
