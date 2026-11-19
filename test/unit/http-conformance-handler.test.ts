import { newUuid } from '@project/core';
import {
  createSpaceHost,
  MemorySpaceRepository,
  type SpaceHostApplication,
} from '@project/aggregate';
import {
  AggregateInvariantError,
  PersistenceUnavailableError,
  type RepositoryCommitResult,
} from '@project/persistence';
import { afterAll, vi } from 'vitest';
import {
  fixtureCopy,
  removeTemporaryDirectories,
  STAND_IN_BUILD,
  standInBuild,
} from '../../conformance/http/fixture';
import type { ConformanceHost } from '../../conformance/http/host';
import {
  describeStoreConditionConformance,
  type StoreCondition,
} from '../../conformance/http/store-condition-cases';
import { describeWireConformance, type OpenedHost } from '../../conformance/http/wire-cases';
import { createDesktopHandler, sessionCookieName } from '../../src/desktop/desktop-handler';
import { builtFiles, desktopContentSecurityPolicy } from '../../src/desktop/static-files';
import { startRun } from '../../src/run/run';

/**
 * The HTTP conformance suite (`conformance/http/README.md`) against a
 * `Request -> Response` function rather than a host process: the production
 * Node host's handler (`src/desktop/desktop-handler.ts`), composed in process
 * over a run of a fixture copy, or over a store that cannot serve.
 */

const HOST = '127.0.0.1:43210';
const SECRET = 'conformance-launch-secret';

afterAll(removeTemporaryDirectories);

/** The handler over `host`, with every request carrying the `Host` and session cookie it requires. */
const handlerHost = async (application: SpaceHostApplication): Promise<ConformanceHost> => {
  const built = await standInBuild();
  const page = STAND_IN_BUILD.page;
  const handler = createDesktopHandler({
    host: application,
    staticFile: builtFiles(built),
    page: { bytes: new TextEncoder().encode(page), contentType: 'text/html; charset=utf-8' },
    contentSecurityPolicy: desktopContentSecurityPolicy(page),
    secret: SECRET,
    expectedHost: () => HOST,
  });
  return {
    origin: `http://${HOST}`,
    exchange: (request) => {
      const headers = new Headers(request.headers);
      headers.set('host', HOST);
      headers.set('cookie', `${sessionCookieName(HOST)}=${SECRET}`);
      return handler(new Request(request, { headers }));
    },
  };
};

describeWireConformance({
  name: 'production Node host handler',
  builtApplication: 'stand-in',
  open: async (): Promise<OpenedHost> => {
    const started = await startRun(await fixtureCopy(), {
      newId: newUuid,
      schedule: () => () => undefined,
      report: () => undefined,
    });
    if (started.kind !== 'running') throw new Error(`Expected a run, got ${started.kind}`);
    const { run } = started;
    return {
      host: await handlerHost(run.host),
      close: async () => {
        await run.stop();
      },
    };
  },
});

/** A memory store whose every read and write fails as `failure` says. */
class FailingRepository extends MemorySpaceRepository {
  readonly #failure: () => Error;

  constructor(failure: () => Error) {
    super();
    this.#failure = failure;
  }

  override listSpaces(): Promise<never> {
    return Promise.reject(this.#failure());
  }

  override loadSpace(): Promise<never> {
    return Promise.reject(this.#failure());
  }

  override loadAggregate(): Promise<never> {
    return Promise.reject(this.#failure());
  }

  override commit(): Promise<RepositoryCommitResult> {
    return Promise.reject(this.#failure());
  }
}

const repositoryIn = (condition: StoreCondition): MemorySpaceRepository => {
  switch (condition) {
    case 'uninitialized':
      return new MemorySpaceRepository();
    case 'unavailable':
      return new FailingRepository(() => new PersistenceUnavailableError('connection refused'));
    case 'broken-stored-state':
      return new FailingRepository(() => new AggregateInvariantError('stored state is broken'));
  }
};

describeStoreConditionConformance({
  name: 'production Node host handler',
  open: async (condition) => {
    // The host reports each failure to the operator on standard error; the case reads the answer.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    return {
      host: await handlerHost(createSpaceHost(repositoryIn(condition), newUuid)),
      close: () => Promise.resolve(),
    };
  },
});
