import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// Runs release/install.sh (Storage ST-129) as a person runs it, against a
// fake release on disk. Each build job in .github/workflows/release.yml
// installs its real archive; these cases reach what no build job does: a
// failing or missing tool, the GitHub API, a relative install folder, the
// PATH line and the message on replacing another build.

const script = resolve(import.meta.dirname, '../../release/install.sh');
const version = '9.9.9-test.1';
const targets = [
  'x86_64-unknown-linux-musl',
  'aarch64-unknown-linux-musl',
  'aarch64-apple-darwin',
  'x86_64-apple-darwin',
] as const;

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'infinity-cube-install-script-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function executable(directory: string, name: string, body: string): Promise<void> {
  const file = join(directory, name);
  await writeFile(file, `#!/bin/sh\n${body}\n`);
  await chmod(file, 0o755);
}

// A release holding an archive for every target the script can pick, so the
// cases hold on whichever machine runs them, and the SHA256SUMS listing them.
async function fakeRelease(
  root: string,
  servedTargets: readonly string[],
  binary = `echo "infinity-cube ${version} (test)"`,
): Promise<string> {
  const served = join(root, 'served');
  await mkdir(served);
  const sums: string[] = [];
  for (const target of servedTargets) {
    const name = `infinity-cube-${version}-${target}`;
    const stage = join(root, 'stage', name);
    await mkdir(stage, { recursive: true });
    await executable(stage, 'infinity-cube', binary);
    const archive = `${name}.tar.gz`;
    const packed = spawnSync('tar', [
      '-C',
      join(root, 'stage'),
      '-czf',
      join(served, archive),
      name,
    ]);
    expect(packed.status).toBe(0);
    const bytes = await readFile(join(served, archive));
    sums.push(`${createHash('sha256').update(bytes).digest('hex')}  ${archive}`);
  }
  await writeFile(join(served, 'SHA256SUMS'), `${sums.join('\n')}\n`);
  return served;
}

