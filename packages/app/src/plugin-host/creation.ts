import {
  resourceDocumentSchema,
  uuidSchema,
  type JsonValue,
  type MapId,
  type MapPosition,
  type ResourceDocument,
  type ResourceId,
  type UUID,
} from '@project/core';
import type { PlacementMode } from '@project/graph';
import type { ObserverErrorReporter, SpaceSession } from '@project/persistence';
import type { Answer } from '@project/resource-api/domain';
import {
  URL_MEDIA_TYPE,
  type Assets,
  type CreationData,
  type OfferedSpace,
} from '@project/resource-api/view';
import type { HostCreation, HostCreationHost, HostNew, PluginCreationEntry } from '@project/ui';
import {
  describeAuthoringRefusal,
  describeSpaceResourceBreak,
  describeSpaceResourceCreationBreak,
  describeSpaceResourceRefusal,
} from '../authoring-refusal';
import type { CreationOutcome } from '../command-outcomes';
import { failureMessage } from '../failure-message';
import type { ComposedApp } from '../compose-app';
import { resolveMap } from '../map-resolution';
import type { NewResource, SettledResult } from '../space-authoring';
import type {
  SpaceResourceAuthoring,
  SpaceResourceCreationResult,
} from '../space-resource-lifecycle';
import { nextSpaceTitle } from '../titles';
import type { PluginGate } from './plugin-gate';

/**
 * Creation through the Resource API (ADR 0142): a plugin declares how its
 * Resources are created, and the host does the creating. A gesture runs a
 * plugin's `run` in the press; whatever it gathers, it then asks the host's
 * `create` for Resources, and the host places them where the gesture was made,
 * in one atomic Edit, continues into the first one's Title, and owns the
 * lifetime of a Space one names (ADR 0074). Which creation a gesture runs, and
 * what a `create` becomes, are the pure core below; the shell carries them out.
 */

// ---- The pure core

/** A plugin's creation offered from one place, with what it creates. */
export interface OfferedCreation<Run> {
  readonly kind: PluginCreationEntry['kind'];
  /** Where it is offered from: only a Dock press is single flight. */
  readonly from: HostCreation['from'];
  readonly name: string;
  readonly run: Run;
}

type RunOf<From extends HostCreation['from']> = Extract<HostCreation, { from: From }>['run'];

/** Every creation the Command Dock offers, in the order given. */
export const dockCreations = (
  entries: readonly PluginCreationEntry[],
): readonly OfferedCreation<RunOf<'dock'>>[] =>
  entries.flatMap(({ kind, name, creation }) =>
    creation.from === 'dock' ? [{ kind, from: creation.from, name, run: creation.run }] : [],
  );

/** Every creation offered on a Resource, given that Resource, in the order given. */
export const resourceCreations = (
  entries: readonly PluginCreationEntry[],
): readonly (OfferedCreation<RunOf<'resource'>> & {
  readonly accepts: Extract<HostCreation, { from: 'resource' }>['accepts'];
})[] =>
  entries.flatMap(({ kind, name, creation }) =>
    creation.from === 'resource'
      ? [{ kind, from: creation.from, name, run: creation.run, accepts: creation.accepts }]
      : [],
  );

/** The first creation offered a Space from a list of Spaces, in the order given. */
export const spaceCreation = (
  entries: readonly PluginCreationEntry[],
): OfferedCreation<RunOf<'spaces'>> | undefined =>
  entries.flatMap(({ kind, name, creation }) =>
    creation.from === 'spaces' ? [{ kind, from: creation.from, name, run: creation.run }] : [],
  )[0];

/** How well one declared media type matches one arriving type: exactly, as a wildcard, or not. */
const typeMatch = (declared: string, arriving: string): 0 | 1 | 2 => {
  if (declared === arriving) return 2;
  if (declared === '*/*') return 1;
  if (declared.endsWith('/*') && arriving.startsWith(declared.slice(0, -1))) return 1;
  return 0;
};

/** The media types arriving data is matched as. */
const arrivingTypes = (data: CreationData): readonly string[] =>
  data.kind === 'url' ? [URL_MEDIA_TYPE] : data.files.map((file) => file.type);

