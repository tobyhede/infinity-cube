import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

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
  args: readonly string[] = ['--cli'],
): Run {
  const run = spawnSync('sh', [script, ...args], {
    cwd: home,
    encoding: 'utf8',
    env: { PATH: toolDirectories, HOME: home, TMPDIR: home, ...settings },
  });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

const realPath = process.env['PATH'] ?? '/usr/bin:/bin';

async function fakeDesktopRelease(root: string): Promise<string> {
  const tools = join(root, 'tools');
  await mkdir(tools);
  await executable(tools, 'uname', 'case "$1" in -s) echo Darwin ;; -m) echo arm64 ;; esac');
  await executable(
    tools,
    'hdiutil',
    [
      'operation="$1"; shift',
      'case "$operation" in',
      'attach)',
      '  while [ "$#" -gt 0 ]; do',
      '    case "$1" in',
      '      -mountpoint) mount="$2"; shift 2 ;;',
      '      -*) shift ;;',
      '      *) image="$1"; shift ;;',
      '    esac',
      '  done',
      '  mkdir -p "$mount/InfinityCube.app"',
      '  cp "$image" "$mount/InfinityCube.app/fixture" ;;',
      'detach) rm -r "$1" ;;',
      'esac',
    ].join('\n'),
  );
  await executable(tools, 'ditto', 'cp -R "$1" "$2"');
  await executable(tools, 'codesign', 'test -f "$4/fixture"');
  const archive = `InfinityCube-${version}-aarch64-apple-darwin.dmg`;
  const image = 'fake disk image';
  await writeFile(join(root, archive), image);
  await writeFile(
    join(root, 'SHA256SUMS'),
    `${createHash('sha256').update(image).digest('hex')}  ${archive}\n`,
  );
  return `${tools}${delimiter}${realPath}`;
}

function installDesktop(toolPath: string, root: string): Run {
  return install(
    toolPath,
    root,
    { INFINITY_CUBE_VERSION: version, INFINITY_CUBE_DOWNLOAD_URL: `file://${root}` },
    [],
  );
}

async function existingDesktopApp(root: string, identifier: string): Promise<string> {
  const app = join(root, 'Applications', 'InfinityCube.app');
  await mkdir(join(app, 'Contents'), { recursive: true });
  await writeFile(
    join(app, 'Contents', 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
  <dict><key>CFBundleIdentifier</key><string>${identifier}</string></dict>
</plist>
`,
  );
  return app;
}

describe('release/install.sh', () => {
  it('offers the CLI on Linux when invoked without arguments', async () => {
    const root = await temporaryDirectory();
    const tools = join(root, 'tools');
    await mkdir(tools);
    await executable(tools, 'uname', 'case "$1" in -s) echo Linux ;; -m) echo x86_64 ;; esac');

    const result = install(`${tools}${delimiter}${realPath}`, root, {}, []);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('requires a Mac with Apple silicon');
    expect(result.stderr).toContain('sh -s -- --cli');
    expect(await readdir(root)).toEqual(['tools']);
  });

  it('installs the checked desktop bundle into Applications and tells the user to open it', async () => {
    const root = await temporaryDirectory();
    const toolPath = await fakeDesktopRelease(root);

    const result = installDesktop(toolPath, root);

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Open InfinityCube from ~/Applications.');
    const applications = join(root, 'Applications');
    expect(await readdir(applications)).toEqual(['InfinityCube.app']);
    expect(await readFile(join(applications, 'InfinityCube.app', 'fixture'), 'utf8')).toBe(
      'fake disk image',
    );
  });

  it('explains how to recover a previous app left in the desktop staging folder', async () => {
    const root = await temporaryDirectory();
    const toolPath = await fakeDesktopRelease(root);
    const staging = join(root, 'Applications', '.infinity-cube-install');
    const previous = join(staging, 'previous.app');
    await mkdir(previous, { recursive: true });

    const result = installDesktop(toolPath, root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(previous);
    expect(result.stderr).toContain('move');
    expect(await readdir(staging)).toEqual(['previous.app']);
  });

  it.runIf(process.platform === 'darwin')(
    'replaces an existing app with the desktop bundle identifier',
    async () => {
      const root = await temporaryDirectory();
      const toolPath = await fakeDesktopRelease(root);
      const path = resolve(import.meta.dirname, '../../packages/desktop/src-tauri/tauri.conf.json');
      const configuration = z
        .object({ identifier: z.string() })
        .parse(JSON.parse(await readFile(path, 'utf8')));
      const app = await existingDesktopApp(root, configuration.identifier);

      const result = installDesktop(toolPath, root);

      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      expect(await readdir(join(root, 'Applications'))).toEqual(['InfinityCube.app']);
      expect(await readdir(app)).toEqual(['fixture']);
    },
  );

  it.runIf(process.platform === 'darwin')('leaves an unrelated app in place', async () => {
    const root = await temporaryDirectory();
    const toolPath = await fakeDesktopRelease(root);
    const app = await existingDesktopApp(root, 'dev.example.other');

    const result = installDesktop(toolPath, root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('belongs to another app');
    expect(await readdir(join(root, 'Applications'))).toEqual(['InfinityCube.app']);
    expect(await readFile(join(app, 'Contents', 'Info.plist'), 'utf8')).toContain(
      'dev.example.other',
    );
  });

  it('leaves an app with no bundle identifier in place', async () => {
    const root = await temporaryDirectory();
    const toolPath = await fakeDesktopRelease(root);
    const app = join(root, 'Applications', 'InfinityCube.app');
    await mkdir(app, { recursive: true });
    await writeFile(join(app, 'existing'), 'an app without an Info.plist');

    const result = installDesktop(toolPath, root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('already exists');
    expect(await readdir(join(root, 'Applications'))).toEqual(['InfinityCube.app']);
    expect(await readFile(join(app, 'existing'), 'utf8')).toBe('an app without an Info.plist');
  });

  it('keeps the selected release and settings in the CLI hint', async () => {
    const root = await temporaryDirectory();
    const tools = join(root, 'tools');
    await mkdir(tools);
    await executable(tools, 'uname', 'case "$1" in -s) echo Linux ;; -m) echo x86_64 ;; esac');
    const toolPath = `${tools}${delimiter}${realPath}`;
    const downloadUrl = "file:///tmp/Alice's previews";
    const result = install(
      toolPath,
      root,
      {
        INFINITY_CUBE_VERSION: version,
        INFINITY_CUBE_REPO: 'example/infinity-cube',
        INFINITY_CUBE_DOWNLOAD_URL: downloadUrl,
      },
      [],
    );

    const command = result.stderr.split('\n').find((line) => line.trimStart().startsWith('curl '));
    if (!command) throw new Error('The fallback did not give a curl command');
    await executable(
      tools,
      'curl',
      `echo 'printf "%s\\n" "$INFINITY_CUBE_VERSION" "$INFINITY_CUBE_REPO" "$INFINITY_CUBE_DOWNLOAD_URL" "$1"'`,
    );
    const retry = spawnSync('sh', ['-c', command], {
      cwd: root,
      encoding: 'utf8',
      env: { PATH: toolPath, HOME: root },
    });
    expect(retry.status).toBe(0);
    expect(retry.stdout.trimEnd().split('\n')).toEqual([
      version,
      'example/infinity-cube',
      downloadUrl,
      '--cli',
    ]);
  });

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

  it('skips a release whose tag is not a version', async () => {
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
        `https://api.github.com/repos/owner/repo/releases*) printf '%s' '[{"tag_name":"nightly","prerelease":true},{"tag_name":"v${version}","prerelease":true}]' > "$out" ;;`,
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
