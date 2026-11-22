import { fileURLToPath } from 'node:url';
import { expect, test, type BrowserContext } from '@playwright/test';
import { newUuid } from '@project/core';
import { createServer } from 'vite';
import { SqlSpaceRepository } from '../../src/persistence/sql-space-repository';
import { createSqliteDatabase, requireConfiguredSqlitePath } from '../../src/sqlite/db';
import { sqliteSqlStore } from '../../src/sqlite/sql-store';
import { clearSqliteContent } from '../support/clear-sqlite-content';
import {
  dragResourceAndCapturePosition,
  expectRestartProofExport,
  expectResourceRestoredAt,
  openStoredSpace,
  restartProofFixture,
} from '../support/restart-proof';
import {
  RESTART_PROOF_HOST_VARIABLE,
  restartProofHostFromEnvironment,
  startCommandHost,
  type StartedRestartProofHost,
} from '../support/restart-proof-host';
import { runWithCleanup } from '../support/run-with-cleanup';
import { SQLITE_E2E_PORT } from '../../packages/app/e2e/projects';

const appRoot = fileURLToPath(new URL('../../packages/app', import.meta.url));
const configFile = fileURLToPath(
  new URL('../../packages/app/vite.sqlite.config.ts', import.meta.url),
);

const startViteHost = async (): Promise<StartedRestartProofHost> => {
  const server = await createServer({
    root: appRoot,
    configFile,
    // Below the default suite's `E2E_PORT_BASE + workerIndex` range and
    // distinct from the PostgreSQL proof's own fixed port, so this project can
    // run beside `pnpm e2e` and `pnpm e2e:postgres`. `strictPort` turns any
    // overlap into a failure that blames the wrong resource.
    server: { host: '127.0.0.1', port: SQLITE_E2E_PORT, strictPort: true },
  });
  try {
    await server.listen();
    const baseURL = server.resolvedUrls?.local[0];
    if (baseURL === undefined) throw new Error('Vite did not publish a loopback URL');
    return { baseURL, stop: () => server.close() };
  } catch (error) {
    // The caller only learns of a server it can close on success, so a failure
    // between here and the return would strand one holding the fixed port —
    // and the retry of a `strictPort` host then fails for the wrong reason.
    await server.close();
    throw error;
  }
};

// The Vite host unless `INFINITY_CUBE_RESTART_PROOF_HOST` names a command
// (`test/support/restart-proof-host.ts`), so the same proof runs against
// another runtime's host over the same file.
const host = restartProofHostFromEnvironment(process.env[RESTART_PROOF_HOST_VARIABLE]);

// Every host process this test has spawned, killed after it however it ended.
// A test that times out while a host starts never learns of that host from
// `startHost`, and its own cleanup may never run, but Playwright still runs
// `afterEach`; killing a host that has already exited does nothing.
const spawnedHosts: (() => void)[] = [];
test.afterEach(() => {
  for (const kill of spawnedHosts.splice(0)) kill();
});

const startHost = (): Promise<StartedRestartProofHost> =>
  host.kind === 'vite'
    ? startViteHost()
    : startCommandHost(host.command, { onSpawn: (kill) => spawnedHosts.push(kill) });

