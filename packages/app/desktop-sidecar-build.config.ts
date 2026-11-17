import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { workspaceAliases } from './workspace-aliases';

// Relative to this module, not to the working directory, as in
// `http-server-build.config.ts`.
const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

/**
 * The desktop sidecar (ADR 0155) as one ES module with every dependency
 * inlined, so the desktop application ships it beside a Node binary with no
 * `node_modules`.
 */
export default defineConfig({
  resolve: { alias: workspaceAliases() },
  publicDir: false,
  build: {
    ssr: here('../../src/desktop/desktop-process.ts'),
    outDir: here('./dist-desktop-sidecar'),
    emptyOutDir: true,
    target: 'node26',
    rollupOptions: {
      output: { entryFileNames: 'desktop-sidecar.mjs' },
    },
  },
  ssr: {
    noExternal: true,
  },
});
