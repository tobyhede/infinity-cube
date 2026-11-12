import {
  createContext,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ComponentType,
} from 'react';
import { render, type RenderResult } from '@testing-library/react';
import type { Answer, AssetRef, Size } from '../domain';
import { createRailStore, ResourceHostProvider, type ResourceHost } from './host';
import type {
  Assets,
  Exclusive,
  OwnClaim,
  OwnProps,
  PluginViewProps,
  Surface,
  TitleProps,
} from './index';

/**
 * Rendering a plugin's view with a test host (ADR 0142), so a plugin's own
 * tests need nothing but the Resource API: every capability is absent unless
 * granted, a granted commit is recorded and answers as told, and the rail's
 * commands are drawn as plain buttons and radio groups.
 */

/** The capabilities a test grants; every one is absent unless named. */
export interface Grants {
  readonly title?: boolean;
  readonly content?: boolean;
  readonly map?: boolean;
  readonly claim?: boolean;
  readonly store?: boolean;
  readonly pick?: boolean;
}

/** What a rendered plugin's commits and asset store received, in order. */
export interface Commits<C, M> {
  readonly title: string[];
  readonly content: C[];
  readonly map: M[];
  readonly stored: Blob[];
}

export interface RenderPluginOptions<C, M> {
  readonly content: C;
  readonly map: M;
  readonly grants?: Grants;
  readonly title?: string;
  readonly kind?: string;
  readonly size?: Size;
  readonly selected?: boolean;
  /** What every commit answers; `completed` also applies the value, as a host would. */
  readonly answer?: Answer;
  /** What a granted pick answers. */
  readonly files?: readonly File[];
}

export type RenderedPlugin<C, M> = RenderResult & { readonly commits: Commits<C, M> };

const TEST_ASSETS = {
  url: (ref: AssetRef) => ref,
  read: () => Promise.resolve({ refused: 'No asset store in this test.' }),
};

const DEFAULT_SIZE: Size = { width: 200, height: 120 };

/** The embedding a test surface hands its plugin: one component for every render, as a host must. */
function TestEmbed() {
  return null;
}

const WITHDRAWN = { refused: 'Exclusive work is running.' } as const;
const ENDED = { refused: 'The exclusive work has ended.' } as const;

/** A stored Blob's reference: its position, padded to an asset reference's 43 characters. */
const testAssetRef = (position: number): AssetRef =>
  `/assets/${String(position).padStart(43, 'A')}`;

/** Whether exclusive work runs on the test page, and which run it is. */
function createTestGate() {
  let run: symbol | null = null;
  const listeners = new Set<() => void>();
  const install = (next: symbol | null) => {
    run = next;
    for (const listener of listeners) listener();
  };
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    running: () => run !== null,
    /** Run `work`, or answer busy where a run is live; `live` answers whether this run still is. */
    async exclusively<T>(work: (live: () => boolean) => Promise<T>): Promise<T | 'busy'> {
      if (run !== null) return 'busy';
      const mine = Symbol('exclusive work');
      install(mine);
      try {
        return await work(() => run === mine);
      } finally {
        install(null);
      }
    },
  };
}

/**
 * The Title, read from context rather than closed over, so the harness hands
 * the plugin one Title component for its lifetime, as a host does.
 */
const TestTitleContext = createContext('');

function TestTitle({ className }: TitleProps) {
  const title = useContext(TestTitleContext);
  return (
    <h2 className={className} data-testid="plugin-title">
      {title}
    </h2>
  );
}

function TestOwn({ children, className }: OwnProps) {
  return (
    <div className={className} data-testid="plugin-own">
      {children}
    </div>
  );
}

function TestRail({ host }: { readonly host: ReturnType<typeof createRailStore> }) {
  const commands = useSyncExternalStore(host.subscribe, host.commands);
  if (commands.length === 0) return null;
  return (
    <div role="toolbar" aria-label="Rail">
      {commands.map((command) =>
        command.kind === 'action' ? (
          <button
            key={command.id}
            type="button"
            aria-label={command.label}
            disabled={command.disabled === true}
            onClick={command.run}
          >
            {command.icon}
          </button>
        ) : (
          <div key={command.id} role="radiogroup" aria-label={command.label}>
            {command.choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                role="radio"
                aria-label={choice.label}
                aria-checked={choice.id === command.chosen}
                onClick={() => command.choose(choice.id)}
              >
                {choice.icon}
              </button>
            ))}
          </div>
        ),
      )}
    </div>
  );
}

