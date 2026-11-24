import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// Relative to this module, not to the working directory, as in
// `desktop-sidecar-build.config.ts`.
const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

/**
 * The close question's files (Storage ST-122), copied byte for byte from
 * `packages/desktop/ui`, so the shell's `WebviewUrl::App("closing.html")`
 * finds them beside the Start page. Named one by one: that directory also
 * holds the type declarations its script is checked against.
 */
const CLOSE_QUESTION_FILES = ['closing.html', 'closing.css', 'closing.js'] as const;

const closeQuestion = (): Plugin => ({
  name: 'infinity-cube-close-question',
  apply: 'build',
  generateBundle() {
    for (const fileName of CLOSE_QUESTION_FILES) {
      this.emitFile({
        type: 'asset',
        fileName,
        source: readFileSync(here(`../desktop/ui/${fileName}`)),
      });
    }
  },
});

/**
 * The desktop shell's own frontend (`frontendDist` in
 * `packages/desktop/src-tauri/tauri.conf.json`): the Start page, drawn from
 * `@project/ui`, and the close question beside it. Apart from `dist`, which
 * the shell carries as the resource the host serves to Space windows, so no
 * Space window can load the Start page.
 *
 * The browser build resolves `@project/*` through each package's `exports`,
 * so this config needs no alias table.
 */
export default defineConfig({
  root: here('.'),
  plugins: [react(), tailwindcss(), closeQuestion()],
  publicDir: false,
  build: {
    outDir: here('./dist-desktop-shell'),
    emptyOutDir: true,
    rollupOptions: { input: here('./start.html') },
  },
});
