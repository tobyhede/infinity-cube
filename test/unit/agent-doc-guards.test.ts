import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';

let root: string;
const budget = resolve('scripts/check-agent-instructions.py');
const check = () => spawnSync('python3', [budget], { cwd: root, encoding: 'utf8' });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'agent-docs-'));
  writeFileSync(join(root, 'AGENTS.md'), 'é'.repeat(6144));
  symlinkSync('AGENTS.md', join(root, 'CLAUDE.md'));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

it('accepts exactly 12 KiB of UTF-8 instructions and rejects one more byte', () => {
  expect(check().status).toBe(0);
  writeFileSync(join(root, 'AGENTS.md'), 'é'.repeat(6144) + 'a');
  expect(check().stdout).toContain('12289');
  expect(check().status).toBe(1);
});

it('rejects a broken alias and a regular file replacing the alias', () => {
  const alias = join(root, 'CLAUDE.md');
  rmSync(alias);
  symlinkSync('missing', alias);
  expect(check().status).toBe(1);
  rmSync(alias);
  writeFileSync(alias, '');
  expect(check().status).toBe(1);
});

it('reports broken destinations from instructions and guides while ignoring other sources', () => {
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  mkdirSync(join(root, 'docs/agents'), { recursive: true });
  writeFileSync(join(root, 'AGENTS.md'), '# Start\n[guide](docs/agents/test.md#go)\n');
  writeFileSync(join(root, 'docs/agents/test.md'), '# Go\n[here](#go)\n');
  writeFileSync(join(root, 'README.md'), '[unrelated](missing)\n');
  const script = resolve('.scratch/requirements-rewrite/check-links.py');
  const links = () => spawnSync('python3', [script, root, '--agent-docs'], { encoding: 'utf8' });
  expect(links().status).toBe(0);
  writeFileSync(join(root, 'docs/agents/test.md'), '# Changed\n[here](#go)\n[file](missing.md)\n');
  const broken = links();
  expect(broken.status).toBe(1);
  expect(broken.stdout).toContain('AGENTS.md -> docs/agents/test.md#go');
  expect(broken.stdout).toContain('docs/agents/test.md -> #go');
  expect(broken.stdout).toContain('docs/agents/test.md -> missing.md');
});