/**
 * The creation arriving data goes to (ADR 0142): among the plugins that accept
 * it, one that names its media type exactly beats one that matches it only by
 * a wildcard, and then the order given, which is build order, decides. Data
 * no plugin accepts goes to none.
 */
export function dataCreation(
  entries: readonly PluginCreationEntry[],
  data: CreationData,
): OfferedCreation<(host: HostCreationHost) => void | Promise<void>> | undefined {
  const types = arrivingTypes(data);
  let best: { readonly score: number; readonly offered: OfferedCreation<RunOf<'data'>> } | null =
    null;
  for (const { kind, name, creation } of entries) {
    if (creation.from !== 'data') continue;
    if (creation.accepts?.(data) === false) continue;
    const score = Math.max(
      0,
      ...types.flatMap((arriving) =>
        creation.types.map((declared) => typeMatch(declared, arriving)),
      ),
    );
    if (score > 0 && (best === null || score > best.score)) {
      best = { score, offered: { kind, from: creation.from, name, run: creation.run } };
    }
  }
  if (best === null) return undefined;
  const { kind, from, name, run } = best.offered;
  return { kind, from, name, run: (host) => run(host, data) };
}

/** Why the host refused a `create` before trying it. */
export type CreationRefusal =
  /** The gesture's creation is no longer available, as when the Dock that offered it has gone. */
  | 'unavailable'
  /** Exclusive work runs elsewhere, which withdraws every creation. */
  | 'exclusive'
  /** What was asked for is not something this gesture may create. */
  | 'not-creatable';

/** What one `create` becomes. */
export type CreatePlan =
  | { readonly kind: 'refused'; readonly refusal: CreationRefusal }
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'edit'; readonly items: readonly NewResource[] }
  | {
      readonly kind: 'new-space';
      readonly title: string | undefined;
      readonly contentFor: (shown: OfferedShown) => JsonValue;
    }
  | {
      readonly kind: 'link';
      readonly space: OfferedSpace;
      readonly title: string | undefined;
      readonly contentFor: (shown: OfferedShown) => JsonValue;
    };

/** The Space a content function is called with. */
export interface OfferedShown {
  readonly spaceId: string;
  readonly map: string;
  readonly graph: string;
}

/** What the decision reads about the moment a `create` is called. */
export interface CreateFacts {
  readonly kind: string;
  readonly available: boolean;
  readonly exclusive: boolean;
  /** The Space a creation from a list of Spaces was offered, if it was. */
  readonly offered: OfferedSpace | undefined;
}

/**
 * What a `create` becomes: refused, nothing, one Edit of ordinary Resources,
 * or one coordinated Space Resource lifecycle operation for a single item
 * whose content names a Space, new or offered. A creation reaches a new Space
 * only by asking for one, and at most one per create, since the coordination
 * makes one Space.
 */
export function decideCreate(items: readonly HostNew[], facts: CreateFacts): CreatePlan {
  if (!facts.available) return { kind: 'refused', refusal: 'unavailable' };
  if (facts.exclusive) return { kind: 'refused', refusal: 'exclusive' };
  if (items.length === 0) return { kind: 'unchanged' };
  const resources: NewResource[] = [];
  for (const item of items) {
    if ('contentFor' in item) {
      if (items.length !== 1) return { kind: 'refused', refusal: 'not-creatable' };
      if (item.newSpace === true) {
        return { kind: 'new-space', title: item.title, contentFor: item.contentFor };
      }
      if (facts.offered === undefined) return { kind: 'refused', refusal: 'not-creatable' };
      return {
        kind: 'link',
        space: facts.offered,
        title: item.title,
        contentFor: item.contentFor,
      };
    }
    resources.push({ kind: facts.kind, title: item.title, content: item.content });
  }
  return { kind: 'edit', items: resources };
}

/** The words a refusal the host made itself is said in. */
const REFUSAL_WORDS = {
  unavailable: 'Resources cannot be created here now.',
  exclusive: describeAuthoringRefusal({ code: 'exclusive-work-running' }),
  'not-creatable': 'This Resource cannot be created here.',
} as const satisfies Readonly<Record<CreationRefusal, string>>;

