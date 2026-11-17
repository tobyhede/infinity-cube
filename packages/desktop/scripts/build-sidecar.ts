/**
 * Builds what the desktop shell ships beside itself (ADR 0155):
 *
 * - the browser application, `packages/app/dist`, bundled as a resource;
 * - the desktop sidecar, `src/desktop/`, bundled to one ES module and built
 *   into a Node single executable application at
 *   `src-tauri/binaries/desktop-sidecar-<target triple>`, the name Tauri's
 *   `externalBin` requires.
 *
 * Run it with the Node the repository pins: the executable is a copy of the
 * Node that runs this script, so that Node is the one the sidecar ships.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../../..', import.meta.url));
const binaries = fileURLToPath(new URL('../src-tauri/binaries', import.meta.url));
const bundle = join(repository, 'packages/app/dist-desktop-sidecar/desktop-sidecar.mjs');

const run = (command: string, args: readonly string[], cwd = repository): string =>
  execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

const PINNED_MAJOR = 26;
const major = Number(process.versions.node.split('.')[0]);
if (major < PINNED_MAJOR) {
  process.stderr.write(
    `Run this with Node ${String(PINNED_MAJOR)} or later (ADR 0071); this is ${process.version}.\n`,
  );
  process.exit(1);
}

process.stdout.write('Building the browser application…\n');
run('pnpm', ['--filter', '@project/app', 'exec', 'vite', 'build']);
process.stdout.write('Bundling the desktop sidecar…\n');
run('pnpm', ['desktop-sidecar:build']);

const triple = /^host: (\S+)$/m.exec(run('rustc', ['-vV']))?.[1];
if (triple === undefined) {
  process.stderr.write('`rustc -vV` named no host target triple.\n');
  process.exit(1);
}
const extension = process.platform === 'win32' ? '.exe' : '';
const output = join(binaries, `desktop-sidecar-${triple}${extension}`);
mkdirSync(binaries, { recursive: true });

const scratch = mkdtempSync(join(tmpdir(), 'infinity-cube-sea-'));
try {
  const config = join(scratch, 'sea-config.json');
  writeFileSync(
    config,
    JSON.stringify({
      main: bundle,
      mainFormat: 'module',
      output,
      disableExperimentalSEAWarning: true,
    }),
  );
  process.stdout.write(`Building the single executable for ${triple}…\n`);
  run(process.execPath, ['--build-sea', config], scratch);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

// An unsigned executable is killed on Apple Silicon; an ad-hoc signature is
// enough until the application is signed for release.
if (process.platform === 'darwin') run('codesign', ['--sign', '-', '--force', output]);

process.stdout.write(`Wrote ${output}\n`);
