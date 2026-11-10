/**
 * THROWAWAY (issue 01): the Resource plugin interface on the five hard paths,
 * over the real composed application. Deleted once the Answer is written.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { uuidSchema, type SpaceSnapshot, type SpaceView } from '@project/core';
import { createSpaceSessionRegistry, MemorySpaceBackend } from '@project/persistence';
import { composeApp } from '../../src/compose-app';
import { createSpaceResourceLifecycle } from '../../src/space-resource-lifecycle';
import { unusedImageSources } from '../image-sources';
import type { Answer, Exclusive, PluginView, Surface } from './api';
import { createProofHost, REFUSED, type ProofSpace } from './host';
import { hintFor, imagePlugin, markdownPlugin, plugins, spacePlugin } from './plugins';

const id = (n: number) => uuidSchema.parse(`00000000-0000-4000-8000-${String(n).padStart(12, '0')}`);
const OUTER = id(1);
const OM = id(2);
const OG = id(3);
const IMG1 = id(4);
const REF = id(5);
const SP = id(6);
const MD = id(7);
const INNER = id(10);
const IM = id(11);
const IM2 = id(12);
const IG = id(13);
const IG2 = id(14);
const IMG2 = id(15);

const hash = (text: string) => createHash('sha256').update(text).digest('base64url');
const OLD = `/images/${hash('old')}`;
const TEXT = '# Notes\nfirst line\nsecond line';

const outer: SpaceSnapshot = {
  id: OUTER,
  document: {
    version: 1,
    title: 'Outer',
    defaultMap: OM,
    maps: [
      {
        id: OM,
        title: 'Map 1',
        kind: 'positioned',
        positions: {
          [IMG1]: { x: 0, y: 0 },
          [REF]: { x: 400, y: 0, open: true },
          [SP]: { x: 0, y: 400, open: true, size: { width: 800, height: 600 } },
          [MD]: { x: 900, y: 0, open: false },
        },
        graphs: [{ id: OG, title: 'Main', edges: [{ from: IMG1, to: MD }] }],
        activeGraph: OG,
      },
    ],
  },
  resources: [
    { id: IMG1, document: { title: 'Figure', kind: 'image', content: { url: OLD } } },
    { id: REF, document: { title: 'Figure, again', kind: 'reference', content: { target: IMG1 } } },
    {
      id: SP,
      document: { title: 'Inner', kind: 'space', content: { spaceId: INNER, map: IM, graph: IG } },
    },
    { id: MD, document: { title: 'Notes', kind: 'markdown', content: { source: TEXT } } },
  ],
};

const inner: SpaceSnapshot = {
  id: INNER,
  document: {
    version: 1,
    title: 'Inner',
    defaultMap: IM,
    maps: [
      {
        id: IM,
        title: 'Map 1',
        kind: 'positioned',
        positions: { [IMG2]: { x: 0, y: 0 } },
        graphs: [{ id: IG, title: 'Main', edges: [] }],
        activeGraph: IG,
      },
      {
        id: IM2,
        title: 'Map 2',
        kind: 'positioned',
        positions: { [IMG2]: { x: 0, y: 0 } },
        graphs: [{ id: IG2, title: 'Second', edges: [] }],
        activeGraph: IG2,
      },
    ],
  },
  resources: [{ id: IMG2, document: { title: 'Diagram', kind: 'image', content: { url: OLD } } }],
};

const compose = (snapshots: readonly SpaceSnapshot[], cap?: { width: number; height: number }) => {
  const backend = new MemorySpaceBackend(
    snapshots[0]!.id,
    snapshots.map((snapshot) => ({ snapshot, revision: 0n, exportedRevision: null })),
  );
  const registry = createSpaceSessionRegistry(backend);
  let n = 100;
  const newId = () => id(n++);
  const spaceResources = createSpaceResourceLifecycle({
    backend,
    registry,
    newId,
    reportObserverError: (error) => {
      throw error;
    },
  });
  const spaces: ProofSpace[] = snapshots.map((snapshot) => {
    const session = registry.open({ snapshot, revision: 0n, exportedRevision: null });
    const app = composeApp({
      spaceSession: session,
      images: unusedImageSources,
      newId,
      spaceResources,
      reportObserverError: (error) => {
        throw error;
      },
    });
    return { id: snapshot.id, session, app };
  });
  const host = createProofHost({
    spaces,
    plugins: plugins as never,
    spaceResources,
    ...(cap === undefined ? {} : { cap }),
  });
  const doc = (spaceId: string, resourceId: string) =>
    spaces
      .find((s) => s.id === spaceId)!
      .session.getState()
      .working.resources.find((r) => r.id === resourceId)?.document;
  const entry = (spaceId: string, mapId: string, resourceId: string) =>
    spaces
      .find((s) => s.id === spaceId)!
      .session.getState()
      .working.document.maps?.find((m) => m.id === mapId)?.positions[resourceId];
  return { host, spaces, doc, entry, spaceResources };
};

const pngFile = (name: string) => new File([`png:${name}`], name, { type: 'image/png' });
const surf = (host: ReturnType<typeof compose>['host'], key: string) => {
  const s = host.probe.get(key);
  if (s === undefined) throw new Error(`no surface ${key}: ${[...host.probe.keys()].join(', ')}`);
  return s as Surface<unknown, unknown>;
};

describe('path 1 — Reference → Image', () => {
  it('draws the Target as a picture whose text alternative is the Reference’s own Title, offering no authoring of the Target', () => {
    const { host } = compose([outer, inner]);
    render(<host.CanvasMap spaceId={OUTER} mapId={OM} />);
    const figures = screen.getAllByTestId(`image:${IMG1}`);
    expect(figures).toHaveLength(2);
    // The Image itself: its Title is its alt text, and Replace is offered.
    expect(within(figures[0]!).getByRole('img').getAttribute('alt')).toBe('Figure');
    expect(within(figures[0]!).queryByRole('button', { name: 'Replace' })).not.toBeNull();
    // Through the Reference: at most one Title, the Reference's, and no Replace.
    expect(within(figures[1]!).getByRole('img').getAttribute('alt')).toBe('Figure, again');
    expect(within(figures[1]!).queryByRole('button', { name: 'Replace' })).toBeNull();
    const embedded = surf(host, `${IMG1}@none:embedded`);
    expect(embedded.content.commit).toBeUndefined();
    expect(embedded.map.commit).toBeUndefined();
    expect(embedded.claim).toBeUndefined();
  });

  it('renames the Reference, not the Target, through the Title the Target was given', async () => {
    const { host, doc } = compose([outer, inner]);
    render(<host.CanvasMap spaceId={OUTER} mapId={OM} />);
    const embedded = surf(host, `${IMG1}@none:embedded`);
    await act(async () => expect(await embedded.title.commit?.('Renamed')).toBe('completed'));
    expect(doc(OUTER, REF)?.title).toBe('Renamed');
    expect(doc(OUTER, IMG1)?.title).toBe('Figure');
  });

  it('withdraws the passed Title commit while exclusive work runs, and refuses the retained one', async () => {
    const { host, doc } = compose([outer, inner]);
    render(<host.CanvasMap spaceId={OUTER} mapId={OM} />);
    const retained = surf(host, `${IMG1}@none:embedded`).title.commit;
    const image = surf(host, `${IMG1}@${OM}`);
    let claim!: ReturnType<NonNullable<typeof image.claim>>;
    act(() => {
      claim = image.claim?.();
    });
    let release!: () => void;
    let running!: Promise<unknown>;
    act(() => {
      running = claim!.exclusively(() => new Promise<void>((r) => (release = r)));
    });
    expect(surf(host, `${IMG1}@none:embedded`).title.commit).toBeUndefined();
    await act(async () =>
      expect(await retained?.('During')).toEqual({ refused: REFUSED.exclusive }),
    );
    expect(doc(OUTER, REF)?.title).toBe('Figure, again');
    await act(async () => {
      release();
      await running;
    });
    expect(surf(host, `${IMG1}@none:embedded`).title.commit).toBeDefined();
  });
});

describe('path 2 — Replace on an Image inside a Space embedding', () => {
  it('lands only the work’s own commits while every retained commit, the embedding’s selection and Close included, answers refused', async () => {
    const { host, doc, entry } = compose([outer, inner]);
    render(<host.CanvasMap spaceId={OUTER} mapId={OM} />);
    const space = () => within(screen.getByTestId(`space:${SP}`));
    const innerImage = () => within(screen.getByTestId(`embedded:${INNER}`)).getByTestId(`image:${IMG2}`);
    // Not entered: the embedding offers no authoring of what it draws.
    expect(within(innerImage()).queryByRole('button', { name: 'Replace' })).toBeNull();
    fireEvent.click(space().getByRole('button', { name: 'Enter' }));
    expect(within(innerImage()).queryByRole('button', { name: 'Replace' })).not.toBeNull();

    // Retain everything around the work before it starts.
    const spaceSurface = surf(host, `${SP}@${OM}`);
    const retainedClose = spaceSurface.map.commit;
    const retainedSelect = spaceSurface.content.commit;
    const retainedSpaceTitle = spaceSurface.title.commit;
    const outerImage = surf(host, `${IMG1}@${OM}`);
    const retainedSiblingContent = outerImage.content.commit;
    const retainedStore = outerImage.assets.store;
    const outerClaim = host.activeClaim();
    expect(outerClaim).not.toBeNull();

    let releaseStore!: () => void;
    host.holdStores(new Promise<void>((r) => (releaseStore = r)));
    host.setNextPick([pngFile('new.png')]);
    await act(async () => {
      host.press(() => fireEvent.click(within(innerImage()).getByRole('button', { name: 'Replace' })));
    });
    expect(host.state.getState().exclusive).toBe(true);

    // Re-rendered without what was withdrawn, everywhere, the Claims around included.
    const during = surf(host, `${SP}@${OM}`);
    expect(during.map.commit).toBeUndefined();
    expect(during.content.commit).toBeUndefined();
    expect(during.title.commit).toBeUndefined();
    expect(surf(host, `${IMG1}@${OM}`).assets.store).toBeUndefined();
    expect(surf(host, `${IMG1}@${OM}`).assets.pick).toBeUndefined();
    expect(space().queryByRole('button', { name: 'Close' })).toBeNull();
    // Still mounted, still held.
    expect(screen.getByTestId(`space:${SP}`)).toBeTruthy();

    // Retained callbacks answer refused and change nothing.
    await act(async () => {
      expect(await retainedClose?.({ open: false })).toEqual({ refused: REFUSED.exclusive });
      expect(
        await retainedSelect?.({ spaceId: INNER, map: IM2, graph: IG2 } satisfies SpaceView),
      ).toEqual({ refused: REFUSED.exclusive });
      expect(await retainedSpaceTitle?.('Renamed')).toEqual({ refused: REFUSED.exclusive });
      expect(await retainedSiblingContent?.({ url: 'https://example.com/x.png' })).toEqual({
        refused: REFUSED.exclusive,
      });
    });
    expect(entry(OUTER, OM, SP)?.open).toBe(true);
    expect(doc(OUTER, SP)?.content).toEqual({ spaceId: INNER, map: IM, graph: IG });
    void retainedStore;

    // The outer Claim holds while the inner one runs; a sibling gets none.
    const activeInner = host.activeClaim();
    expect(activeInner?.parent).toBe(outerClaim);
    expect(surf(host, `${IMG1}@${OM}`).claim?.()).toBeUndefined();

    await act(async () => {
      releaseStore();
      await new Promise((r) => setTimeout(r, 0));
    });
    host.holdStores(null);
    expect(host.state.getState().exclusive).toBe(false);
    expect(doc(INNER, IMG2)?.content).toEqual({ url: `/images/${hash('png:new.png')}` });
    // The plugin released its own Claim; the outer one is still held.
    expect(host.activeClaim()).toBe(outerClaim);
    // And everything comes back.
    const after = surf(host, `${SP}@${OM}`);
    expect(after.map.commit).toBeDefined();
    await act(async () => expect(await after.map.commit?.({ open: false })).toBe('completed'));
    expect(entry(OUTER, OM, SP)?.open).toBe(false);
  });

  it('refuses releasing an outer Claim while an inner one is held, answers busy to a second exclusive, and refuses own after work settles', async () => {
    const { host, doc } = compose([outer, inner]);
    render(<host.CanvasMap spaceId={OUTER} mapId={OM} />);
    fireEvent.click(within(screen.getByTestId(`space:${SP}`)).getByRole('button', { name: 'Enter' }));
    const outerClaim = host.activeClaim();
    const innerSurface = surf(host, `${IMG2}@${IM}`);
    let innerClaim!: ReturnType<NonNullable<typeof innerSurface.claim>>;
    act(() => {
      innerClaim = innerSurface.claim?.();
    });
    expect(innerClaim).toBeDefined();
    // The Space plugin's Leave calls release on the outer Claim: refused.
    fireEvent.click(within(screen.getByTestId(`space:${SP}`)).getByRole('button', { name: 'Leave' }));
    expect(host.activeClaim()?.parent).toBe(outerClaim);

    let kept!: Exclusive<unknown, unknown>;
    let finish!: () => void;
    let running!: Promise<unknown>;
    act(() => {
      running = innerClaim!.exclusively(async (own) => {
        kept = own;
        await new Promise<void>((r) => (finish = r));
        return own.content?.({ url: 'https://example.com/during.png' });
      });
    });
    // `busy` before any work, from any Claim.
    let second: unknown;
    await act(async () => {
      second = await innerClaim!.exclusively(() => Promise.resolve('ran'));
    });
    expect(second).toBe('busy');
    await act(async () => {
      finish();
      expect(await running).toBe('completed');
    });
    expect(doc(INNER, IMG2)?.content).toEqual({ url: 'https://example.com/during.png' });
    await act(async () =>
      expect(await kept.content?.({ url: 'https://example.com/late.png' })).toEqual({
        refused: REFUSED.settled,
      }),
    );
    act(() => {
      expect(innerClaim!.release()).toBe(true);
    });
    expect(host.activeClaim()).toBe(outerClaim);
  });
});

describe('path 3 — creating an Image through the picker', () => {
  it('picks in the press, stores, and asks the host to create; the host places it', async () => {
    const { host, spaces } = compose([outer, inner]);
    host.setNextPick([pngFile('a.png'), pngFile('b.png')]);
    await act(() => host.create(spaces[0]!, OM, imagePlugin as never));
    const urls = spaces[0]!.session
      .getState()
      .working.resources.filter((r) => r.document.kind === 'image')
      .map((r) => (r.document.content as { url: string }).url);
    expect(urls).toEqual([OLD, `/images/${hash('png:a.png')}`, `/images/${hash('png:b.png')}`]);
  });

  it('loses the press when the plugin awaits before picking', async () => {
    const { host, spaces } = compose([outer, inner]);
    const late: PluginView<never, never> = {
      ...(imagePlugin as never as PluginView<never, never>),
      creates: {
        from: 'dock',
        run: async (h) => {
          await Promise.resolve();
          await h.assets.pick?.('image/*');
        },
      },
    };
    await expect(host.create(spaces[0]!, OM, late)).rejects.toThrow(REFUSED.pressLost);
  });

  it('refuses creation while exclusive work runs, and the host reports it because `run` has no surface', async () => {
    const { host, spaces } = compose([outer, inner]);
    render(<host.CanvasMap spaceId={OUTER} mapId={OM} />);
    let finish!: () => void;
    act(() => {
      void surf(host, `${IMG1}@${OM}`)
        .claim?.()
        ?.exclusively(() => new Promise<void>((r) => (finish = r)));
    });
    host.setNextPick([pngFile('c.png')]);
    await act(() => host.create(spaces[0]!, OM, imagePlugin as never));
    expect(host.reported).toEqual([REFUSED.exclusive]);
    await act(async () => {
      finish();
      await new Promise((r) => setTimeout(r, 0));
    });
  });
});

describe('path 4 — creating a Space with its new Space', () => {
  it('creates both in one coordinated Edit, and the content the plugin asks for is what NewSpace can give it', async () => {
    const { host, spaces, spaceResources } = compose([outer, inner]);
    const before = spaces[0]!.session.getState().working.resources.length;
    await act(() => host.create(spaces[0]!, OM, spacePlugin as never));
    const created = spaces[0]!.session.getState().working.resources.at(-1);
    expect(spaces[0]!.session.getState().working.resources).toHaveLength(before + 1);
    expect(created?.document.kind).toBe('space');
    const content = created?.document.content as SpaceView;
    const target = await spaceResources.target(content.spaceId);
    expect(target).toBeDefined();
    // The plugin's function, given what the host knows of the new Space, writes
    // exactly what the lifecycle wrote itself.
    const make = (spacePlugin.creates!.run as unknown) && ((s: { spaceId: string; map: string; graph: string }) => ({
      spaceId: s.spaceId,
      map: s.map,
      graph: s.graph,
    }));
    const first = target!.maps[0]!;
    expect(make({ spaceId: target!.id, map: first.id, graph: first.activeGraph! })).toEqual(content);
  });
});

describe('path 5 — Markdown reads its text as an asset', () => {
  it('draws its text after the asset arrives, and Opens with a size hint the canvas floors and caps in one Edit', async () => {
    const { host, entry } = compose([outer, inner]);
    render(<host.CanvasMap spaceId={OUTER} mapId={OM} />);
    const md = () => within(screen.getByTestId(`markdown:${MD}`));
    expect(md().queryByTestId('body')).toBeNull();
    await act(async () => {
      fireEvent.click(md().getByRole('button', { name: 'Open' }));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(entry(OUTER, OM, MD)?.open).toBe(true);
    // Hint 640 × 128 for three lines; the Edit floors the height at the Closed Size.
    expect(hintFor(TEXT)).toEqual({ width: 640, height: 128 });
    expect(entry(OUTER, OM, MD)?.size).toEqual({ width: 640, height: 146 });
    expect((await md().findByTestId('body')).textContent).toBe(TEXT);
  });

  it('caps a long text’s hint at the visible canvas', async () => {
    const long = Array.from({ length: 80 }, (_, i) => `line ${i}`).join('\n');
    const longOuter: SpaceSnapshot = {
      ...outer,
      resources: outer.resources.map((r) =>
        r.id === MD ? { ...r, document: { ...r.document, content: { source: long } } as never } : r,
      ),
    };
    const { host, entry } = compose([longOuter, inner], { width: 500, height: 700 });
    render(<host.CanvasMap spaceId={OUTER} mapId={OM} />);
    await act(async () => {
      fireEvent.click(within(screen.getByTestId(`markdown:${MD}`)).getByRole('button', { name: 'Open' }));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(entry(OUTER, OM, MD)?.size).toEqual({ width: 500, height: 700 });
  });

  it('draws on the Stage with its no-Map value, offering nothing', async () => {
    const { host } = compose([outer, inner]);
    render(<host.Stage spaceId={OUTER} resourceId={MD} />);
    const md = within(screen.getByTestId(`markdown:${MD}`));
    expect(md.queryByRole('button', { name: 'Open' })).toBeNull();
    await waitFor(() => expect(md.getByTestId('body').textContent).toBe(TEXT));
    const stage = surf(host, `${MD}@none:inert`);
    expect(stage.title.commit).toBeUndefined();
    expect(stage.content.commit).toBeUndefined();
    expect(stage.assets.store).toBeUndefined();
    expect(stage.claim).toBeUndefined();
  });

  it('saves new text by storing an asset and committing its reference', async () => {
    const { host, doc } = compose([outer, inner]);
    render(<host.CanvasMap spaceId={OUTER} mapId={OM} />);
    const surface = surf(host, `${MD}@${OM}`);
    let answer: Answer | undefined;
    await act(async () => {
      const ref = await surface.assets.store?.(new Blob(['# Rewritten'], { type: 'text/markdown' }));
      if (typeof ref !== 'string') throw new Error('not stored');
      answer = await surface.content.commit?.({ text: ref });
    });
    expect(answer).toBe('completed');
    expect(doc(OUTER, MD)?.content).toEqual({ source: '# Rewritten' });
  });
});

describe('queued settlement', () => {
  it('settles a commit made during another Edit’s publication once its own Edit is applied', async () => {
    const { host, spaces, doc } = compose([outer, inner]);
    render(<host.CanvasMap spaceId={OUTER} mapId={OM} />);
    const md = surf(host, `${MD}@${OM}`);
    const image = surf(host, `${IMG1}@${OM}`);
    let queued: Promise<Answer> | undefined;
    const off = spaces[0]!.app.authoring.subscribe(() => {
      if (queued === undefined) queued = md.title.commit?.('Renamed during publication');
    });
    await act(async () => expect(await image.title.commit?.('Picture')).toBe('completed'));
    off();
    expect(host.commitLog.map((c) => c.kind)).toEqual(['edited-resource', 'edited-resource']);
    await act(async () => expect(await queued).toBe('completed'));
    expect(doc(OUTER, MD)?.title).toBe('Renamed during publication');
  });
});

describe('failure boundary', () => {
  it('loses only the Resource whose plugin throws', () => {
    const { spaces } = compose([outer, inner]);
    const throwing: PluginView<never, never> = {
      kind: 'markdown',
      mapContent: { default: {} as never },
      View: () => {
        throw new Error('plugin bug');
      },
    };
    const host = createProofHost({ spaces, plugins: [throwing, ...plugins.filter((p) => p.kind !== 'markdown')] as never });
    const spy = console.error;
    console.error = () => undefined;
    render(<host.CanvasMap spaceId={OUTER} mapId={OM} />);
    console.error = spy;
    expect(screen.getByRole('note').textContent).toBe('Notes could not be drawn.');
    expect(screen.getAllByTestId(`image:${IMG1}`)).toHaveLength(2);
  });
});