interface Run {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function install(
  toolDirectories: string,
  home: string,
  settings: Readonly<Record<string, string>>,
): Run {
  const run = spawnSync('sh', [script], {
    cwd: home,
    encoding: 'utf8',
    env: { PATH: toolDirectories, HOME: home, TMPDIR: home, ...settings },
  });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

const realPath = process.env['PATH'] ?? '/usr/bin:/bin';

describe('release/install.sh', () => {
  it('leaves no staged copy in the install folder when installing fails after copying', async () => {
    const root = await temporaryDirectory();
    const served = await fakeRelease(root, targets);
    const tools = join(root, 'tools');
    await mkdir(tools);
    await executable(tools, 'chmod', 'exit 1');
    const installDir = join(root, 'bin');

    const run = install(`${tools}:${realPath}`, root, {
      INFINITY_CUBE_DOWNLOAD_URL: `file://${served}`,
      INFINITY_CUBE_VERSION: version,
      INFINITY_CUBE_INSTALL_DIR: installDir,
    });

    expect(run.status).not.toBe(0);
    expect(await readdir(installDir)).toEqual([]);
  });

  it('installs the newest release the GitHub API lists on one line', async () => {
    const root = await temporaryDirectory();
    const served = await fakeRelease(root, targets);
    const tools = join(root, 'tools');
    await mkdir(tools);
    // GitHub's answer need not be pretty-printed; this one is a single line.
    await executable(
      tools,
      'curl',
      [
        'while [ $# -gt 0 ]; do case "$1" in -o) out="$2"; shift 2 ;; -*) shift ;; *) url="$1"; shift ;; esac; done',
        'case "$url" in',
        `https://api.github.com/repos/owner/repo/releases*) printf '%s' '[{"url":"https://api.github.com/x","tag_name":"v${version}","draft":false,"prerelease":true}]' > "$out" ;;`,
        `https://github.com/owner/repo/releases/download/v${version}/*) cp "${served}/\${url##*/}" "$out" ;;`,
        '*) exit 22 ;;',
        'esac',
      ].join('\n'),
    );
    const installDir = join(root, 'bin');

    const run = install(`${tools}:${realPath}`, root, {
      INFINITY_CUBE_REPO: 'owner/repo',
      INFINITY_CUBE_INSTALL_DIR: installDir,
    });

    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(run.stdout).toContain(`Installed infinity-cube ${version} (test)`);
  });

  it('skips a release whose tag is not a version, such as the desktop update endpoint', async () => {
    const root = await temporaryDirectory();
    const served = await fakeRelease(root, targets);
    const tools = join(root, 'tools');
    await mkdir(tools);
    await executable(
      tools,
      'curl',
      [
        'while [ $# -gt 0 ]; do case "$1" in -o) out="$2"; shift 2 ;; -*) shift ;; *) url="$1"; shift ;; esac; done',
        'case "$url" in',
        `https://api.github.com/repos/owner/repo/releases*) printf '%s' '[{"tag_name":"desktop-updates","prerelease":true},{"tag_name":"v${version}","prerelease":true}]' > "$out" ;;`,
        `https://github.com/owner/repo/releases/download/v${version}/*) cp "${served}/\${url##*/}" "$out" ;;`,
        '*) exit 22 ;;',
        'esac',
      ].join('\n'),
    );
    const installDir = join(root, 'bin');

    const run = install(`${tools}:${realPath}`, root, {
      INFINITY_CUBE_REPO: 'owner/repo',
      INFINITY_CUBE_INSTALL_DIR: installDir,
    });

    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(run.stdout).toContain(`Installed infinity-cube ${version} (test)`);
  });

  it('names INFINITY_CUBE_VERSION when the GitHub API refuses to list the releases', async () => {
    const root = await temporaryDirectory();
    const tools = join(root, 'tools');
    await mkdir(tools);
    // curl -f exits 22 on the 403 an exhausted unauthenticated limit answers.
    await executable(tools, 'curl', 'exit 22');

    const run = install(`${tools}:${realPath}`, root, {
      INFINITY_CUBE_REPO: 'owner/repo',
      INFINITY_CUBE_INSTALL_DIR: join(root, 'bin'),
    });

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('INFINITY_CUBE_VERSION');
  });

  it('says the release may have no build for this platform when its archive is missing', async () => {
    const root = await temporaryDirectory();
    const served = await fakeRelease(root, []);

    const run = install(realPath, root, {
      INFINITY_CUBE_DOWNLOAD_URL: `file://${served}`,
      INFINITY_CUBE_VERSION: version,
      INFINITY_CUBE_INSTALL_DIR: join(root, 'bin'),
    });

    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(new RegExp(`may have no build for (${targets.join('|')})$`, 'm'));
  });

  it('refuses to replace a working install with a binary that does not run here', async () => {
    const root = await temporaryDirectory();
    const served = await fakeRelease(root, targets, 'exit 1');
    const installDir = join(root, 'bin');
    await mkdir(installDir);
    await executable(installDir, 'infinity-cube', 'echo "infinity-cube 0.0.1 (working)"');
    const working = await readFile(join(installDir, 'infinity-cube'), 'utf8');

    const run = install(realPath, root, {
      INFINITY_CUBE_DOWNLOAD_URL: `file://${served}`,
      INFINITY_CUBE_VERSION: version,
      INFINITY_CUBE_INSTALL_DIR: installDir,
    });

    expect(run.status).not.toBe(0);
    expect(await readdir(installDir)).toEqual(['infinity-cube']);
    expect(await readFile(join(installDir, 'infinity-cube'), 'utf8')).toBe(working);
  });

  it('refuses a directory where the binary would go, and puts nothing inside it', async () => {
    const root = await temporaryDirectory();
    const served = await fakeRelease(root, targets);
    const installDir = join(root, 'bin');
    await mkdir(join(installDir, 'infinity-cube'), { recursive: true });

    const run = install(realPath, root, {
      INFINITY_CUBE_DOWNLOAD_URL: `file://${served}`,
      INFINITY_CUBE_VERSION: version,
      INFINITY_CUBE_INSTALL_DIR: installDir,
    });

    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/is a directory/);
    expect(await readdir(installDir)).toEqual(['infinity-cube']);
    expect(await readdir(join(installDir, 'infinity-cube'))).toEqual([]);
  });

  it('installs to, and names, the absolute folder a relative INFINITY_CUBE_INSTALL_DIR means', async () => {
    const root = await temporaryDirectory();
    const served = await fakeRelease(root, targets);

    const run = install(realPath, root, {
      INFINITY_CUBE_DOWNLOAD_URL: `file://${served}`,
      INFINITY_CUBE_VERSION: version,
      INFINITY_CUBE_INSTALL_DIR: 'bin',
    });

    expect(run.status).toBe(0);
    expect(await readdir(join(root, 'bin'))).toEqual(['infinity-cube']);
    expect(run.stdout).toContain(`to ${join(root, 'bin', 'infinity-cube')}\n`);
    expect(run.stdout).toContain(`export PATH="${join(root, 'bin')}:$PATH"`);
  });

  it('prints the line that adds the install folder to PATH when PATH lacks it', async () => {
    const root = await temporaryDirectory();
    const served = await fakeRelease(root, targets);
    const installDir = join(root, 'bin');

    const run = install(realPath, root, {
      INFINITY_CUBE_DOWNLOAD_URL: `file://${served}`,
      INFINITY_CUBE_VERSION: version,
      INFINITY_CUBE_INSTALL_DIR: installDir,
    });

    expect(run.status).toBe(0);
    expect(run.stdout).toContain(`export PATH="${installDir}:$PATH"`);
    expect(
      install(`${installDir}${delimiter}${realPath}`, root, {
        INFINITY_CUBE_DOWNLOAD_URL: `file://${served}`,
        INFINITY_CUBE_VERSION: version,
        INFINITY_CUBE_INSTALL_DIR: installDir,
      }).stdout,
    ).not.toContain('export PATH=');
  });

  it('says a directory the replaced build wrote is read with that build', async () => {
    const root = await temporaryDirectory();
    const served = await fakeRelease(root, targets);
    const installDir = join(root, 'bin');
    await mkdir(installDir);
    await executable(installDir, 'infinity-cube', 'echo "infinity-cube 0.0.1 (old)"');
    const settings = {
      INFINITY_CUBE_DOWNLOAD_URL: `file://${served}`,
      INFINITY_CUBE_VERSION: version,
      INFINITY_CUBE_INSTALL_DIR: installDir,
    };

    const upgrade = install(realPath, root, settings);

    expect(upgrade.status).toBe(0);
    expect(upgrade.stdout).toContain('This replaced infinity-cube 0.0.1 (old).');
    expect(upgrade.stdout).toContain('read that directory');
    expect(install(realPath, root, settings).stdout).not.toContain('This replaced');
  });

  it('stops, naming curl, and installs nothing when curl is not on PATH', async () => {
    const root = await temporaryDirectory();
    const served = await fakeRelease(root, targets);
    // Every tool the script uses, wget included, except curl.
    const tools = join(root, 'tools');
    await mkdir(tools);
    const needed = [
      'sh',
      'uname',
      'tar',
      'gzip',
      'mktemp',
      'sha256sum',
      'shasum',
      'awk',
      'sed',
      'grep',
      'head',
      'cut',
      'cp',
      'chmod',
      'mv',
      'mkdir',
      'rm',
      'cat',
      'wget',
    ];
    for (const tool of needed) {
      const found = spawnSync('sh', ['-c', `command -v ${tool}`], { encoding: 'utf8' });
      if (found.status === 0) {
        await symlink(found.stdout.trim(), join(tools, tool));
      }
    }
    const installDir = join(root, 'bin');

    const run = install(tools, root, {
      INFINITY_CUBE_DOWNLOAD_URL: `file://${served}`,
      INFINITY_CUBE_VERSION: version,
      INFINITY_CUBE_INSTALL_DIR: installDir,
    });

    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/needs curl/);
    expect(await readdir(root)).not.toContain('bin');
  });
});