/**
 * Whether the host tells the author of its own refusal. A creation no longer
 * available has no one left to tell.
 */
const REPORTED = {
  unavailable: false,
  exclusive: true,
  'not-creatable': true,
} as const satisfies Readonly<Record<CreationRefusal, boolean>>;

// ---- The shell

/** Where a gesture places what it creates, read when `create` is called. */
export interface CreationPlace {
  readonly anchor: MapPosition;
  readonly placement: PlacementMode;
  /**
   * The Map `anchor` is a point on; absent, the host's own. A Dock press names
   * the Map drawn when its Resources are asked for, as a picker may answer
   * after the author has moved to another.
   */
  readonly mapId?: MapId | undefined;
}

/**
 * The Dock creations in flight, by kind, kept by whatever outlives one Map's
 * host, so moving to another Map keeps a creation's single flight.
 */
export interface CreationFlights {
  readonly has: (kind: string) => boolean;
  readonly start: (kind: string) => void;
  readonly end: (kind: string) => void;
  readonly kinds: () => ReadonlySet<string>;
}

/** Flights that tell `onChange` the kinds in flight whenever that set changes. */
export function createCreationFlights(
  onChange: (kinds: ReadonlySet<string>) => void,
): CreationFlights {
  const running = new Map<string, number>();
  const kinds = (): ReadonlySet<string> => new Set(running.keys());
  const move = (kind: string, by: 1 | -1): void => {
    const count = (running.get(kind) ?? 0) + by;
    const changed = count === 0 || !running.has(kind);
    if (count <= 0) running.delete(kind);
    else running.set(kind, count);
    if (changed) onChange(kinds());
  };
  return {
    has: (kind) => running.has(kind),
    start: (kind) => move(kind, 1),
    end: (kind) => move(kind, -1),
    kinds,
  };
}

/** One gesture that runs a creation. */
export interface CreationGesture {
  readonly place: () => CreationPlace;
  /**
   * Whether the creation is still available, asked when `create` is called,
   * before each store and before a report; absent, it is.
   */
  readonly available?: (() => boolean) | undefined;
  /**
   * Whether the gesture is single flight for its kind: from its press until
   * its `run` settles, a second gesture of the kind that is also single flight
   * is ignored. Absent, a Dock creation is and every other is not; the
   * canvas's own Add Resource runs a Dock creation without it.
   */
  readonly flight?: boolean | undefined;
  /** The Space a creation from a list of Spaces was offered. */
  readonly offered?: OfferedSpace | undefined;
  /**
   * Where the answer goes when the surface that asked keeps it, as the
   * Resources list keeps its sentence; absent, a refusal is the standing
   * notice.
   */
  readonly settle?: ((refusal: string | null) => void) | undefined;
  /**
   * Whether a completed creation continues into the new Resource's Title;
   * absent, it does. The Resources list keeps the reader in the list, so a
   * Space Resource placed from it does not.
   */
  readonly continues?: boolean | undefined;
}

export interface CreationHostDependencies {
  readonly app: Pick<ComposedApp, 'authoring' | 'commandOutcomes' | 'currentSpace' | 'surface'>;
  readonly session: SpaceSession;
  readonly spaceResources: SpaceResourceAuthoring;
  readonly gate: PluginGate;
  readonly assets: Assets;
  /** The Map the gestures are made on. */
  readonly mapId: MapId;
  readonly reportBreak: ObserverErrorReporter;
  /** The Dock creations in flight, shared with every host the surface builds. */
  readonly flights: CreationFlights;
}

export interface CreationHostShell {
  /**
   * Run `run` in this press, with a host whose `create` places at the gesture,
   * settling once `run` has; a `run` that throws or rejects is reported.
   */
  readonly run: (
    offered: OfferedCreation<(host: HostCreationHost) => void | Promise<void>>,
    gesture: CreationGesture,
  ) => Promise<void>;
}

/** What a performed create answered, and the Resource it continues at. */
interface Performed {
  readonly answer: Answer;
  readonly createdResourceId?: ResourceId | undefined;
}

const COMPLETED: Performed = { answer: 'completed' };

