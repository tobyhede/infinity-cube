import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { uuidSchema } from '@project/core';
import { HttpSpaceBackend } from '@project/http';
import { afterEach, describe, expect, it } from 'vitest';
import { readSingleSpace } from '../../src/aggregate-directory';
import {
  sidecarAnnouncementSchema,
  type SidecarAnnouncement,
} from '../../src/desktop/announcement';

/**
 * The desktop sidecar as the desktop shell drives it (ADR 0155): started on a
 * directory, announcing one JSON line, reached through the launch secret, and
 * stopped by closing its standard input, on which it writes the last edit.
 */

const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const FIXTURE = join(REPOSITORY_ROOT, 'packages/app/fixture');
const META_SPACE_ID = '00000000-0000-4000-8000-000000000040';
const START_TIMEOUT_MS = 60_000;

const roots: string[] = [];
const children: ChildProcessWithoutNullStreams[] = [];

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const temporaryRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'infinity-cube-sidecar-'));
  roots.push(root);
  return root;
};

/** A stand-in for the built application: the sidecar needs only its page. */
const builtApplication = async (root: string): Promise<string> => {
  const built = join(root, 'built');
  await mkdir(built);
  await writeFile(join(built, 'index.html'), '<!doctype html><div id="root"></div>\n');
  return built;
};

const startSidecar = (directory: string, built: string) => {
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', 'src/desktop/desktop-process.ts', directory, built],
    { cwd: REPOSITORY_ROOT },
  );
  children.push(child);
  const exited = new Promise<number | null>((resolve) => child.once('exit', resolve));
  const announcement = new Promise<SidecarAnnouncement>((resolve, reject) => {
    const lines = createInterface({ input: child.stdout });
    lines.once('line', (line) => resolve(sidecarAnnouncementSchema.parse(JSON.parse(line))));
    child.once('exit', (code) => reject(new Error(`exited ${String(code)} before announcing`)));
  });
  return { child, exited, announcement };
};

const listening = (announcement: SidecarAnnouncement) => {
  if (announcement.kind !== 'listening') {
    throw new Error(`Expected a listening announcement, got ${announcement.kind}`);
  }
  return announcement;
};

/** Open a sidecar on a copy of the fixture, and commit one edit through its window. */
const sidecarWithAnEdit = async () => {
  const root = await temporaryRoot();
  const directory = join(root, 'talk');
  await cp(FIXTURE, directory, { recursive: true });
  const { child, exited, announcement } = startSidecar(directory, await builtApplication(root));
  const { port, secret } = listening(await announcement);
  const origin = `http://127.0.0.1:${String(port)}`;

  const launched = await fetch(`${origin}/?launch=${secret}`, { redirect: 'manual' });
  expect(launched.status).toBe(302);
  const cookie = (launched.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

  const backend = new HttpSpaceBackend(origin, {
    fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set('cookie', cookie);
      return fetch(input, { ...init, headers });
    },
  });
  const loaded = await backend.loadSpace(uuidSchema.parse(META_SPACE_ID));
  if (loaded === undefined) throw new Error('Expected the Meta Space');
  const committed = await backend.commit({
    changes: [
      {
        kind: 'update',
        spaceId: uuidSchema.parse(META_SPACE_ID),
        snapshot: {
          ...loaded.snapshot,
          document: { ...loaded.snapshot.document, title: 'From the window' },
        },
        expectedRevision: loaded.revision,
      },
    ],
  });
  expect(committed.kind).toBe('committed');
  return { child, exited, directory };
};

const writtenTitle = async (directory: string): Promise<string> =>
  (await readSingleSpace(join(directory, META_SPACE_ID))).document.title;

describe('The desktop sidecar', () => {
  it(
    'writes an edit to the directory and exits zero when its standard input closes',
    async () => {
      const { child, exited, directory } = await sidecarWithAnEdit();
      child.stdin.end();
      expect(await exited).toBe(0);
      expect(await writtenTitle(directory)).toBe('From the window');
    },
    START_TIMEOUT_MS,
  );

  it(
    'writes an edit to the directory and exits zero on SIGHUP, as a run does',
    async () => {
      const { child, exited, directory } = await sidecarWithAnEdit();
      child.kill('SIGHUP');
      expect(await exited).toBe(0);
      expect(await writtenTitle(directory)).toBe('From the window');
    },
    START_TIMEOUT_MS,
  );

  it(
    'announces a refusal and exits non-zero for a directory it cannot run',
    async () => {
      const root = await temporaryRoot();
      const { exited, child } = startSidecar(join(root, 'missing'), await builtApplication(root));
      const lines = createInterface({ input: child.stdout });
      const first = await new Promise<string>((resolve) => lines.once('line', resolve));
      expect(sidecarAnnouncementSchema.parse(JSON.parse(first))).toMatchObject({ kind: 'refused' });
      expect(await exited).toBe(1);
    },
    START_TIMEOUT_MS,
  );
});
