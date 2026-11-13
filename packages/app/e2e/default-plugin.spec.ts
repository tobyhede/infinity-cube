// `test` comes from ./fixtures, not @playwright/test — it carries the auto-use
// guards every suite shares.
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { encodeCompactUuid, isMissingKindId, uuidSchema, type UUID } from '@project/core';
import { decodeLoadedSpace } from '@project/persistence';
import { expect, test, type Page } from './fixtures';
import {
  authoringHandle,
  confirmDeletion,
  connectHandles,
  dragBy,
  nodeByTitle,
  presentControl,
  resourceActions,
  selectedCanvas,
  settled,
  stage,
  stageFrame,
} from './graph';
import { SEEDED_MAP_ID, seedPositionedMap } from './seed';
import { E2E_PORT_BASE, workerScopedViteCacheDir } from './projects';
import { directoryViteConfig } from '../database-vite-config';

/**
 * ADR 0142: a stored Resource whose kind names no plugin in this build is drawn
 * by the default plugin, its Title and that its kind is not available, and is
 * placed, connected, renamed, deleted and presented as any other Resource,
 * while its content stays as it was stored.
 */

const UNPLUGGED_ID = uuidSchema.parse('00000000-0000-4000-8000-0000000000e1');
const missing = (kind: string): string => {
  if (!isMissingKindId(kind)) throw new Error('A plugin in this build draws the kind');
  return kind;
};
const KIND = missing('vnd.example.diagram');
const CONTENT = { source: 'graph TD; A-->B', options: { direction: 'TD', nodes: [1, 2] } };
const MAP_CONTENT = { zoom: 2 };

/** Open a Space whose seeded Map holds its Markdown Resource and the unplugged `Diagram`, an Edge from it. */
async function openWithMissingPlugin(page: Page): Promise<{ spaceId: UUID; markdown: string }> {
  let markdownTitle = '';
  const seeded = await seedPositionedMap(
    page,
    'Missing',
    (snapshot) => {
      const markdown = snapshot.resources.find(({ document }) => document.kind === 'markdown');
      if (markdown === undefined) throw new Error('The opened Space holds no Markdown Resource.');
      markdownTitle = markdown.document.title;
      return {
        [markdown.id]: { x: 0, y: 0 },
        [UNPLUGGED_ID]: { x: 500, y: 0, content: MAP_CONTENT },
      };
    },
    [{ id: UNPLUGGED_ID, document: { title: 'Diagram', kind: KIND, content: CONTENT } }],
  );
  const markdown = seeded.snapshot.resources.find(({ id }) => id !== UNPLUGGED_ID);
  if (markdown === undefined) throw new Error('The seeded Space holds no Markdown Resource.');
  const commit = await page.request.post('/api/spaces', {
    data: {
      changes: [
        {
          kind: 'update',
          spaceId: seeded.snapshot.id,
          snapshot: {
            ...seeded.snapshot,
            document: {
              ...seeded.snapshot.document,
              maps: (seeded.snapshot.document.maps ?? []).map((m) => ({
                ...m,
                graphs: m.graphs.map((graph) => ({
                  ...graph,
                  edges: [{ from: UNPLUGGED_ID, to: markdown.id }],
                })),
              })),
            },
          },
          expectedRevision: seeded.revision,
        },
      ],
    },
  });
  expect(commit.ok()).toBe(true);
  await page.goto(`/spaces/${encodeCompactUuid(seeded.snapshot.id)}`);
  await expect(selectedCanvas(page)).toContainText('Missing');
  await settled(page);
  return { spaceId: seeded.snapshot.id, markdown: markdownTitle };
}

/** The stored Space, as the host answers it. */
async function storedSpace(page: Page, spaceId: UUID) {
  const response = await page.request.get(`/api/spaces/${spaceId}`);
  expect(response.ok()).toBe(true);
  return decodeLoadedSpace(await response.json());
}

const storedUnplugged = async (page: Page, spaceId: UUID) => {
  const { snapshot } = await storedSpace(page, spaceId);
  const seededMap = snapshot.document.maps?.find(({ id }) => id === SEEDED_MAP_ID);
  return {
    document: snapshot.resources.find(({ id }) => id === UNPLUGGED_ID)?.document,
    placement: seededMap?.positions[UNPLUGGED_ID],
    edges: seededMap?.graphs.flatMap(({ edges }) => edges) ?? [],
  };
};

