import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build, type Rollup } from 'vite';
import { describe, expect, it } from 'vitest';

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

/** The desktop shell's frontend as built, in memory: file name to bytes. */
const builtShell = async (): Promise<Map<string, Uint8Array>> => {
  const result = await build({
    configFile: here('../desktop-shell-build.config.ts'),
    logLevel: 'silent',
    build: { write: false },
  });
  const outputs: readonly Rollup.RollupOutput[] = Array.isArray(result)
    ? result
    : 'output' in result
      ? [result]
      : [];
  const files = new Map<string, Uint8Array>();
  for (const output of outputs) {
    for (const file of output.output) {
      const bytes =
        file.type === 'chunk'
          ? new TextEncoder().encode(file.code)
          : file.source instanceof Uint8Array
            ? file.source
            : new TextEncoder().encode(file.source);
      files.set(file.fileName, bytes);
    }
  }
  return files;
};

// One build, about fifteen seconds, read by both tests.
let built: Promise<Map<string, Uint8Array>> | undefined;
const shell = (): Promise<Map<string, Uint8Array>> => (built ??= builtShell());

const text = (bytes: Uint8Array | undefined): string => {
  if (bytes === undefined) throw new Error('The file was not built.');
  return new TextDecoder().decode(bytes);
};

describe('the desktop shell’s frontend build', () => {
  it('holds the Start page and the close question’s files, unchanged, side by side', async () => {
    const files = await shell();

    expect(files.has('start.html')).toBe(true);
    for (const name of ['closing.html', 'closing.css', 'closing.js']) {
      expect(text(files.get(name)), name).toBe(
        readFileSync(here(`../../desktop/ui/${name}`), 'utf8'),
      );
    }
    // Neither the Space page nor the type declarations for the question's script.
    expect(files.has('index.html')).toBe(false);
    expect(files.has('tauri.d.ts')).toBe(false);
  }, 60_000);

  it('loads the Start page’s scripts and styles from files, so `script-src` stays `self`', async () => {
    const page = text((await shell()).get('start.html'));

    expect(page).toMatch(/<script type="module" crossorigin src="\/assets\/[^"]+\.js"><\/script>/);
    expect(page).toMatch(/<link rel="stylesheet" crossorigin href="\/assets\/[^"]+\.css">/);
    expect(page).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
    expect(page).not.toMatch(/<style\b/);
  }, 60_000);

  // The packages the page draws from declare `sideEffects: ["*.css"]`, so
  // the plugin catalogue `@project/ui`'s index reaches leaves no lazy chunk
  // (Mermaid, KaTeX, CodeMirror) the page never loads in the shell's binary.
  it('carries the Start page as one script and one stylesheet, and no lazy chunk', async () => {
    const assets = [...(await shell()).keys()].filter((name) => name.startsWith('assets/'));

    expect(assets.filter((name) => name.endsWith('.js'))).toHaveLength(1);
    expect(assets.filter((name) => name.endsWith('.css'))).toHaveLength(1);
    expect(assets).toHaveLength(2);
  }, 60_000);
});