/**
 * Render `View` on a test surface. The Title, content and Map content start at
 * the values given; a granted commit records what it was given and answers
 * `answer`, applying the value when that is `completed`.
 */
export function renderPlugin<C, M>(
  View: ComponentType<PluginViewProps<C, M>>,
  options: RenderPluginOptions<C, M>,
): RenderedPlugin<C, M> {
  const commits: Commits<C, M> = { title: [], content: [], map: [], stored: [] };
  const grants = options.grants ?? {};
  const answer: Answer = options.answer ?? 'completed';
  const gate = createTestGate();
  const files = [...(options.files ?? [])];
  const store = (bytes: Blob): Promise<AssetRef | { readonly refused: string }> => {
    if (answer !== 'completed' && answer !== 'unchanged') return Promise.resolve(answer);
    commits.stored.push(bytes);
    return Promise.resolve(testAssetRef(commits.stored.length));
  };
  const pick = () => Promise.resolve(gate.running() ? [] : files);
  /** A commit answering refused when `live` says it is not, as the host's withdrawn and ended commits do. */
  const guarded =
    <T, A>(commit: (next: T) => Promise<A>, live: () => boolean, refusal: { refused: string }) =>
    (next: T): Promise<A | { readonly refused: string }> =>
      live() ? commit(next) : Promise.resolve(refusal);

  function Harness() {
    const [title, setTitle] = useState(options.title ?? 'Resource');
    const [content, setContent] = useState(options.content);
    const [mapValue, setMapValue] = useState(options.map);
    const rail = useMemo(() => createRailStore(), []);
    const running = useSyncExternalStore(gate.subscribe, gate.running);
    const host: ResourceHost = useMemo(() => ({ Title: TestTitle, Own: TestOwn, rail }), [rail]);
    // One set of commits while what is offered stays the same, as a host keeps
    // its own, so a plugin keying work on a commit sees what a host gives it.
    const offeredNow = useMemo(() => {
      const settle =
        <T,>(record: T[], apply: (next: T) => void) =>
        (next: T) => {
          record.push(next);
          if (answer === 'completed') apply(next);
          return Promise.resolve(answer);
        };
      const granted = {
        title: grants.title === true ? settle(commits.title, setTitle) : undefined,
        content: grants.content === true ? settle(commits.content, setContent) : undefined,
        map: grants.map === true ? settle(commits.map, setMapValue) : undefined,
        store: grants.store === true ? store : undefined,
      };
      const idle = () => !gate.running();
      const offered = <T,>(commit: T | undefined) => (running ? undefined : commit);
      const plain = <T, A>(commit: ((next: T) => Promise<A>) | undefined) =>
        offered(commit === undefined ? undefined : guarded(commit, idle, WITHDRAWN));
      const claim: OwnClaim<C, M> = {
        release: () => undefined,
        exclusively: (work) =>
          gate.exclusively((live) => {
            const ownCommit = <T, A>(commit: ((next: T) => Promise<A>) | undefined) =>
              commit === undefined ? undefined : guarded(commit, live, ENDED);
            const own: Exclusive<C, M> = {
              title: ownCommit(granted.title),
              content: ownCommit(granted.content),
              map: ownCommit(granted.map),
              store: ownCommit(granted.store),
            };
            return work(own);
          }),
      };
      const assets: Assets = {
        ...TEST_ASSETS,
        store: plain(granted.store),
        pick: grants.pick === true ? offered(pick) : undefined,
      };
      return {
        title: plain(granted.title),
        content: plain(granted.content),
        map: plain(granted.map),
        claim: grants.claim === true ? () => claim : undefined,
        assets,
      };
    }, [running]);
    const surface: Surface<C, M> = {
      resource: { id: 'resource', title, kind: options.kind ?? 'test', content },
      title: { value: title, commit: offeredNow.title },
      content: { value: content, commit: offeredNow.content },
      map: { value: mapValue, commit: offeredNow.map },
      size: options.size ?? DEFAULT_SIZE,
      selected: options.selected ?? false,
      claim: offeredNow.claim,
      assets: offeredNow.assets,
      Embed: TestEmbed,
    };
    return (
      <TestTitleContext.Provider value={title}>
        <ResourceHostProvider host={host}>
          <View surface={surface} />
          <TestRail host={rail} />
        </ResourceHostProvider>
      </TestTitleContext.Provider>
    );
  }

  const rendered = render(<Harness />);
  return Object.assign(rendered, { commits });
}