/** A settled Edit as the plugin reads it, and the Resource it made. */
const performedEdit = (result: SettledResult): Performed => {
  switch (result.kind) {
    case 'completed':
      return { answer: 'completed', createdResourceId: result.createdResourceId };
    case 'unchanged':
      return { answer: 'unchanged' };
    case 'refused':
      return { answer: { refused: describeAuthoringRefusal(result.refusal) } };
  }
};

/** A Resource document from a plugin's content for the Space it names, or a throw. */
const documentFor = (
  kind: string,
  title: string,
  contentFor: (shown: OfferedShown) => JsonValue,
  shown: OfferedShown,
): ResourceDocument => resourceDocumentSchema.parse({ title, kind, content: contentFor(shown) });

/**
 * The host behind every creation gesture on one Map surface. A Dock press is
 * single flight for its kind from the press itself, so a picker it opens is
 * inside the flight: while one runs, another press of that kind is ignored
 * before its `run` is called. A creation of another kind, or from anywhere
 * else, still runs, as a Markdown Resource may land, or a listed Space be
 * shown, while a new Space's coordination is open.
 */
export function createCreationHost(deps: CreationHostDependencies): CreationHostShell {
  const { app, session, spaceResources, gate, assets, reportBreak, flights } = deps;
  const { commandOutcomes, currentSpace, surface } = app;
  const mapOf = (place: CreationPlace): MapId => place.mapId ?? deps.mapId;

  /** An Edit of ordinary Resources, on the Map the gesture was made on, wherever the canvas is now. */
  const edit = (items: readonly NewResource[], place: CreationPlace) =>
    new Promise<Performed>((resolve) => {
      const { anchor, placement } = place;
      const mapId = mapOf(place);
      const completion = { kind: 'created-resources', items, anchor, placement } as const;
      const settle = (result: SettledResult): void => resolve(performedEdit(result));
      // Addressed to the Map the gesture was made on, because the anchor is a
      // point on that Map: while the surface still draws it this is the
      // surface's Edit; otherwise it writes the Map it was aimed at without
      // moving the canvas. A Map that has gone refuses `map-not-found`.
      const result =
        surface.context().mapId === mapId
          ? surface.authoring.complete(completion, settle)
          : app.authoring.complete({ kind: 'drawn', mapId, graphId: null }, completion, settle);
      if (result.kind !== 'queued') settle(result);
    });

  /** The coordinated lifecycle's create or link, answering rather than rejecting. */
  const lifecycle = async (
    plan: Extract<CreatePlan, { kind: 'new-space' | 'link' }>,
    kind: string,
    place: CreationPlace,
  ): Promise<Performed> => {
    try {
      const containingSpaceId: UUID = currentSpace().id;
      const resolved = resolveMap(currentSpace(), mapOf(place));
      const position = place.anchor;
      let result: SpaceResourceCreationResult;
      if (plan.kind === 'new-space') {
        // One title, minted from this Space's own Resource titles, names both
        // the Space and the Resource, so the two agree at creation.
        const title = plan.title ?? nextSpaceTitle(session.getState().working);
        result = await spaceResources.create({
          containingSpaceId,
          mapId: resolved.map.id,
          title,
          position,
          document: (shown) => documentFor(kind, title, plan.contentFor, shown),
        });
      } else {
        const title = plan.title ?? plan.space.title;
        result = await spaceResources.link({
          containingSpaceId,
          mapId: resolved.map.id,
          title,
          position,
          targetSpaceId: uuidSchema.parse(plan.space.spaceId),
          document: (shown) => documentFor(kind, title, plan.contentFor, shown),
        });
      }
      switch (result.kind) {
        case 'completed':
          return { answer: 'completed', createdResourceId: result.resourceId };
        case 'unchanged':
          return { answer: 'unchanged' };
        case 'refused':
          return { answer: { refused: describeSpaceResourceRefusal(result.refusal) } };
      }
    } catch (failure) {
      // Both: the author is told on the creation's own channel, and the
      // diagnostic still reaches the operational one.
      reportBreak(failure);
      const words =
        plan.kind === 'new-space'
          ? describeSpaceResourceCreationBreak(failure)
          : describeSpaceResourceBreak(failure);
      return { answer: { refused: words } };
    }
  };

  /** Continue into the created Resource's Title, owed only while the gesture's Map is still drawn. */
  const continueAt = (createdResourceId: ResourceId | undefined, mapId: MapId) =>
    createdResourceId === undefined || surface.context().mapId !== mapId
      ? null
      : ({
          target: { kind: 'resource', resourceId: createdResourceId },
          select: true,
          then: 'rename',
        } as const);

  /** Tell the author how a creation settled: on the surface that asked, or as the standing notice. */
  const tell = (
    name: string,
    gesture: CreationGesture,
    performed: Performed,
    mapId: MapId = deps.mapId,
  ): void => {
    const { answer } = performed;
    const refused = answer === 'completed' || answer === 'unchanged' ? null : answer.refused;
    if (gesture.settle !== undefined) {
      gesture.settle(refused);
    } else {
      const outcome: CreationOutcome =
        refused === null
          ? { kind: 'completed', createdResourceId: performed.createdResourceId }
          : { kind: 'refused', report: { title: `${name} not created`, message: refused } };
      commandOutcomes.run('resource-create', () => outcome);
    }
    // Requested on this surface's own continuation rather than through command
    // outcomes, which continue on the application's canvas: a Map drawn inside
    // a Space Resource continues in its own drawing.
    if (refused !== null || gesture.continues === false) return;
    const pending = continueAt(performed.createdResourceId, mapId);
    if (pending !== null) surface.continuation.request(pending);
  };

  const create = async (
    offered: OfferedCreation<unknown>,
    gesture: CreationGesture,
    items: readonly HostNew[],
  ): Promise<Answer> => {
    const plan = decideCreate(items, {
      kind: offered.kind,
      available: gesture.available?.() ?? true,
      exclusive: gate.withdraws(),
      offered: gesture.offered,
    });
    if (plan.kind === 'unchanged') return 'unchanged';
    if (plan.kind === 'refused') {
      const answer = { refused: REFUSAL_WORDS[plan.refusal] };
      if (REPORTED[plan.refusal]) tell(offered.name, gesture, { answer });
      return answer;
    }
    const place = gesture.place();
    const performed =
      plan.kind === 'edit'
        ? await edit(plan.items, place)
        : await lifecycle(plan, offered.kind, place);
    tell(
      offered.name,
      gesture,
      performed.answer === 'unchanged' ? COMPLETED : performed,
      mapOf(place),
    );
    return performed.answer;
  };

  /** Run `offered` for one gesture, answering once its `run` has settled. */
  const runOnce = (
    offered: OfferedCreation<(host: HostCreationHost) => void | Promise<void>>,
    gesture: CreationGesture,
  ): Promise<void> => {
    const available = (): boolean => gesture.available?.() ?? true;
    const { store } = assets;
    const host: HostCreationHost = {
      // A store is asked whether the creation is still available first, so
      // bytes gathered after the Dock that offered it has gone are never sent.
      assets: {
        ...assets,
        store:
          store === undefined
            ? undefined
            : (bytes) =>
                available()
                  ? store(bytes)
                  : Promise.resolve({ refused: REFUSAL_WORDS.unavailable }),
      },
      create: (items) => create(offered, gesture, items),
      report: (words) => {
        if (available()) tell(offered.name, gesture, { answer: { refused: words } });
      },
    };
    // A creation that breaks is told as the channel tells every break: the
    // author hears the failure's words, and the diagnostic still reaches the
    // operational channel.
    const broke: ObserverErrorReporter = (failure) => {
      reportBreak(failure);
      tell(offered.name, gesture, { answer: { refused: failureMessage(failure) } });
    };
    try {
      const ran = offered.run(host);
      return ran instanceof Promise ? ran.catch(broke) : Promise.resolve();
    } catch (failure) {
      broke(failure);
      return Promise.resolve();
    }
  };

  const run: CreationHostShell['run'] = async (offered, gesture) => {
    const flies = gesture.flight ?? offered.from === 'dock';
    if (!flies) return runOnce(offered, gesture);
    if (flights.has(offered.kind)) return;
    flights.start(offered.kind);
    try {
      await runOnce(offered, gesture);
    } finally {
      flights.end(offered.kind);
    }
  };

  return { run };
}
