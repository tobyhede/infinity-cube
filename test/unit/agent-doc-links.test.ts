import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';

const checker = resolve('.scratch/requirements-rewrite/check-links.py');
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'agent-guide-links-'));
  execFileSync('git', ['init', '--quiet'], { cwd: root });
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

function check(instructions: string) {
  writeFileSync(join(root, 'AGENTS.md'), instructions);
  return spawnSync('python3', [checker, root, '--agent-docs'], { encoding: 'utf8' });
}

it.each([
  ['[procedure][owner]\n\n[owner]: missing.md#steps', 'missing.md#steps'],
  ['[procedure](<missing guide.md>)', 'missing guide.md'],
])('reports the missing destination in %s', (instructions, target) => {
  const result = check(instructions);
  expect(result.stdout).toContain(`AGENTS.md -> ${target}`);
  expect(result.status).toBe(1);
});

it('resolves a same-page link to a Setext heading', () => {
  expect(check('Steps\n-----\n\n[procedure](#steps)').status).toBe(0);
});

it('ignores example links inside tilde fences', () => {
  expect(check('~~~md\n[example](missing.md)\n~~~').status).toBe(0);
});
