import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { ConfigEnv, InlineConfig, UserConfig } from 'vite';
import {
  spaceHttpPlugin,
  type FetchApplication,
  type SpaceHttpModuleOptions,
} from './vite-space-http-plugin';
import { workspaceAliases } from './workspace-aliases';

export interface ViteDatabaseTarget {
  readonly developmentModule: string;
  readonly previewModule: string;
  readonly port: number;
}

const repositoryFile = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export const postgresViteTarget: ViteDatabaseTarget = {
  developmentModule: repositoryFile('../../src/http/postgres-http-runtime.ts'),
  previewModule: repositoryFile('./dist-http/postgres-http-runtime.js'),
  port: 5173,
};

export const sqliteViteTarget: ViteDatabaseTarget = {
  developmentModule: repositoryFile('../../src/http/sqlite-http-runtime.ts'),
  previewModule: repositoryFile('../../src/http/sqlite-http-runtime.ts'),
  port: 5177,
};

/** The memory catalog an isolated runtime imports in place of the database. */
type MemoryCatalog =
  | { readonly catalog: 'empty' }
  | { readonly catalog: 'fixture'; readonly aggregate?: string }
  | { readonly catalog: 'directory'; readonly directory: string };

const hostViteConfig = (
  target: ViteDatabaseTarget,
  memoryCatalog: MemoryCatalog | undefined,
): UserConfig => {
  const spaceHttpOptions: SpaceHttpModuleOptions = {
    developmentModule:
      memoryCatalog === undefined
        ? target.developmentModule
        : repositoryFile('../../test/support/e2e-http-runtime.ts'),
    previewModule: target.previewModule,
  };
  if (memoryCatalog !== undefined) {
    spaceHttpOptions.runtimeOptions = { ...memoryCatalog, startup: true };
  }
  return {
    resolve: { alias: workspaceAliases() },
    plugins: [react(), tailwindcss(), spaceHttpPlugin(spaceHttpOptions)],
    server: { port: target.port },
  };
};

export const databaseViteConfig = (target: ViteDatabaseTarget, { mode }: ConfigEnv): UserConfig => {
  const memoryCatalog: MemoryCatalog | undefined =
    target === postgresViteTarget && mode === 'e2e-fixture'
      ? { catalog: 'fixture' as const }
      : target === postgresViteTarget && mode === 'e2e-empty'
        ? { catalog: 'empty' as const }
        : target === postgresViteTarget && mode === 'roadmap'
          ? {
              catalog: 'directory' as const,
              directory: repositoryFile('../../.scratch/v1-release/roadmap-space'),
            }
          : undefined;
  return hostViteConfig(target, memoryCatalog);
};

/**
 * The PostgreSQL host's configuration over a fresh memory runtime that imports
 * the Aggregate directory a caller names in place of the tracked fixture: for
 * an end-to-end test whose aggregate the tracked fixture does not hold.
 */
export const directoryViteConfig = (directory: string): UserConfig =>
  hostViteConfig(postgresViteTarget, { catalog: 'fixture', aggregate: directory });

/**
 * The development server a run serves its application through (ADR 0117).
 *
 * Inline rather than loaded from a config file, because the application is
 * composed in the launcher's own process and must stay reachable there: the
 * launcher stops it, flushing what it has not written, before it exits.
 * Its own dependency cache keeps a run from contending with a contributor's
 * `pnpm dev` over the default one.
 */
export const runViteConfig = (application: FetchApplication): InlineConfig => ({
  configFile: false,
  root: repositoryFile('.'),
  cacheDir: repositoryFile('./node_modules/.vite-run'),
  logLevel: 'warn',
  resolve: { alias: workspaceAliases() },
  plugins: [react(), tailwindcss(), spaceHttpPlugin({ application })],
});
