import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ComponentType,
} from 'react';
import { act, render, type RenderResult } from '@testing-library/react';
import type { Answer, AssetRef, Size } from '../domain';
import {
  createRailStore,
  RAIL_BAND,
  ResourceHostProvider,
  type Assets,
  type Exclusive,
  type OwnClaim,
  type OwnProps,
  type PluginViewProps,
  type RenderedMarkdownProps,
  type ResourceHost,
  type SourceEditorProps,
  type Surface,
  type TitleProps,
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
  /** How many times exclusive work ran. */
  readonly exclusive: number;
  /** How many times the picker was opened. */
  readonly picked: number;
  /** The size hint each Map content commit carried, in order, `undefined` where it carried none. */
  readonly hints: (Size | undefined)[];
  /** How many Claims were taken and released. */
  readonly claims: { taken: number; released: number };
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
  /**
   * What the nth opening of a granted picker answers, counting from 1, in
   * place of `files`: a picker the author leaves open is one that never settles.
   */
  readonly picker?: (opening: number) => Promise<readonly File[]>;
  /** Whether a granted `claim()` is refused, as the chain refuses one. */
  readonly claimRefused?: boolean;
  /**
   * The asset store the surface reaches, over one that reads nothing. `store`
   * and `pick` are offered only where granted.
   */
  readonly assets?: Partial<Assets>;
}

export type RenderedPlugin<C, M> = RenderResult & {
  readonly commits: Commits<C, M>;
  /**
   * Withdraw every commit, store, pick and Claim from the surface, or offer
   * them again, as a host does while a modal is up, while presenting or where
   * the Resource becomes read-only; a Claim already taken stays held.
   */
  readonly withdraw: (withdrawn: boolean) => void;
  /** Change the content from outside the plugin, as another author's Edit or a replacement does. */
  readonly changeContent: (next: C) => void;
};

/** Where a test surface draws an asset from: a URL that names the reference, so a test can see it. */
export const testAssetUrl = (ref: AssetRef): string => `blob:test${ref}`;

const TEST_ASSETS = {
  url: testAssetUrl,
  read: () => Promise.resolve({ refused: 'No asset store in this test.' }),
};

const DEFAULT_SIZE: Size = { width: 200, height: 120 };

/** The embedding a test surface hands its plugin: one component for every render, as a host must. */
function TestEmbed() {
  return null;
}

const WITHDRAWN = { refused: 'Exclusive work is running.' } as const;
const ENDED = { refused: 'The exclusive work has ended.' } as const;

/** A stored Blob's reference: its position, padded to a canonical asset reference's 43 characters. */
export const testAssetRef = (position: number): AssetRef =>
  `/assets/${String(position).padStart(42, 'A')}A`;

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

/** Markdown drawn as its text, so a plugin's test reads what it was given. */
function TestRenderedMarkdown({ markdown, className, edit }: RenderedMarkdownProps) {
  return (
    <>
      <div className={className} data-testid="rendered-markdown">
        {markdown}
      </div>
      {edit !== undefined && <button type="button" aria-label={edit.label} onClick={edit.begin} />}
    </>
  );
}

/** A source editor drawn as a text area. */
function TestSourceEditor({
  value,
  onValueChange,
  ariaLabel,
  autoFocus,
  onSave,
  onCancel,
}: SourceEditorProps) {
  return (
    <textarea
      aria-label={ariaLabel}
      value={value}
      ref={(element) => {
        if (autoFocus === true) element?.focus();
      }}
      onChange={(event) => onValueChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel?.();
        else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) onSave?.();
      }}
    />
  );
}

