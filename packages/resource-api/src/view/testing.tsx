import { useMemo, useState, useSyncExternalStore, type ComponentType } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import type { Answer, AssetRef, Size } from '../domain';
import {
  createRailStore,
  ResourceHostProvider,
  type Exclusive,
  type OwnClaim,
  type OwnProps,
  type PluginViewProps,
  type ResourceHost,
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

/** What a rendered plugin's commits received, in order. */
export interface Commits<C, M> {
  readonly title: string[];
  readonly content: C[];
  readonly map: M[];
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
}

export type RenderedPlugin<C, M> = RenderResult & { readonly commits: Commits<C, M> };

const DEFAULT_SIZE: Size = { width: 200, height: 120 };

/** The embedding a test surface hands its plugin: one component for every render, as a host must. */
function TestEmbed() {
  return null;
}

const TEST_ASSETS = {
  url: (ref: AssetRef) => ref,
  read: () => Promise.resolve({ refused: 'No asset store in this test.' }),
};

function TestTitle({ title }: { readonly title: string }) {
  return function Title({ className }: TitleProps) {
    return (
      <h2 className={className} data-testid="plugin-title">
        {title}
      </h2>
    );
  };
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
  const commits: Commits<C, M> = { title: [], content: [], map: [] };
  const grants = options.grants ?? {};
  const answer: Answer = options.answer ?? 'completed';

  function Harness() {
    const [title, setTitle] = useState(options.title ?? 'Resource');
    const [content, setContent] = useState(options.content);
    const [mapValue, setMapValue] = useState(options.map);
    const rail = useMemo(() => createRailStore(), []);
    const host: ResourceHost = useMemo(
      () => ({ Title: TestTitle({ title }), Own: TestOwn, rail }),
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
    const mapCommit = settle(commits.map, setMapValue);
    const granted = {
      title: grants.title === true ? titleCommit : undefined,
      content: grants.content === true ? contentCommit : undefined,
      map: grants.map === true ? mapCommit : undefined,
    };
    const own: Exclusive<C, M> = granted;
    const claim: OwnClaim<C, M> = { release: () => true, exclusively: (work) => work(own) };
    const surface: Surface<C, M> = {
      resource: { id: 'resource', title, kind: options.kind ?? 'test', content },
      title: { value: title, commit: granted.title },
      content: { value: content, commit: granted.content },
      map: { value: mapValue, commit: granted.map },
      size: options.size ?? DEFAULT_SIZE,
      selected: options.selected ?? false,
      claim: grants.claim === true ? () => claim : undefined,
      assets: TEST_ASSETS,
      Embed: TestEmbed,
    };
    return (
      <ResourceHostProvider host={host}>
        <View surface={surface} />
        <TestRail host={rail} />
      </ResourceHostProvider>
    );
  }

  const rendered = render(<Harness />);
  return Object.assign(rendered, { commits });
}
