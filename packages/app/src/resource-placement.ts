import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type {
  Map as SpaceMap,
  MapId,
  MapPosition,
  Resource,
  ResourceId,
  ResourcePlacement,
  UUID,
} from '@project/core';
import { resourceSize } from '@project/core';
import type { ObserverErrorReporter } from '@project/persistence';
import type { CreationData } from '@project/resource-api/view';
import { pluginCreations, usePluginAssets, type EntityActionOutcome } from '@project/ui';
import { describeAuthoringRefusal } from './authoring-refusal';
import type { OpenSpace } from './open-spaces';
import {
  createCreationFlights,
  createCreationHost,
  dataCreation,
  dockCreations,
  resourceCreations,
  spaceCreation,
} from './plugin-host/creation';
import { usePluginGate } from './plugin-host/plugin-gate-context';
import { RESOURCE_HEIGHT, RESOURCE_WIDTH } from './resource';
import {
  completedResourceDrag,
  completedSpaceDrag,
  type ResourcesDrag,
  type ResourcesPopoverSpace,
  type SettlePlacement,
  type SettleResource,
} from './resources-drag';
import { useVisibleCentre, type VisibleCentreReporting } from './visible-centre';

/** Every plugin's creations, in build order: the same list for every surface. */
const CREATIONS = pluginCreations();

/** Every creation the Command Dock offers. */
export const DOCK_CREATIONS = dockCreations(CREATIONS);

/** Every creation offered on a Resource, given that Resource. */
export const RESOURCE_CREATIONS = resourceCreations(CREATIONS);

/** Whether arriving data is something a plugin creates a Resource from. */
export const createsFromData = (data: CreationData): boolean =>
  dataCreation(CREATIONS, data) !== undefined;

/** What is said where no plugin offers a Space a Resource. */
const NO_SPACE_CREATION = 'A Space cannot be shown here.';

/** No creation runs. */
export const NOTHING_CREATING: ReadonlySet<string> = new Set();

/**
 * How far a new Reference Resource steps past the Resource it was created from:
 * its Target's size less a quarter of the Closed Size on both axes.
 *
 * Overlap is authored rather than avoided — a free-position search is a placement
 * algorithm, and ADR 0086 keeps those behind an Edit — so this is deliberately
 * less than a whole step. It is more than half a step because at exactly half the
 * new Reference Resource's centre lands on the Target's bottom-right corner, and the Target
 * takes the pointer there: three quarters leaves a quarter-Resource corner of
 * overlap and a centre the author can reach.
 */
export const REFERENCE_OFFSET_RATIO = 0.75;

/**
 * Where a Reference Resource created from a Resource lands.
 *
 * **A fixed offset from the source**, so the Reference Resource lands where the
 * author is looking; a Resource this Map does not place has no offset to take,
 * so its Reference Resource lands at the visible centre like any other creation.
 *
 * **The offset is measured from the Target's bottom-right corner**, so a
 * resized Target is overlapped by the same quarter-Resource corner as one at
 * the Closed Size.
 */
export function referenceAnchor(
  at: ResourcePlacement | undefined,
  centreAnchor: () => MapPosition,
): MapPosition {
  if (at === undefined) return centreAnchor();
  const size = resourceSize(at);
  return {
    x: at.x + size.width - RESOURCE_WIDTH + Math.round(RESOURCE_WIDTH * REFERENCE_OFFSET_RATIO),
    y: at.y + size.height - RESOURCE_HEIGHT + Math.round(RESOURCE_HEIGHT * REFERENCE_OFFSET_RATIO),
  };
}

export interface ResourcePlacementInput {
  /** The Map the canvas draws. */
  readonly map: SpaceMap;
  readonly presenting: boolean;
  /** The replacement epoch: a replacement discards a drag in flight. */
  readonly replacementEpoch: number;
  readonly reportBreak: ObserverErrorReporter;
}