function TestTitle({ title }: { readonly title: string }) {
  return function Title({ className }: TitleProps) {
    return (
      <h2 className={className} data-testid="plugin-title">
        {title}
      </h2>
    );
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
            aria-keyshortcuts={command.keyshortcuts}
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
  let exclusiveRuns = 0;
  let pickerOpenings = 0;
  const commits: Commits<C, M> = {
    title: [],
    content: [],
    map: [],
    stored: [],
    get exclusive() {
      return exclusiveRuns;
    },
    get picked() {
      return pickerOpenings;
    },
    hints: [],
    claims: { taken: 0, released: 0 },
  };
  const grants = options.grants ?? {};
  const answer: Answer = options.answer ?? 'completed';
  const gate = createTestGate();
  let authoringWithdrawn = false;
  const authoringListeners = new Set<() => void>();
  const subscribeAuthoring = (listener: () => void) => {
    authoringListeners.add(listener);
    return () => authoringListeners.delete(listener);
  };
  const withdrawn = () => authoringWithdrawn;
  const files = [...(options.files ?? [])];
  const store = (bytes: Blob): Promise<AssetRef | { readonly refused: string }> => {
    if (options.storing !== undefined) return options.storing(bytes);
    if (answer !== 'completed' && answer !== 'unchanged') return Promise.resolve(answer);
    commits.stored.push(bytes);
    return Promise.resolve(testAssetRef(commits.stored.length));
  };
  const pick = async (): Promise<File[]> => {
    pickerOpenings += 1;
    if (gate.running()) return [];
    return [...(await (options.picker?.(pickerOpenings) ?? files))];
  };
  const hold = createClaimHold();
  const contentChanges = new Set<(next: C) => void>();
  /** A commit answering refused when `live` says it is not, as the host's withdrawn and ended commits do. */
  const guarded =
    <T, O, A>(
      commit: (next: T, options?: O) => Promise<A>,
      live: () => boolean,
      refusal: { refused: string },
    ) =>
    (next: T, options?: O): Promise<A | { readonly refused: string }> =>
      live() ? commit(next, options) : Promise.resolve(refusal);

  function Harness() {
    const [title, setTitle] = useState(options.title ?? 'Resource');
    const [content, setContent] = useState(options.content);
    useEffect(() => {
      contentChanges.add(setContent);
      return () => {
        contentChanges.delete(setContent);
      };
    }, []);
    const [mapValue, setMapValue] = useState(options.map);
    const rail = useMemo(() => createRailStore(), []);
    const exclusiveRunning = useSyncExternalStore(gate.subscribe, gate.running);
    const authoringOff = useSyncExternalStore(subscribeAuthoring, withdrawn);
    const running = exclusiveRunning || authoringOff;
    const host: ResourceHost = useMemo(
      () => ({
        Title: TestTitle({ title }),
        Own: TestOwn,
        rail,
        RenderedMarkdown: TestRenderedMarkdown,
        SourceEditor: TestSourceEditor,
        railBand: RAIL_BAND,
      }),
      [rail, title],
    );
    const settle =
      <T,>(record: T[], apply: (next: T) => void) =>
      (next: T) => {
        record.push(next);
        if (answer === 'completed') apply(next);
        return Promise.resolve(answer);
      };
    const titleCommit = settle(commits.title, setTitle);
    const contentCommit = settle(commits.content, setContent);
    const mapSettle = settle(commits.map, setMapValue);
    const mapCommit = (next: M, hint?: { readonly sizeHint?: Size }) => {
      commits.hints.push(hint?.sizeHint);
      return mapSettle(next);
    };
    const granted = {
      title: grants.title === true ? titleCommit : undefined,
      content: grants.content === true ? contentCommit : undefined,
      map: grants.map === true ? mapCommit : undefined,
      store: grants.store === true ? (options.assets?.store ?? store) : undefined,
    };
    const idle = () => !gate.running();
    const offered = <T,>(commit: T | undefined) => (running ? undefined : commit);
    const plain = <T, O, A>(commit: ((next: T, options?: O) => Promise<A>) | undefined) =>
      offered(commit === undefined ? undefined : guarded(commit, idle, WITHDRAWN));
    const claim: OwnClaim<C, M> = {
      release: () => true,
      exclusively: (work) =>
        gate.exclusively((live) => {
          exclusiveRuns += 1;
          const ownCommit = <T, O, A>(
            commit: ((next: T, options?: O) => Promise<A>) | undefined,
          ) => (commit === undefined ? undefined : guarded(commit, live, ENDED));
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
      url: options.assets?.url ?? TEST_ASSETS.url,
      read: options.assets?.read ?? TEST_ASSETS.read,
      store: plain(granted.store),
      pick: grants.pick === true ? offered(pick) : undefined,
    };
    const surface: Surface<C, M> = {
      resource: { id: 'resource', title, kind: options.kind ?? 'test', content },
      title: { value: title, commit: offeredNow.title },
      content: { value: content, commit: offeredNow.content },
      map: { value: mapValue, commit: offeredNow.map },
      size: options.size ?? DEFAULT_SIZE,
      selected: options.selected ?? false,
      claim:
        grants.claim === true && !running
          ? () => {
              if (options.claimRefused === true) return undefined;
              commits.claims.taken += 1;
              return {
                ...claim,
                release: () => {
                  commits.claims.released += 1;
                  claim.release();
                },
              };
            }
          : undefined,
      assets,
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
  const withdraw = (next: boolean): void => {
    act(() => {
      authoringWithdrawn = next;
      for (const listener of authoringListeners) listener();
    });
  };
  const changeContent = (next: C): void => {
    act(() => {
      for (const change of contentChanges) change(next);
    });
  };
  return Object.assign(rendered, { commits, withdraw, changeContent });
}