test('a SQLite-backed edit survives a fresh host', async ({ browser }) => {
  // `SQLITE_PATH` as the job (or a developer's own export) provides it —
  // already migrated, by `test:integration:sqlite` in CI or by
  // `pnpm db:migrate:sqlite` locally. `requireConfiguredSqlitePath` is the one
  // message a host and this proof both report for an unset path.
  const path = requireConfiguredSqlitePath();
  const spaceId = newUuid();
  const resourceId = newUuid();
  const mapId = newUuid();
  const graphId = newUuid();
  const title = `SQLite restart ${spaceId}`;
  let firstHost: StartedRestartProofHost | undefined;
  let secondHost: StartedRestartProofHost | undefined;
  let firstContext: BrowserContext | undefined;
  let secondContext: BrowserContext | undefined;
  let spaceRemains: boolean | undefined;
  let seeded = false;

  const proof = async (): Promise<void> => {
    // Seeded through a connection of its own, closed before either host opens
    // the same file: a second live writer against one SQLite file is
    // unsupported, so this proof never holds more than one connection to
    // it open at a time rather than trusting two to coexist.
    const seedDatabase = createSqliteDatabase(path);
    try {
      // Before the fixture as well as after it — as the PostgreSQL proof does,
      // and for its reason: `initializeAggregate` leaves an initialized
      // repository exactly as it is (ADR 0078), so a file still holding a Space
      // answers `already-initialized`, writes nothing, and sends the drag below
      // looking for a Resource that was never stored. The cleanup that ends this
      // test handles this run failing; this handles a run that never reached
      // that cleanup at all — a killed process, a CI timeout.
      await clearSqliteContent(seedDatabase);
      const seedRepository = new SqlSpaceRepository(sqliteSqlStore(seedDatabase));
      // The Map is part of the fixture, and has to be — see the matching
      // comment in `postgres-persistence.spec.ts`, which this mirrors exactly:
      // a mapless Space's first working load would mint an *empty*
      // Map (ADR 0079), stranding the fixture's Resource off every canvas.
      const fixture = restartProofFixture({ spaceId, resourceId, mapId, graphId, title });
      const initialized = await seedRepository.initializeAggregate({
        metaSpaceId: spaceId,
        spaces: [fixture],
      });
      if (initialized.kind !== 'initialized') {
        throw new Error(`The fixture aggregate was not established: ${initialized.kind}`);
      }
      seeded = true;
    } finally {
      await seedDatabase.close();
    }

    const first = await startHost();
    firstHost = first;
    const openedFirst = await openStoredSpace(browser, first.baseURL, spaceId, title);
    firstContext = openedFirst.context;
    const durablePosition = await dragResourceAndCapturePosition(
      openedFirst.page,
      'Restart resource',
      0,
      220,
      '1',
    );

    await firstContext.close();
    firstContext = undefined;
    // Cleared before it is stopped, so a stop that fails is not tried again
    // below on a host that has already exited.
    firstHost = undefined;
    await first.stop();

    // The two hosts run in sequence, never together. Closing the first Vite
    // server does not close its SQLite runtime's database — neither
    // `sqlite-http-runtime.ts` nor `vite-space-http-plugin.ts` has a close
    // hook — so what keeps this safe is that no request is in flight, not that
    // the handle is gone. A host started by command has exited, its process
    // gone, before `stop` answers.
    const afterFirstDatabase = createSqliteDatabase(path);
    try {
      const stored = await new SqlSpaceRepository(sqliteSqlStore(afterFirstDatabase)).loadSpace(
        spaceId,
      );
      expect(stored?.revision).toBe(1n);
    } finally {
      await afterFirstDatabase.close();
    }

    const second = await startHost();
    secondHost = second;
    const openedSecond = await openStoredSpace(browser, second.baseURL, spaceId, title);
    secondContext = openedSecond.context;
    await expectResourceRestoredAt(openedSecond.page, 'Restart resource', durablePosition, '1');

    await secondContext.close();
    secondContext = undefined;
    secondHost = undefined;
    await second.stop();

    // Durability is only half of what the aggregate owes; the other half is
    // that it can leave again, at the revision the drag actually reached. An
    // export taken at revision 0 would still write a directory that reads back
    // and still record *something*, so the assertion that matters is the
    // projected revision: `markExported` runs after the bytes land, and 1n is
    // what says it recorded the edit rather than the fixture.
    const exportDatabase = createSqliteDatabase(path);
    try {
      const exportRepository = new SqlSpaceRepository(sqliteSqlStore(exportDatabase));
      await expectRestartProofExport(
        exportRepository,
        restartProofFixture({ spaceId, resourceId, mapId, graphId, title }),
      );
    } finally {
      await exportDatabase.close();
    }
  };

  // Every step runs whatever failed before it, and the failure reported is the
  // proof's own or else the first step's (`test/support/run-with-cleanup.ts`):
  // a host that fails to stop neither hides why the proof failed nor skips the
  // file's cleanup.
  await runWithCleanup(proof, [
    async () => {
      await secondContext?.close();
    },
    async () => {
      await firstContext?.close();
    },
    async () => {
      await secondHost?.stop();
    },
    async () => {
      await firstHost?.stop();
    },
    // Clean up the Space and Resource this proof minted, as the PostgreSQL proof
    // does — so a rerun against the same `SQLITE_PATH` (a developer iterating
    // without re-migrating) meets an empty file rather than an
    // already-initialized one. Here, after every host and connection above has
    // closed or failed to, so a failed durability or export step still cleans up.
    async () => {
      if (!seeded) return;
      const cleanupDatabase = createSqliteDatabase(path);
      try {
        await clearSqliteContent(cleanupDatabase);
        spaceRemains =
          (await new SqlSpaceRepository(sqliteSqlStore(cleanupDatabase)).loadSpace(spaceId)) !==
          undefined;
      } finally {
        await cleanupDatabase.close();
      }
    },
  ]);

  expect(spaceRemains).toBe(false);
});