test('a Resource whose plugin is missing opens, drawn by the default plugin', async ({ page }) => {
  await openWithMissingPlugin(page);

  const diagram = nodeByTitle(page, 'Diagram');
  await expect(diagram).toBeVisible();
  await expect(diagram.locator(`[data-missing-kind="${KIND}"]`)).toBeVisible();
  await expect(diagram).toContainText(`“${KIND}” is not available in this build.`);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('it moves, renames and connects as any Resource, its content kept as stored', async ({
  page,
}) => {
  const { spaceId, markdown } = await openWithMissingPlugin(page);
  const diagram = nodeByTitle(page, 'Diagram');

  await dragBy(page, diagram, 0, 160);
  await settled(page);
  await expect.poll(async () => (await storedUnplugged(page, spaceId)).placement?.y).toBe(160);

  await diagram.getByRole('button', { name: 'Edit Title Diagram' }).click();
  const title = page.getByRole('textbox', { name: 'Resource title' });
  await title.fill('Flow');
  await title.press('Enter');
  const flow = nodeByTitle(page, 'Flow');
  await expect(flow).toBeVisible();
  await expect
    .poll(async () => (await storedUnplugged(page, spaceId)).document?.title)
    .toBe('Flow');

  const source = nodeByTitle(page, markdown).first();
  // A handle reveals with the Resource it belongs to, and an unrevealed one
  // takes no pointer events, so the press that starts the connection hovers first.
  await page.keyboard.press('Escape');
  await settled(page);
  await source.hover();
  await connectHandles(
    page,
    authoringHandle(source, 'source', 'bottom'),
    authoringHandle(flow, 'target', 'left'),
  );
  await expect
    .poll(async () => (await storedUnplugged(page, spaceId)).edges)
    .toContainEqual({
      from: expect.any(String),
      to: UNPLUGGED_ID,
    });

  const stored = await storedUnplugged(page, spaceId);
  expect(stored.document).toEqual({ title: 'Flow', kind: KIND, content: CONTENT });
  expect(stored.placement?.content).toEqual(MAP_CONTENT);
});

test('it presents, drawn by the default plugin on the Stage', async ({ page }) => {
  await openWithMissingPlugin(page);

  await presentControl(page).click();
  await expect(stage(page)).toBeVisible();
  await expect(stageFrame(page)).toContainText(`“${KIND}” is not available in this build.`);
});

test('it is deleted from its Space as any Resource', async ({ page }) => {
  const { spaceId } = await openWithMissingPlugin(page);

  await (
    await resourceActions(page, 'Diagram')
  )
    .getByRole('menuitem', { name: 'Delete from Space' })
    .click();
  await confirmDeletion(page, 'Delete Diagram From Space?');

  await expect(nodeByTitle(page, 'Diagram')).toHaveCount(0);
  await expect.poll(async () => (await storedUnplugged(page, spaceId)).document).toBeUndefined();
});

/** A Space the tracked fixture does not refer to, which only a missing plugin holds. */
const HELD_SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-0000000000f0');
const HELD_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-0000000000f1');
const HELD_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-0000000000f2');
const HELD_UNPLUGGED_ID = uuidSchema.parse('00000000-0000-4000-8000-0000000000f3');
const appRoot = fileURLToPath(new URL('..', import.meta.url));

/**
 * The tracked fixture with one Space added that nothing refers to, holding the
 * aggregate's one Resource whose plugin is missing: Import holds that Space
 * rather than refusing it (ADR 0142), which no commit can make.
 */
async function writeHeldAggregate(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'infinity-cube-held-'));
  await cp(fileURLToPath(new URL('../fixture', import.meta.url)), directory, { recursive: true });
  const held = join(directory, HELD_SPACE_ID);
  await mkdir(join(held, 'resources'), { recursive: true });
  const space = {
    version: 1,
    id: HELD_SPACE_ID,
    title: 'Held',
    defaultMap: HELD_MAP_ID,
    maps: [
      {
        id: HELD_MAP_ID,
        title: 'Held map',
        kind: 'positioned',
        positions: { [HELD_UNPLUGGED_ID]: { x: 0, y: 0 } },
        graphs: [{ id: HELD_GRAPH_ID, title: 'Graph 1', edges: [] }],
      },
    ],
  };
  const resource = { id: HELD_UNPLUGGED_ID, title: 'Diagram', kind: KIND, content: CONTENT };
  await writeFile(join(held, 'space.json'), `${JSON.stringify(space, null, 2)}\n`);
  await writeFile(
    join(held, 'resources', `${HELD_UNPLUGGED_ID}.json`),
    `${JSON.stringify(resource, null, 2)}\n`,
  );
  return directory;
}

/** This file's tests over a host that imported {@link writeHeldAggregate}'s directory. */
const heldTest = test.extend({
  e2eServer: async ({ browserName: _browserName }, run, testInfo) => {
    const directory = await writeHeldAggregate();
    const server = await createServer({
      ...directoryViteConfig(directory),
      configFile: false,
      root: appRoot,
      cacheDir: workerScopedViteCacheDir(appRoot, testInfo.workerIndex),
      server: { host: '127.0.0.1', port: E2E_PORT_BASE + testInfo.workerIndex, strictPort: true },
    });
    try {
      await server.listen();
      await run(server);
    } finally {
      await server.close();
      await rm(directory, { recursive: true });
    }
  },
});

heldTest(
  'deleting the last Resource of a missing kind is refused while it may hold a Space',
  async ({ page }) => {
    await page.goto(`/spaces/${encodeCompactUuid(HELD_SPACE_ID)}`);
    await expect(selectedCanvas(page)).toContainText('Held map');
    await settled(page);
    const before = await storedSpace(page, HELD_SPACE_ID);

    await (
      await resourceActions(page, 'Diagram')
    )
      .getByRole('menuitem', { name: 'Delete from Space' })
      .click();
    await confirmDeletion(page, 'Delete Diagram From Space?');

    await expect(
      page.getByText(
        `“${KIND}” is not available in this build, and a Space nothing else refers to may depend on this Resource, so it cannot be deleted.`,
      ),
    ).toBeVisible();
    // Refused before the working state changed: the Resource is still drawn,
    // and nothing was committed.
    await expect(nodeByTitle(page, 'Diagram')).toBeVisible();
    await settled(page);
    expect((await storedSpace(page, HELD_SPACE_ID)).revision).toBe(before.revision);

    // A later Edit of the Space still commits.
    await nodeByTitle(page, 'Diagram').getByRole('button', { name: 'Edit Title Diagram' }).click();
    const title = page.getByRole('textbox', { name: 'Resource title' });
    await title.fill('Flow');
    await title.press('Enter');
    await expect
      .poll(
        async () =>
          (await storedSpace(page, HELD_SPACE_ID)).snapshot.resources.find(
            ({ id }) => id === HELD_UNPLUGGED_ID,
          )?.document.title,
      )
      .toBe('Flow');
  },
);