export interface ResourcePlacementCommands extends VisibleCentreReporting {
  /**
   * Run the Command Dock creation of `kind`, placed at the visible centre as
   * it stands when the Resources are asked for; `available` is asked again
   * then, and a creation no longer available creates nothing.
   */
  readonly createFromDock: (kind: string, available?: () => boolean) => void;
  /**
   * Run the Dock's creation of `kind` from the canvas's own Add Resource,
   * placed as a Dock press is. It is not a Dock press, so it is not single
   * flight: a quick second Add runs too.
   */
  readonly createOnCanvas: (kind: string) => void;
  /** The kinds whose creation is between its `create` and its installed Edit. */
  readonly creating: ReadonlySet<string>;
  /** Place a Resource this Map leaves out, answering a refusal's sentence or `null`. */
  readonly addExistingResource: (
    resourceId: ResourceId,
    anchor: MapPosition,
    focus: boolean,
  ) => string | null;
  /** Show an existing Space in a Resource, answering a refusal's sentence or `null`. */
  readonly addSpaceResourceFor: (
    space: ResourcesPopoverSpace,
    anchor: MapPosition,
  ) => Promise<string | null>;
  /** Data dropped or pasted on the canvas: the plugin that takes it creates from it at `anchor`. */
  readonly createFromData: (data: CreationData, anchor: MapPosition) => void;
  /** Run a creation offered on `resource`, of the kind given, from that Resource. */
  readonly createFromResource: (kind: string, resource: Resource) => EntityActionOutcome;
  /** A drag from the Resources list began over a Resource row. */
  readonly startResourceDrag: (resourceId: ResourceId, settle: SettleResource) => void;
  /** A drag from the Resources list began over a Space row. */
  readonly startSpaceDrag: (space: ResourcesPopoverSpace, settle: SettlePlacement) => void;
  readonly endDrag: () => void;
  /** A Resource dropped on the canvas from the Resources list. */
  readonly dropExistingResource: (resourceId: ResourceId, anchor: MapPosition) => void;
  /** A Space dropped on the canvas from the Resources list. */
  readonly dropSpace: (spaceId: UUID, anchor: MapPosition) => void;
}

/**
 * Every way a Resource arrives on the drawn Map — created, added from the
 * Resources list, or dropped there — and the visible centre a Resource placed
 * by a press lands at.
 *
 * Each creation completes its Edit on activation and continues at
 * the Resource it made. A drag from the Resources list is held here from its
 * start to its drop, and is dropped with nothing placed when the Map, the mode
 * or the Space under it changes.
 */
