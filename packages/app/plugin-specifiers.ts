/**
 * A Resource plugin's halves, by pattern: `@project/plugin-<name>/domain` and
 * `/view` capture `plugin-<name>`, the package's directory under `packages/`,
 * so adding a plugin package edits no alias list. Anchored at both ends and
 * needing the hyphen, neither matches `@project/plugins/…`. `vitest.config.ts`
 * aliases both halves with these and the server builds' shared list the domain
 * half alone; `test/unit/plugin-aliases.test.ts` resolves every plugin through
 * both.
 *
 * Imported by Vite and Vitest configs, so it imports nothing.
 */
export const PLUGIN_DOMAIN_SPECIFIER = /^@project\/(plugin-[^/]+)\/domain$/u;
export const PLUGIN_VIEW_SPECIFIER = /^@project\/(plugin-[^/]+)\/view$/u;
