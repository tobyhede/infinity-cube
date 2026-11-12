import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';

/**
 * The Resource's stylesheets, read as source, for the tests that hold what
 * jsdom computes none of. A path rather than a URL: jsdom's `URL` is not one
 * `node:fs` recognises, and the Title room test runs under jsdom.
 */
const here = dirname(fileURLToPath(import.meta.url));

export const stylesheet = readFileSync(join(here, '../src/canvas-resource.css'), 'utf8');

/**
 * The Resource's own structural scale is declared centrally in
 * `tailwind.css`, beside its colour tokens, rather than on `.canvas-resource`
 * itself — the same place `--canvas-resource-ink-color` and its neighbours are.
 * The ladder's ceiling needs the border's numeric width, which lives there rather than inline in `canvas-resource.css`'s own `border`
 * declaration.
 */
const themeStylesheet = readFileSync(join(here, '../../app/src/tailwind.css'), 'utf8');

/** The declaration block of the rule whose selector is exactly `selector`. */
export const block = (selector: string): string => {
  const escaped = selector.replaceAll(/[.[\]^$*+?()|{}\\]/gu, String.raw`\$&`);
  // Anchored to the start of a line, so `.canvas-resource` finds the Resource's own
  // rule rather than the first rule that happens to mention it.
  const found = new RegExp(String.raw`^${escaped}\s*\{([^}]*)\}`, 'mu').exec(stylesheet);
  expect(found, `no rule for ${selector}`).not.toBeNull();
  return found?.[1] ?? '';
};

/** The value of `property` in `declarations`, with its whitespace collapsed. */
export const declared = (declarations: string, property: string): string | undefined => {
  // A lookbehind rather than a start anchor: a declaration may follow a
  // comment, and `color` must not be found inside `background-color`.
  const found = new RegExp(String.raw`(?<![\w-])${property}:\s*([^;]+)`, 'u').exec(declarations);
  return found?.[1]?.replaceAll(/\s+/gu, ' ').trim();
};

/** A custom property declared on the Resource, as a number of `unit`. */
export const token = (name: string, unit = ''): number => {
  const value = declared(block('.canvas-resource'), name);
  expect(value, `no ${name} on .canvas-resource`).toBeDefined();
  expect(value?.endsWith(unit)).toBe(true);
  return Number.parseFloat(value ?? '');
};

/** A custom property declared anywhere in `tailwind.css`, as a number of `unit`. */
export const themeToken = (name: string, unit = ''): number => {
  const found = new RegExp(String.raw`(?<![\w-])${name}:\s*([^;]+)`, 'u').exec(themeStylesheet);
  expect(found, `no ${name} in tailwind.css`).not.toBeNull();
  const value = found?.[1]?.trim();
  expect(value?.endsWith(unit)).toBe(true);
  return Number.parseFloat(value ?? '');
};
