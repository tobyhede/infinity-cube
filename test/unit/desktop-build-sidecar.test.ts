import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(
  new URL('../../packages/desktop/scripts/build-sidecar.ts', import.meta.url),
);

/** The vendor and system half of a Rust target triple for this platform. */
function osSuffix(): string {
  return process.platform === 'darwin' ? 'apple-darwin' : 'unknown-linux-gnu';
}

const scratches: string[] = [];

afterEach(() => {
  for (const scratch of scratches.splice(0)) rmSync(scratch, { recursive: true, force: true });
});

/**
 * Runs a copy of the build script in a scratch tree laid out as the
 * repository is, with `pnpm` a no-op and `rustc -vV` naming `host` as its
 * host triple, so nothing outside the scratch tree is built or written.
 */
function buildWithRustHost(host: string) {
  const root = mkdtempSync(join(tmpdir(), 'desktop-build-sidecar-'));
  scratches.push(root);
  const scripts = join(root, 'packages/desktop/scripts');
  mkdirSync(scripts, { recursive: true });
  copyFileSync(SCRIPT, join(scripts, 'build-sidecar.ts'));
  const bin = join(root, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'pnpm'), '#!/bin/sh\nexit 0\n');
  writeFileSync(
    join(bin, 'rustc'),
    `#!/bin/sh\necho 'rustc 1.0.0'\necho 'host: ${host}'\necho 'release: 1.0.0'\n`,
  );
  chmodSync(join(bin, 'pnpm'), 0o755);
  chmodSync(join(bin, 'rustc'), 0o755);
  return spawnSync(process.execPath, [join(scripts, 'build-sidecar.ts')], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}${delimiter}${process.env['PATH'] ?? ''}` },
  });
}

describe.skipIf(process.platform === 'win32')('building the desktop sidecar', () => {
  it('refuses a Rust host triple for another architecture than the Node it copies', () => {
    const otherArch = process.arch === 'arm64' ? 'x86_64' : 'aarch64';
    const host = `${otherArch}-${osSuffix()}`;

    const result = buildWithRustHost(host);

    expect(
      result.stdout,
      'no executable should be built under a triple it cannot run on',
    ).not.toContain('Building the single executable');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(host);
    expect(result.stderr).toContain(process.arch);
  });

  it('goes on to build the executable when the triple names the Node it copies', () => {
    const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
    const host = `${arch}-${osSuffix()}`;

    const result = buildWithRustHost(host);

    expect(result.stdout).toContain(`Building the single executable for ${host}`);
  });
});
