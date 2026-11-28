import { spawnSync } from 'node:child_process';
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const release = resolve(import.meta.dirname, '../../release');
const version = '9.9.9-test.1';
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

async function executable(directory: string, name: string, body: string): Promise<void> {
  const file = join(directory, name);
  await writeFile(file, `#!/bin/sh\nset -eu\n${body}\n`);
  await chmod(file, 0o755);
}

async function desktopBuild(arch: 'arm64' | 'x86_64', codesign: string) {
  const root = await mkdtemp(join(tmpdir(), 'infinity-cube-release-build-'));
  temporaryDirectories.push(root);
  const tools = join(root, 'bin');
  const scripts = join(root, 'release');
  const out = join(root, 'out');
  const target = arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
  const bundle = join(root, 'target', target, 'release', 'bundle');
  const app = join(bundle, 'macos', 'InfinityCube.app', 'Contents', 'MacOS');

  await Promise.all(
    [tools, scripts, app, join(bundle, 'dmg'), join(root, 'conformance', 'init', 'expected')].map(
      (directory) => mkdir(directory, { recursive: true }),
    ),
  );

  const build = await readFile(join(release, 'build.sh'), 'utf8');
  // PlistBuddy's absolute system path bypasses PATH even in a simulated build.
  await writeFile(
    join(scripts, 'build.sh'),
    build.replace('/usr/libexec/PlistBuddy', 'PlistBuddy'),
  );
  await copyFile(join(release, 'install.sh'), join(scripts, 'install.sh'));
  await writeFile(join(root, '.node-version'), process.version.slice(1));
  await writeFile(join(root, 'Cargo.toml'), `[workspace.package]\nversion = "${version}"\n`);
  await writeFile(join(bundle, 'dmg', `InfinityCube_${version}_test.dmg`), 'disk image');
  await executable(
    app,
    'InfinityCube',
    'lock="$1/.infinity-cube.lock"; touch "$lock"; while [ -e "$lock" ]; do sleep 1; done',
  );
  await executable(tools, 'uname', `case "$1" in -s) echo Darwin ;; -m) echo ${arch} ;; esac`);
  await executable(tools, 'sysctl', 'exit 1');
  await executable(tools, 'pnpm', 'exit 0');
  await executable(tools, 'cargo', 'exit 0');
  await executable(tools, 'rustup', 'exit 0');
  await executable(
    tools,
    'PlistBuddy',
    `case "$2" in
  'Print CFBundleShortVersionString') echo ${version} ;;
  'Print CFBundleIdentifier') echo dev.infinitycube.desktop ;;
  *) exit 1 ;;
esac`,
  );
  await executable(
    tools,
    'hdiutil',
    `case "$1" in
  attach)
    shift
    while [ "$1" != -mountpoint ]; do shift; done
    mkdir -p "$2"
    cp -R "$BUILD_FIXTURE_APP" "$2/InfinityCube.app"
    ;;
  detach) rm -r "$2" ;;
esac`,
  );
  await executable(tools, 'ditto', 'cp -R "$1" "$2"');
  await executable(tools, 'codesign', codesign);

  const run = spawnSync('sh', [join(scripts, 'build.sh'), '--desktop', '--out', out], {
    cwd: root,
    encoding: 'utf8',
    timeout: 10_000,
    env: {
      PATH: `${tools}${delimiter}${process.env['PATH'] ?? '/usr/bin:/bin'}`,
      TMPDIR: root,
      HOME: root,
      BUILD_FIXTURE_APP: join(bundle, 'macos', 'InfinityCube.app'),
    },
  });
  return { run, out, image: `InfinityCube-${version}-${target}.dmg` };
}

describe('release/build.sh --desktop', () => {
  it('opens the disk image from a native Intel build before packing it', async () => {
    const { run, out, image } = await desktopBuild('x86_64', 'exit 0');

    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain('It opened the Space');
    expect((await readdir(out)).sort()).toEqual([image, 'SHA256SUMS']);
  });

  it('leaves no release output after a failed smoke test', async () => {
    const { run, out } = await desktopBuild(
      'arm64',
      'echo "fixture rejected signature" >&2; exit 1',
    );

    expect(run.status, run.stderr).toBe(1);
    expect(run.stderr).toContain('fixture rejected signature');
    expect(await readdir(out)).toEqual([]);
  });
});
