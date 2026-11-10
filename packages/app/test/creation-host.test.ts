import { act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { isOfKind, uuidSchema, type JsonValue } from '@project/core';
import type { CreationData } from '@project/resource-api/view';
import {
  NotCreatableContent,
  type HostCreationHost,
  type HostNew,
  type PluginCreationEntry,
} from '@project/ui';
import { composeApp } from '../src/compose-app';
import type { OpenSpace } from '../src/open-spaces';
import {
  createCreationFlights,
  createCreationHost,
  dataCreation,
  decideCreate,
  type CreateFacts,
  type CreationFlights,
  type CreationGesture,
  type OfferedCreation,
} from '../src/plugin-host/creation';
import { createPluginGate } from '../src/plugin-host/plugin-gate';
import {
  MAP_ID,
  OTHER_MAP_ID,
  SPACE_ID,
  derivationSnapshot,
  openDerivationSpace,
} from './app-derivation-fixtures';
import { textAsset } from './markdown-texts';
import { mintingIds } from './minting';
import { openTestSpace } from './opened-space';

/**
 * The creation host (ADR 0142): which plugin arriving data goes to, what one
 * `create` becomes, and the shell that carries a creation out over a real
 * composition.
 */

const CREATED = uuidSchema.parse('00000000-0000-4000-8000-0000000000c1');
const SECOND = uuidSchema.parse('00000000-0000-4000-8000-0000000000c2');
const AT = { x: 30, y: 40 };
const EMPTY_TEXT: JsonValue = { url: textAsset('') };

const ignore = (): void => undefined;

const dataEntry = (
  kind: PluginCreationEntry['kind'],
  types: readonly string[],
  accepts?: (data: CreationData) => boolean,
): PluginCreationEntry => ({
  kind,
  name: `${kind} Resource`,
  creation: { from: 'data', types, accepts, run: ignore },
});

const png = (): CreationData => ({
  kind: 'files',
  files: [new File([], 'a.png', { type: 'image/png' })],
});

describe('which creation arriving data goes to', () => {
  it('prefers a plugin naming the media type exactly over one taking it by a wildcard', () => {
    const entries = [dataEntry('markdown', ['*/*']), dataEntry('image', ['image/png'])];

    expect(dataCreation(entries, png())?.kind).toBe('image');
  });

  it('takes `type/*` as a wildcard for that type alone', () => {
    const entries = [dataEntry('markdown', ['text/*']), dataEntry('image', ['image/*'])];

    expect(dataCreation(entries, png())?.kind).toBe('image');
  });

  it('lets build order decide between two equal matches', () => {
    const entries = [dataEntry('image', ['image/*']), dataEntry('markdown', ['image/*'])];

    expect(dataCreation(entries, png())?.kind).toBe('image');
  });

  it('passes over a plugin that does not accept the data', () => {
    const entries = [
      dataEntry('image', ['image/png'], () => false),
      dataEntry('markdown', ['*/*']),
    ];

    expect(dataCreation(entries, png())?.kind).toBe('markdown');
  });

  it('matches a pasted URL as a URI list', () => {
    const url: CreationData = { kind: 'url', url: 'https://example.com' };

    expect(dataCreation([dataEntry('image', ['text/uri-list'])], url)?.kind).toBe('image');
    expect(dataCreation([dataEntry('image', ['image/png'])], url)).toBeUndefined();
  });
});

const FACTS: CreateFacts = {
  kind: 'markdown',
  available: true,
  exclusive: false,
  offered: undefined,
};
const named = (): JsonValue => ({ spaceId: 'x' });

describe('what one create becomes', () => {
  it('refuses unavailable, then exclusive work', () => {
    const all = { ...FACTS, available: false, exclusive: true };

    expect(decideCreate([], all)).toEqual({ kind: 'refused', refusal: 'unavailable' });
    expect(decideCreate([], { ...FACTS, exclusive: true })).toEqual({
      kind: 'refused',
      refusal: 'exclusive',
    });
  });

  it('refuses an item its plugin’s schema refused only after its own checks', () => {
    const refused: readonly HostNew[] = [{ content: EMPTY_TEXT }, { notCreatable: true }];

    expect(decideCreate(refused, { ...FACTS, available: false })).toEqual({
      kind: 'refused',
      refusal: 'unavailable',
    });
    expect(decideCreate(refused, { ...FACTS, exclusive: true })).toEqual({
      kind: 'refused',
      refusal: 'exclusive',
    });
    expect(decideCreate(refused, FACTS)).toEqual({ kind: 'refused', refusal: 'not-creatable' });
  });

  it('changes nothing for no items', () => {
    expect(decideCreate([], FACTS)).toEqual({ kind: 'unchanged' });
  });

  it('makes one Edit of every plain item, of the creation’s kind', () => {
    const items: readonly HostNew[] = [{ content: EMPTY_TEXT }, { title: 'B', content: 1 }];

    expect(decideCreate(items, FACTS)).toEqual({
      kind: 'edit',
      items: [
        { kind: 'markdown', title: undefined, content: EMPTY_TEXT },
        { kind: 'markdown', title: 'B', content: 1 },
      ],
    });
  });

  it('reaches a new Space only when the item asks for one', () => {
    expect(decideCreate([{ newSpace: true, contentFor: named }], FACTS)).toEqual({
      kind: 'new-space',
      title: undefined,
      contentFor: named,
    });
    expect(decideCreate([{ contentFor: named }], FACTS)).toEqual({
      kind: 'refused',
      refusal: 'not-creatable',
    });
  });

  it('links the Space a list offered', () => {
    const offered = { spaceId: 'elsewhere', title: 'Elsewhere' };

    expect(decideCreate([{ contentFor: named }], { ...FACTS, offered })).toEqual({
      kind: 'link',
      space: offered,
      title: undefined,
      contentFor: named,
    });
  });

  it('refuses a Space item beside any other, since one coordination makes one Space', () => {
    const items: readonly HostNew[] = [
      { newSpace: true, contentFor: named },
      { content: EMPTY_TEXT },
    ];

    expect(decideCreate(items, FACTS)).toEqual({ kind: 'refused', refusal: 'not-creatable' });
  });
});

// ---- The shell, over a real composition

type Run = (host: HostCreationHost) => void | Promise<void>;

const offered = (
  kind: PluginCreationEntry['kind'],
  run: Run,
  from: OfferedCreation<Run>['from'] = 'dock',
): OfferedCreation<Run> => ({
  kind,
  from,
  name: `${kind === 'markdown' ? 'Markdown' : 'Space'} Resource`,
  notCreated: `${kind === 'markdown' ? 'Markdown' : 'Space'} Resource not created`,
  run,
});

const askFor =
  (items: readonly HostNew[]): Run =>
  async (host) => {
    await host.create(items);
  };

function hosted(
  opened: OpenSpace,
  gate = createPluginGate(),
  creating: ReadonlySet<string>[] = [],
  flights: CreationFlights = createCreationFlights((kinds) => creating.push(kinds)),
  mapId = MAP_ID,
) {
  const reportBreak = vi.fn();
  const host = createCreationHost({
    app: opened.app,
    session: opened.session,
    spaceResources: opened.spaceResources,
    gate,
    assets: {
      url: (ref) => ref,
      read: () => Promise.resolve({ refused: 'none' }),
      measure: () => Promise.resolve(undefined),
    },
    mapId,
    reportBreak,
    flights,
  });
  return { host, reportBreak, creating, flights };
}

const gesture = (extra: Partial<CreationGesture> = {}): CreationGesture => ({
  place: () => ({ anchor: AT, placement: 'exact' }),
  ...extra,
});

/** A Dock press: the one gesture that is single flight. */
const press = (): CreationGesture => gesture({ flight: true });

const placedOn = (opened: OpenSpace, mapId = MAP_ID): readonly string[] =>
  Object.keys(
    opened.session.getState().working.document.maps?.find(({ id }) => id === mapId)?.positions ??
      {},
  );

const notice = (opened: OpenSpace) =>
  opened.app.commandOutcomes.getState().notices.get('resource-create') ?? null;

describe('a creation the host carries out', () => {
  it('places every Resource asked for in one Edit at the gesture, and continues into the first one’s Title', async () => {
    const opened = openDerivationSpace(mintingIds(CREATED, SECOND));
    const { host } = hosted(opened);
    const revision = opened.session.getState().working;

    await host.run(
      offered('markdown', askFor([{ content: EMPTY_TEXT }, { content: EMPTY_TEXT }])),
      gesture(),
    );

    const working = opened.session.getState().working;
    expect(working).not.toBe(revision);
    expect(placedOn(opened)).toEqual(expect.arrayContaining([CREATED, SECOND]));
    expect(
      opened.session.getState().working.document.maps?.find(({ id }) => id === MAP_ID)?.positions[
        CREATED
      ],
    ).toMatchObject(AT);
    expect(opened.app.continuation.getState().pending).toEqual({
      target: { kind: 'resource', resourceId: CREATED },
      select: true,
      then: 'rename',
    });
    expect(notice(opened)).toBeNull();
  });

  it('creates nothing, and says nothing, for a create no longer available', async () => {
    const opened = openDerivationSpace(mintingIds(CREATED));
    const { host } = hosted(opened);

    await host.run(
      offered('markdown', askFor([{ content: EMPTY_TEXT }])),
      gesture({ available: () => false }),
    );

    expect(placedOn(opened)).not.toContain(CREATED);
    expect(notice(opened)).toBeNull();
  });

  it('says a creation exclusive work withdraws, under the plugin’s name', async () => {
    const opened = openDerivationSpace(mintingIds(CREATED));
    const { host } = hosted(opened, { ...createPluginGate(), withdraws: () => true });

    await host.run(offered('markdown', askFor([{ content: EMPTY_TEXT }])), gesture());

    expect(placedOn(opened)).not.toContain(CREATED);
    expect(notice(opened)?.title).toBe('Markdown Resource not created');
  });

  it('shows what a plugin reports in its own words', async () => {
    const opened = openDerivationSpace();
    const { host } = hosted(opened);

    await host.run(
      offered('markdown', (creation) => creation.report('Nothing to make.')),
      gesture(),
    );

    expect(notice(opened)).toEqual({
      title: 'Markdown Resource not created',
      message: 'Nothing to make.',
    });
  });

  it('hands a refusal to the surface that keeps its own sentence, and publishes no notice', async () => {
    const opened = openDerivationSpace();
    const { host } = hosted(opened);
    const settle = vi.fn();

    await host.run(
      offered('markdown', (creation) => creation.report('Nothing to make.')),
      gesture({ settle }),
    );

    expect(settle).toHaveBeenCalledWith('Nothing to make.');
    expect(notice(opened)).toBeNull();
  });

  it('places on the Map the gesture was made on, and owes no Title once another is drawn', async () => {
    const opened = openDerivationSpace(mintingIds(CREATED));
    const { host } = hosted(opened);
    let release: () => void = ignore;
    const waited = new Promise<void>((resolve) => {
      release = resolve;
    });

    const running = host.run(
      offered('markdown', async (creation) => {
        await waited;
        await creation.create([{ content: EMPTY_TEXT }]);
      }),
      gesture(),
    );
    opened.app.navigation.selectMap(OTHER_MAP_ID);
    release();
    await running;

    expect(placedOn(opened)).toContain(CREATED);
    expect(placedOn(opened, OTHER_MAP_ID)).not.toContain(CREATED);
    expect(opened.app.continuation.getState().pending).toBeNull();
  });

  it('reports a creation that breaks, and creates nothing', async () => {
    const opened = openDerivationSpace(mintingIds(CREATED));
    const { host, reportBreak } = hosted(opened);
    const failure = new Error('broke');

    await host.run(
      offered('markdown', () => Promise.reject(failure)),
      gesture(),
    );

    expect(reportBreak).toHaveBeenCalledWith(failure);
    expect(placedOn(opened)).not.toContain(CREATED);
  });
});

describe('a creation with a new Space', () => {
  const showing = (space: { spaceId: string; map: string; graph: string }): JsonValue => ({
    ...space,
  });

  it('makes the Space and its Resource through the coordinated lifecycle, titled alike', async () => {
    const opened = openDerivationSpace();
    const { host } = hosted(opened);

    await host.run(offered('space', askFor([{ newSpace: true, contentFor: showing }])), gesture());

    const made = opened.session
      .getState()
      .working.resources.filter(({ document }) => document.kind === 'space');
    expect(made).toHaveLength(1);
    expect(made[0]?.document.title).toBe('Space 1');
    expect(placedOn(opened)).toContain(made[0]?.id);
    expect(opened.app.continuation.getState().pending).toEqual({
      target: { kind: 'resource', resourceId: made[0]?.id },
      select: true,
      then: 'rename',
    });
  });

  it('normalises the Title it is given as an Edit does, and mints one for a blank Title', async () => {
    const opened = openDerivationSpace();
    const { host } = hosted(opened);

    await host.run(
      offered('space', askFor([{ title: 'Harbour  ', newSpace: true, contentFor: showing }])),
      gesture(),
    );
    await host.run(
      offered('space', askFor([{ title: '   ', newSpace: true, contentFor: showing }])),
      gesture(),
    );

    expect(
      opened.session
        .getState()
        .working.resources.filter(({ document }) => document.kind === 'space')
        .map(({ document }) => document.title),
    ).toEqual(['Harbour', 'Space 1']);
    expect(notice(opened)).toBeNull();
  });

  it('ignores a second one while the first is in flight, and still creates another kind', async () => {
    const opened = openDerivationSpace();
    const { host, creating, flights } = hosted(opened);
    const newSpace = offered('space', askFor([{ newSpace: true, contentFor: showing }]));

    const first = host.run(newSpace, press());
    expect(flights.kinds()).toEqual(new Set(['space']));
    const second = host.run(newSpace, press());
    await host.run(offered('markdown', askFor([{ content: EMPTY_TEXT }])), gesture());
    await Promise.all([first, second]);

    const kinds = opened.session.getState().working.resources.map(({ document }) => document.kind);
    expect(kinds.filter((kind) => kind === 'space')).toHaveLength(1);
    expect(kinds.filter((kind) => kind === 'markdown')).toHaveLength(4);
    expect(notice(opened)).toBeNull();
    expect(flights.kinds()).toEqual(new Set());
    expect(creating.at(-1)).toEqual(new Set());
  });
  it('refuses a new Space whose content its plugin’s schema refuses, as not creatable rather than a break', async () => {
    const opened = openDerivationSpace();
    const { host, reportBreak } = hosted(opened);

    await host.run(
      offered(
        'space',
        askFor([
          {
            newSpace: true,
            contentFor: () => {
              throw new NotCreatableContent('space');
            },
          },
        ]),
      ),
      gesture(),
    );

    expect(reportBreak).not.toHaveBeenCalled();
    expect(notice(opened)).toEqual({
      title: 'Space Resource not created',
      message: 'This Resource cannot be created here.',
    });
  });
});

describe('a creation from a list of Spaces', () => {
  const showing = (space: { spaceId: string; map: string; graph: string }): JsonValue => ({
    ...space,
  });

  it('links the Space it was offered, titled after it', async () => {
    const opened = openDerivationSpace();
    const { host } = hosted(opened);
    await host.run(offered('space', askFor([{ newSpace: true, contentFor: showing }])), gesture());
    const first = opened.session
      .getState()
      .working.resources.find(({ document }) => document.kind === 'space');
    if (first === undefined || !isOfKind(first.document, 'space'))
      throw new Error('No Space was made.');
    const space = { spaceId: first.document.content.spaceId, title: 'Space 1' };
    const settle = vi.fn();

    await host.run(
      offered('space', askFor([{ title: space.title, contentFor: showing }]), 'spaces'),
      gesture({ offered: space, settle }),
    );

    expect(settle).toHaveBeenCalledWith(null);
    const linked = opened.session
      .getState()
      .working.resources.filter(({ document }) => document.kind === 'space');
    expect(linked).toHaveLength(2);
    expect(linked.map(({ document }) => document.title)).toEqual(['Space 1', 'Space 1']);
  });
});

describe('a creation the host keeps its word on', () => {
  const showing = (space: { spaceId: string; map: string; graph: string }): JsonValue => ({
    ...space,
  });

  it('still links a Space from the list while the Dock’s new Space is in flight', async () => {
    const opened = openDerivationSpace();
    const { host } = hosted(opened);
    const newSpace = offered('space', askFor([{ newSpace: true, contentFor: showing }]));
    await host.run(newSpace, press());
    const [first] = opened.session
      .getState()
      .working.resources.filter(({ document }) => document.kind === 'space');
    if (first === undefined || !isOfKind(first.document, 'space'))
      throw new Error('No Space was made.');
    const space = { spaceId: first.document.content.spaceId, title: 'Space 1' };
    const settle = vi.fn();

    const inFlight = host.run(newSpace, press());
    const linking = host.run(
      offered('space', askFor([{ title: space.title, contentFor: showing }]), 'spaces'),
      gesture({ offered: space, settle }),
    );
    await Promise.all([inFlight, linking]);

    expect(settle).toHaveBeenCalledWith(null);
    expect(
      opened.session
        .getState()
        .working.resources.filter(({ document }) => document.kind === 'space'),
    ).toHaveLength(3);
  });

  it('keeps a Dock creation in flight across a host built for another Map', async () => {
    const opened = openDerivationSpace();
    const creating: ReadonlySet<string>[] = [];
    const flights = createCreationFlights((kinds) => creating.push(kinds));
    const onA = hosted(opened, createPluginGate(), creating, flights, MAP_ID);
    const onB = hosted(opened, createPluginGate(), creating, flights, OTHER_MAP_ID);
    const newSpace = offered('space', askFor([{ newSpace: true, contentFor: showing }]));

    const first = onA.host.run(newSpace, press());
    await onB.host.run(offered('markdown', askFor([{ content: EMPTY_TEXT }])), gesture());
    expect(flights.kinds()).toEqual(new Set(['space']));
    await onB.host.run(newSpace, press());
    await first;

    expect(
      opened.session
        .getState()
        .working.resources.filter(({ document }) => document.kind === 'space'),
    ).toHaveLength(1);
  });

  it('tells the author a creation that broke, in the failure’s words', async () => {
    const opened = openDerivationSpace();
    const { host, reportBreak } = hosted(opened);
    const failure = new Error('The asset store is unreachable.');

    await host.run(
      offered('markdown', () => Promise.reject(failure)),
      gesture(),
    );

    expect(reportBreak).toHaveBeenCalledWith(failure);
    expect(notice(opened)).toEqual({
      title: 'Markdown Resource not created',
      message: 'The asset store is unreachable.',
    });
  });

  it('places on the Map the gesture names when it is asked, and continues there', async () => {
    const opened = openDerivationSpace(mintingIds(CREATED));
    const { host } = hosted(opened);
    act(() => opened.app.navigation.selectMap(OTHER_MAP_ID));

    await host.run(
      offered('markdown', askFor([{ content: EMPTY_TEXT }])),
      gesture({ place: () => ({ anchor: AT, placement: 'exact', mapId: OTHER_MAP_ID }) }),
    );

    expect(placedOn(opened, OTHER_MAP_ID)).toContain(CREATED);
    expect(placedOn(opened)).not.toContain(CREATED);
    expect(opened.app.continuation.getState().pending).toEqual({
      target: { kind: 'resource', resourceId: CREATED },
      select: true,
      then: 'rename',
    });
  });
});

describe('a Dock creation whose picker is open', () => {
  const deferred = () => {
    let resolve: () => void = ignore;
    const promise = new Promise<void>((settle) => {
      resolve = settle;
    });
    return { promise, resolve };
  };

  it('is in flight from its press, so a second press while the picker is open is ignored', async () => {
    const opened = openDerivationSpace(mintingIds(CREATED, SECOND));
    const { host, flights } = hosted(opened);
    const picked = deferred();
    const runs = vi.fn();
    const picking = offered('markdown', async (creation) => {
      runs();
      await picked.promise;
      await creation.create([{ content: EMPTY_TEXT }]);
    });

    const first = host.run(picking, press());
    expect(flights.kinds()).toEqual(new Set(['markdown']));
    const second = host.run(picking, press());
    picked.resolve();
    await Promise.all([first, second]);

    expect(runs).toHaveBeenCalledTimes(1);
    expect(placedOn(opened)).toContain(CREATED);
    expect(placedOn(opened)).not.toContain(SECOND);
    expect(flights.kinds()).toEqual(new Set());
  });

  it('stores nothing, and says nothing, once the Dock has gone while the picker was open', async () => {
    const opened = openDerivationSpace();
    const store = vi.fn(() => Promise.resolve(textAsset('')));
    const host = createCreationHost({
      app: opened.app,
      session: opened.session,
      spaceResources: opened.spaceResources,
      gate: createPluginGate(),
      assets: { url: (ref) => ref, read: () => Promise.resolve({ refused: 'none' }), store },
      mapId: MAP_ID,
      reportBreak: vi.fn(),
      flights: createCreationFlights(ignore),
    });
    const picked = deferred();
    let available = true;

    const running = host.run(
      offered('markdown', async (creation) => {
        await picked.promise;
        const stored = await creation.assets.store?.(new Blob(['bytes']));
        if (stored !== undefined && !isStoredAsset(stored)) creation.report(stored.refused);
      }),
      gesture({ available: () => available }),
    );
    available = false;
    picked.resolve();
    await running;

    expect(store).not.toHaveBeenCalled();
    expect(notice(opened)).toBeNull();
  });

  it('is not single flight unless the gesture says so, as the canvas Add Resource', async () => {
    const opened = openDerivationSpace(mintingIds(CREATED, SECOND));
    const { host } = hosted(opened);
    const picked = deferred();
    const waiting = offered('markdown', async (creation) => {
      await picked.promise;
      await creation.create([{ content: EMPTY_TEXT }]);
    });

    const first = host.run(waiting, gesture());
    const second = host.run(waiting, gesture());
    picked.resolve();
    await Promise.all([first, second]);

    expect(placedOn(opened)).toEqual(expect.arrayContaining([CREATED, SECOND]));
  });
});

describe('a creation told on the standing notice', () => {
  const deferred = () => {
    let resolve: () => void = ignore;
    const promise = new Promise<void>((settle) => {
      resolve = settle;
    });
    return { promise, resolve };
  };
  const slowly =
    (waited: Promise<void>, items: readonly HostNew[]): Run =>
    async (creation) => {
      await creation.assets.measure?.('picture');
      await waited;
      await creation.create(items);
    };

  it('drops an earlier gesture that settles after a later one, keeping the later one’s refusal', async () => {
    const opened = openDerivationSpace(mintingIds(CREATED, SECOND));
    const { host } = hosted(opened);
    const slow = deferred();

    const first = host.run(
      offered('markdown', slowly(slow.promise, [{ content: EMPTY_TEXT }]), 'data'),
      gesture(),
    );
    await host.run(
      offered('markdown', (creation) => creation.report('Later gesture refused.'), 'data'),
      gesture(),
    );
    slow.resolve();
    await first;

    expect(notice(opened)?.message).toBe('Later gesture refused.');
    expect(opened.app.continuation.getState().pending).toBeNull();
  });

  it('clears the previous refusal when a new gesture starts its work', async () => {
    const opened = openDerivationSpace(mintingIds(CREATED));
    const { host } = hosted(opened);
    await host.run(
      offered('markdown', (creation) => creation.report('Old refusal.')),
      gesture(),
    );
    const slow = deferred();

    const running = host.run(
      offered('markdown', async (creation) => {
        await creation.assets.measure?.('picture');
        await slow.promise;
        await creation.create([{ content: EMPTY_TEXT }]);
      }),
      gesture(),
    );
    await Promise.resolve();

    expect(notice(opened)).toBeNull();
    slow.resolve();
    await running;
  });

  it('keeps the standing refusal through a picker that answers nothing', async () => {
    const opened = openDerivationSpace();
    const { host } = hosted(opened);
    await host.run(
      offered('markdown', (creation) => creation.report('Old refusal.')),
      gesture(),
    );

    await host.run(
      offered('markdown', async () => {
        await Promise.resolve([]);
      }),
      gesture(),
    );

    expect(notice(opened)?.message).toBe('Old refusal.');
  });

  it('draws no refusal pressed before a Space replacement over the replacement', async () => {
    const stored = { snapshot: derivationSnapshot, revision: 0n, exportedRevision: null };
    const backend = MemorySpaceBackend.asMeta({ ...stored, revision: 1n });
    const { spaceSession, spaceResources } = openTestSpace(backend, stored, mintingIds(CREATED));
    const opened: OpenSpace = {
      id: SPACE_ID,
      session: spaceSession,
      app: composeApp({ spaceSession, spaceResources, newId: mintingIds(SECOND) }),
      spaceResources,
    };
    const { host } = hosted(opened);
    // A first creation makes the session conflict with the stored revision.
    await host.run(offered('markdown', askFor([{ content: EMPTY_TEXT }])), gesture());
    await vi.waitFor(() => expect(spaceSession.getState().persistence.kind).toBe('conflicted'));
    const slow = deferred();

    const running = host.run(
      offered('markdown', async (creation) => {
        await creation.assets.measure?.('picture');
        await slow.promise;
        creation.report('Refused about the replaced Space.');
      }),
      gesture(),
    );
    await Promise.resolve();
    expect(opened.app.authoring.acceptStoredSpace()).toBeNull();
    slow.resolve();
    await running;

    expect(notice(opened)).toBeNull();
  });

  it('says nothing for a creation that declares no notice, and leaves the standing one', async () => {
    const opened = openDerivationSpace(mintingIds(CREATED));
    let exclusive = false;
    const { host } = hosted(opened, { ...createPluginGate(), withdraws: () => exclusive });
    await host.run(
      offered('markdown', (creation) => creation.report('Old refusal.')),
      gesture(),
    );
    const silent = {
      ...offered('markdown', askFor([{ content: EMPTY_TEXT }])),
      notCreated: undefined,
    };

    exclusive = true;
    await host.run(silent, gesture());

    expect(placedOn(opened)).not.toContain(CREATED);
    expect(notice(opened)?.message).toBe('Old refusal.');
  });
});
