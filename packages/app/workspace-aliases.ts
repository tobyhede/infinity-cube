import { fileURLToPath } from 'node:url';

/**
 * The server module runner's package boundary, shared by the dev/browser config
 * and the Node artifact build so the two cannot drift apart.
 *
 * Browser imports resolve through the app's own dependencies, but the SSR
 * runtime starts above this workspace in `src/`/`test/`, where pnpm
 * intentionally exposes no `@project` symlinks. These mappings are what let
 * either bundler reach the browser-safe workspace packages from there.
 *
 * Paths anchor on this module, not the working directory: `resolve()` would
 * anchor on cwd, which is the app package only for the one filtered script that
 * loads the build config.
 */
/**
 * A Resource plugin's domain half, by pattern: `@project/plugin-<name>/domain`
 * names `packages/plugin-<name>/src/domain.ts`, so adding a plugin package
 * edits nothing here. Anchored at both ends and needing the hyphen, it cannot
 * match `@project/plugins/domain`. No server build reaches a view half.
 */
const PLUGIN_DOMAIN = /^@project\/(plugin-[^/]+)\/domain$/u;

/** One alias entry, in the array form Vite accepts when an entry is a pattern. */
export interface WorkspaceAlias {
  readonly find: string | RegExp;
  readonly replacement: string;
}

export const workspaceAliases = (): WorkspaceAlias[] => {
  const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
  return [
    { find: '@project/aggregate', replacement: here('../aggregate/src/index.ts') },
    { find: '@project/core', replacement: here('../core/src/index.ts') },
    { find: '@project/graph', replacement: here('../graph/src/index.ts') },
    { find: '@project/http', replacement: here('../http/src/index.ts') },
    { find: '@project/persistence', replacement: here('../persistence/src/index.ts') },
    { find: '@project/plugins/domain', replacement: here('../plugins/src/domain.ts') },
    { find: PLUGIN_DOMAIN, replacement: here('../$1/src/domain.ts') },
    {
      find: '@project/resource-api/domain',
      replacement: here('../resource-api/src/domain/index.ts'),
    },
  ];
};

/** The same packages, for the SSR build's `noExternal`. */
export const workspacePackages: (string | RegExp)[] = workspaceAliases().map(({ find }) => find);
