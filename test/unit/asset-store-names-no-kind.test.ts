import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { maskTsComments } from '../support/structural-scan';

/**
 * ADR 0142: the host stores and Exports every asset without naming a kind. A
 * reference is found by walking `content` for whole string values, so a
 * Resource whose plugin is missing has its assets carried as readily as any
 * other. This reads the server-side modules that store, Import and Export
 * assets and fails one that names a kind, by its module or by its id.
 */
const SERVER_SIDE = [
  'src/aggregate-directory',
  'src/export',
  'src/import',
  'src/persistence',
  'src/prisma/sql-store.ts',
  'src/sqlite/sql-store.ts',
  'packages/aggregate/src/aggregate-file.ts',
  'packages/aggregate/src/assets.ts',
  'packages/aggregate/src/memory-space-repository.ts',
  'packages/http/src/backend.ts',
  'packages/http/src/index.ts',
  'packages/persistence/src/assets.ts',
  'packages/persistence/src/http-protocol.ts',
];

const KINDS = ['ur', 'image', 'markdown', 'reference', 'space'] as const;

/** A kind reached by its module, or written as its id in quotes. */
const NAMES_A_KIND = new RegExp(
  `\\b(?:${KINDS.join('|')})Kind\\b|['"](?:${KINDS.join('|')})['"]|/kinds/`,
  'u',
);

const sourcesUnder = (path: string): readonly string[] => {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const inside = join(path, entry.name);
    if (entry.isDirectory()) return sourcesUnder(inside);
    return /\.tsx?$/u.test(entry.name) ? [inside] : [];
  });
};

describe('the asset store names no kind', () => {
  it('recognises a kind named by its module, its id or its module path', () => {
    expect(NAMES_A_KIND.test('document.kind === imageKind.id')).toBe(true);
    expect(NAMES_A_KIND.test("if (kind === 'markdown')")).toBe(true);
    expect(NAMES_A_KIND.test("import { x } from '@project/core/src/kinds/image';")).toBe(true);
    expect(NAMES_A_KIND.test('const spaces = loadSpace(snapshot);')).toBe(false);
  });

  it.each(SERVER_SIDE.flatMap(sourcesUnder))(
    '%s stores and Exports without naming a kind',
    (file) => {
      const source = maskTsComments(readFileSync(file, 'utf8'));
      expect(source.split('\n').filter((line) => NAMES_A_KIND.test(line))).toEqual([]);
    },
  );
});