export function useResourcePlacement(
  { app, session, spaceResources }: OpenSpace,
  { map: selectedMap, presenting, replacementEpoch, reportBreak }: ResourcePlacementInput,
): ResourcePlacementCommands {
  const { reportVisibleCentre, centreAnchor } = useVisibleCentre();
  const { surface } = app;
  const { authoring, adapter, continuation } = surface;
  const mapId: MapId = selectedMap.id;
  const gate = usePluginGate();
  const assets = usePluginAssets();
  const [creating, setCreating] = useState<ReadonlySet<string>>(NOTHING_CREATING);
  // Kept across the host each Map builds, so a Dock creation stays single
  // flight while the author moves to another Map.
  const [flights] = useState(() => createCreationFlights(setCreating));
  // The Map drawn now, which a Dock press reads when its Resources are asked
  // for, after a picker that may outlast the Map it was pressed on.
  const drawnMapId = useRef(mapId);
  // Updated in the commit that draws another Map, before any later task, a
  // picker's answer among them, can read it.
  useLayoutEffect(() => {
    drawnMapId.current = mapId;
  }, [mapId]);

  const host = useMemo(
    () =>
      createCreationHost({
        app,
        session,
        spaceResources,
        gate,
        assets,
        mapId,
        reportBreak,
        flights,
      }),
    [app, session, spaceResources, gate, assets, mapId, reportBreak, flights],
  );

  /**
   * A Dock creation: one press, placed at the visible centre of the Map drawn
   * when its Resources are asked for, which is after a picker answers for one
   * that opens one, so a picture picked after moving to another Map lands
   * there. The toolbar stays available for an empty authored Map: it is
   * the zero-Resource Space's way to create the first Resource.
   */
  const runAtCentre = useCallback(
    (kind: string, flight: boolean, available?: () => boolean): void => {
      const offered = DOCK_CREATIONS.find((creation) => creation.kind === kind);
      if (offered === undefined) return;
      void host.run(offered, {
        place: () => ({
          anchor: centreAnchor(),
          placement: 'avoidingOverlap',
          mapId: drawnMapId.current,
        }),
        available,
        flight,
      });
    },
    [host, centreAnchor],
  );
  const createFromDock = useCallback(
    (kind: string, available?: () => boolean): void => runAtCentre(kind, true, available),
    [runAtCentre],
  );
  const createOnCanvas = useCallback(
    (kind: string): void => runAtCentre(kind, false),
    [runAtCentre],
  );

  /** Data aimed at a point keeps it exactly. Data no plugin takes creates nothing. */
  const createFromData = useCallback(
    (data: CreationData, anchor: MapPosition): void => {
      const offered = dataCreation(CREATIONS, data);
      if (offered === undefined) return;
      void host.run(offered, { place: () => ({ anchor, placement: 'exact' }) });
    },
    [host],
  );

  /**
   * **The gesture supplies the Resource, so nothing is chosen first**, and
   * what is created lands a fixed step past it (`referenceAnchor`). A refusal
   * takes the standing notice rather than the menu it was pressed in: this
   * command closes its menu, because it moves the caret onto the canvas.
   */
  const createFromResource = useCallback(
    (kind: string, resource: Resource): EntityActionOutcome => {
      const offered = RESOURCE_CREATIONS.find((creation) => creation.kind === kind);
      if (offered === undefined) return 'failed';
      void host.run(
        { ...offered, run: (creationHost) => offered.run(creationHost, resource) },
        {
          place: () => ({
            anchor: referenceAnchor(selectedMap.positions[resource.id], centreAnchor),
            placement: 'avoidingOverlap',
          }),
        },
      );
      return 'done';
    },
    [host, selectedMap, centreAnchor],
  );

  /**
   * Showing an existing Space from the surface that offers it, so a reader who
   * found it in the list never meets a picker. The anchor is the caller's: a
   * press passes the visible centre and a drop the point it landed on. Answers
   * rather than rejects: the list spends this on a press or a drop of one of
   * its rows, and keeps the sentence.
   */
  const addSpaceResourceFor = useCallback(
    (space: ResourcesPopoverSpace, anchor: MapPosition): Promise<string | null> => {
      const offered = spaceCreation(CREATIONS);
      if (offered === undefined) return Promise.resolve(NO_SPACE_CREATION);
      return new Promise((resolve) => {
        const offeredSpace = { spaceId: space.id, title: space.title };
        void host
          .run(
            { ...offered, run: (creationHost) => offered.run(creationHost, offeredSpace) },
            {
              place: () => ({ anchor, placement: 'avoidingOverlap' }),
              offered: offeredSpace,
              settle: resolve,
              // The list keeps the reader, as it does after adding a Resource.
              continues: false,
            },
          )
          // A creation that asked for nothing has nothing to say.
          .then(() => resolve(null));
      });
    },
    [host],
  );

  /**
   * The refusal goes back to the caller, and only the caller can place it.
   *
   * Both `added-resource-to-map` refusals this can produce
   * (`resource-already-in-map`, `resource-not-found`) mean the Resource just
   * left the list the reader activated it in. The Resources list is still on
   * screen though, and it is the surface that asked — so it keeps the sentence.
   */
  const addExistingResource = useCallback(
    (resourceId: ResourceId, anchor: MapPosition, focus: boolean): string | null => {
      const result = authoring.complete({ kind: 'added-resource-to-map', resourceId, anchor });
      if (result.kind === 'refused') return describeAuthoringRefusal(result.refusal);
      if (result.kind !== 'completed') return null;
      adapter.getState().selectResource(resourceId);
      // The Resource is not drawn yet — the projection carrying this Edit
      // arrives a strategy later — so the continuation waits for it.
      if (focus) {
        continuation.request({
          target: { kind: 'resource', resourceId },
          select: false,
          then: 'focus',
        });
      }
      return null;
    },
    [authoring, adapter, continuation],
  );

  const resourcesDrag = useRef<ResourcesDrag | null>(null);
  useEffect(() => {
    resourcesDrag.current = null;
  }, [mapId, presenting, replacementEpoch]);

  const startResourceDrag = useCallback(
    (resourceId: ResourceId, settle: SettleResource) => {
      resourcesDrag.current = { kind: 'resource', resourceId, mapId, settle };
    },
    [mapId],
  );
  const startSpaceDrag = useCallback(
    (space: ResourcesPopoverSpace, settle: SettlePlacement) => {
      resourcesDrag.current = { kind: 'space', space, mapId, settle };
    },
    [mapId],
  );
  const endDrag = useCallback(() => {
    resourcesDrag.current = null;
  }, []);

  const dropExistingResource = useCallback(
    (resourceId: ResourceId, anchor: MapPosition): void => {
      const drag = completedResourceDrag(resourcesDrag.current, resourceId, mapId);
      resourcesDrag.current = null;
      if (drag === null) return;
      drag.settle(addExistingResource(resourceId, anchor, false));
    },
    [addExistingResource, mapId],
  );

  /**
   * The same placement a press spends, at the drop point, with its answer
   * settled on the list that started the drag. `addSpaceResourceFor` answers
   * rather than rejects, so the settlement is all that is left to do here.
   */
  const dropSpace = useCallback(
    (spaceId: UUID, anchor: MapPosition): void => {
      const drag = completedSpaceDrag(resourcesDrag.current, spaceId, mapId);
      resourcesDrag.current = null;
      if (drag === null) return;
      drag.settle(addSpaceResourceFor(drag.space, anchor));
    },
    [addSpaceResourceFor, mapId],
  );

  return useMemo(
    () => ({
      reportVisibleCentre,
      centreAnchor,
      createFromDock,
      createOnCanvas,
      creating,
      addExistingResource,
      addSpaceResourceFor,
      createFromData,
      createFromResource,
      startResourceDrag,
      startSpaceDrag,
      endDrag,
      dropExistingResource,
      dropSpace,
    }),
    [
      reportVisibleCentre,
      centreAnchor,
      createFromDock,
      createOnCanvas,
      creating,
      addExistingResource,
      addSpaceResourceFor,
      createFromData,
      createFromResource,
      startResourceDrag,
      startSpaceDrag,
      endDrag,
      dropExistingResource,
      dropSpace,
    ],
  );
}
