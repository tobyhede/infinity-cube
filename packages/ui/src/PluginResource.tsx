import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import {
  COLLAPSED_RESOURCE_SIZE,
  titleName,
  type JsonValue,
  type ResourceKind,
  type Resource,
  type ResourceShape,
} from '@project/core';
import type { Answer } from '@project/resource-api/domain';
import {
  RAIL_BAND,
  type Assets,
  type OwnProps,
  type RailCommand,
} from '@project/resource-api/view';
import {
  createRailStore,
  ResourceHostProvider,
  type ResourceHost,
} from '@project/resource-api/view/host';
import { Card } from './components/card';
import { EntityActions, EntityActionsTrigger, type EntityActionGroup } from './EntityActionsMenu';
import { graphPaint } from './graph-color';
import { EntityActionsIcon } from './icons';
import {
  usePluginEntry,
  type PluginEntry,
  type PluginHostClaim,
  type PluginOperations,
} from './plugin-catalog';
import { readingAssets, usePluginAssets } from './plugin-assets';
import { RailChoiceMenu } from './RailChoiceMenu';
import { MapTitleContext, MapTitleView, type MapTitle } from './MapTitle';
import {
  EmbeddingProvider,
  HostEmbed,
  MapEmbedSlotProvider,
  type Embedding,
  type MapEmbedRequest,
  type MapEmbedSlot,
} from './ResourceEmbedding';
import { createSurfaceLifetime, type SurfaceLifetime } from './surface-lifetime';
import { ResourceFailureBoundary } from './ResourceFailureBoundary';
import { HostRenderedMarkdown, HostSourceEditor } from './ResourceTextHost';
import {
  ResourceRailAction,
  ResourceRailActions,
  ResourceRailKindActions,
} from './ResourceRailActions';
import { resourceShapeOutline, type OutlineSize } from './resource-shape-outline';
import { ResourceShapeOutlineDrawing } from './ResourceShapeOutlineDrawing';
import './canvas-resource.css';
import './target-canvas.css';

/**
 * The Map surface's host for a Resource a plugin draws (ADR 0142).
 *
 * The canvas owns the rect and what is drawn on it from outside the plugin: the
 * Graph-colour border and the selection ring stroked on the plugin's declared
 * outline (ADR 0135, ADR 0139), receding, the rail (`CommandToolbar`, here the
 * Resource rail's `ResourceRailActions`) carrying the host's own commands and
 * the plugin's, and a failure boundary. The plugin owns every pixel inside its
 * outline, drawn by its one view with the Title, content and Map content and
 * the commits this surface offers.
 *
 * Withdrawal is enforced as well as offered: a commit the plugin kept from an
 * earlier render answers refused once this surface has unmounted.
 */

/** External visual facts the adapter knows and the host cannot derive:
 *  React Flow selection, drag and inline-title-editing. Hover and the
 *  selected+hover combination are the Resource's own CSS, driven by real
 *  pointer/focus pseudo-classes rather than a computed React state. */
export type CanvasResourceState = 'rest' | 'selected' | 'dragging' | 'editing';

/**
 * How far a Resource leans while it is being moved.
 *
 * The number lives here and nowhere else. CSS reads it as
 * `--canvas-resource-drag-tilt`, published below. The canvas reads the same
 * number for an embedded canvas this element cannot carry — React Flow
 * renders sub-flow children as DOM siblings of their parent's wrapper.
 * `embedded-map.test.ts` holds that motion as a rigid one.
 */
export const CANVAS_RESOURCE_DRAG_TILT_DEGREES = -1;

const SURFACE_GONE = {
  refused: 'This Resource is no longer drawn here.',
} as const satisfies Answer;
const HELD_ELSEWHERE = {
  refused: 'This Resource is being changed where it is drawn elsewhere. Try again when that ends.',
} as const satisfies Answer;

/** Stop the canvas reading a press or key meant for the plugin's own region. */
const stop = (event: PointerEvent | KeyboardEvent): void => {
  event.stopPropagation();
};

/** The plugin's own region on the Map: pointer and key events are the plugin's (ADR 0142). */
function MapOwn({ children, className }: OwnProps) {
  return (
    <div
      className={['nodrag nopan nowheel nokey', className].filter(Boolean).join(' ')}
      onPointerDown={stop}
      onKeyDown={(event) => {
        // A canvas shortcut never interrupts an IME composition, and inside
        // the plugin's region the key is the plugin's either way.
        stop(event);
      }}
    >
      {children}
    </div>
  );
}

/** A plugin's rail commands, drawn as the rail draws every command. */
function PluginRailCommands({ commands }: { readonly commands: readonly RailCommand[] }) {
  return (
    <>
      {commands.map((command) =>
        command.kind === 'action' ? (
          <ResourceRailAction
            key={command.id}
            aria-label={command.label}
            aria-keyshortcuts={command.keyshortcuts}
            // A command naming keys belongs to work running in the rect, which
            // has the focus: pressing it does not take the focus away.
            holdFocus={command.keyshortcuts !== undefined}
            disabled={command.disabled === true}
            onClick={command.run}
          >
            {command.icon}
          </ResourceRailAction>
        ) : (
          <RailChoiceMenu key={command.id} command={command} />
        ),
      )}
    </>
  );
}

type PluginResourceStyle = CSSProperties & {
  readonly '--canvas-resource-graph': string;
  readonly '--canvas-resource-border': string;
  readonly '--canvas-resource-drag-tilt': string;
};

export interface PluginResourceProps {
  readonly resourceId: string;
  readonly kind: ResourceKind;
  readonly title: MapTitle;
  /** The Resource's content as stored, which its plugin's schema parses. */
  readonly content: unknown;
  /** The Map content the plugin is given on this Map. */
  readonly mapContent: JsonValue;
  /**
   * The Resources this one's content references, as they stand, which its
   * plugin may draw inside its rect through the embedding (ADR 0142).
   */
  readonly embeddable?: readonly Resource[] | undefined;
  /** The outline the plugin declares for that Map content. */
  readonly outline: ResourceShape;
  readonly size?: OutlineSize | undefined;
  readonly state: CanvasResourceState;
  /** The Active Graph's colour, which the Title's hover and caret treatment draws in. */
  readonly graphColor: string;
  /** The colour of the Graph this Resource is drawn in, which its border takes (ADR 0135). */
  readonly borderColor?: string | undefined;
  readonly readOnly: boolean;
  readonly operations: PluginOperations;
  readonly entityActions?: readonly EntityActionGroup[] | undefined;
  readonly contextNotice?: string | null | undefined;
  /**
   * Where the rail is drawn, and when; absent, it is drawn in the rect.
   * `held` says the plugin holds a Claim, so its rail carries the ends of an
   * edit that must stay reachable whether or not the Resource is selected.
   */
  readonly renderToolbar?: ((toolbar: ReactNode, held: boolean) => ReactNode) | undefined;
  /** Told what a plugin threw while drawing. */
  readonly onFailure?: ((error: Error) => void) | undefined;
  /**
   * Told what a Map embedding drawn in this rect asks for, and `null` once it
   * is gone, so the canvas draws the Map over the rect (ADR 0142), with the
   * key of the drawing it is drawn in, whose Claim the embedding is passed.
   */
  readonly onMapEmbed?: ((request: MapEmbedRequest | null, drawing: symbol) => void) | undefined;
  /** Told how far a Map embedding's room stops short of the rect's bottom, which clips the Map. */
  readonly onBodyHeightChange?: ((height: number | null) => void) | undefined;
}

/**
 * What the surface offers, less what has gone with an unmounted surface, and
 * less every commit while another drawing of the Resource holds a Claim.
 */
function guarded(
  operations: PluginOperations,
  lifetime: SurfaceLifetime,
  readOnly: boolean,
  onHeld: (change: 1 | -1) => void,
): PluginOperations {
  if (readOnly) return { kind: operations.kind };
  const withheld = (): { readonly refused: string } | null => {
    if (!lifetime.drawn()) return SURFACE_GONE;
    return operations.claimHolder?.(lifetime.drawing) === 'another-drawing' ? HELD_ELSEWHERE : null;
  };
  const whileMounted =
    <A extends readonly unknown[]>(commit: (...args: A) => Promise<Answer>) =>
    (...args: A): Promise<Answer> => {
      const refusal = withheld();
      return refusal === null ? commit(...args) : Promise.resolve(refusal);
    };
  const { commitTitle, commitContent, commitMap, commitStore, pick, claim } = operations;
  return {
    kind: operations.kind,
    commitTitle: commitTitle === undefined ? undefined : whileMounted(commitTitle),
    commitContent: commitContent === undefined ? undefined : whileMounted(commitContent),
    commitMap: commitMap === undefined ? undefined : whileMounted(commitMap),
    commitStore:
      commitStore === undefined
        ? undefined
        : (bytes) => {
            const refusal = withheld();
            return refusal === null ? commitStore(bytes) : Promise.resolve(refusal);
          },
    pick:
      pick === undefined
        ? undefined
        : (accept) => (withheld() === null ? pick(accept) : Promise.resolve([])),
    claim:
      claim === undefined
        ? undefined
        : (drawing) => counted(lifetime.drawn() ? claim(drawing) : undefined),
  };

  /** A Claim whose release, however it comes, is counted once. */
  function counted(taken: PluginHostClaim | undefined): PluginHostClaim | undefined {
    if (taken === undefined) return undefined;
    onHeld(1);
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      onHeld(-1);
    };
    return {
      // The host completes a release asked while exclusive work or an inner
      // Claim runs once that ends, so the plugin holds nothing from here.
      release: () => {
        settle();
        taken.release();
      },
      exclusively: (work) => taken.exclusively(work),
      unmount: () => {
        settle();
        taken.unmount();
      },
    };
  }
}

/** A Resource a plugin in this build draws, on the Map. */
export function PluginResource(props: PluginResourceProps) {
  return <PluginSurface {...props} entry={usePluginEntry(props.kind)} />;
}

/**
 * The Map host around one plugin's entry, whichever plugin it is: what
 * `PluginResource` draws, and what a test draws a plugin of its own through,
 * on its own surface or on the one it embeds.
 */
export function PluginSurface(props: PluginResourceProps & { readonly entry: PluginEntry }) {
  const { kind, title, state } = props;
  // Exclusive work elsewhere withdraws every authoring control the surface
  // draws, not only the plugin's commits (ADR 0142).
  const [lifetime] = useState(createSurfaceLifetime);
  const holder = props.operations.claimHolder?.(lifetime.drawing) ?? 'none';
  // So is a Claim held by another drawing of this Resource: this drawing then
  // offers nothing that could change the Resource under that Claim's work.
  const withdrawn = props.operations.withdrawn === true || holder === 'another-drawing';
  const readOnly = props.readOnly || withdrawn;
  const drawnTitle = withdrawn ? { ...title, readOnly: true } : title;
  const name = titleName(title.title);
  const size = props.size ?? COLLAPSED_RESOURCE_SIZE;
  const rail = useMemo(() => createRailStore(), []);
  const commands = useSyncExternalStore(rail.subscribe, rail.commands, rail.commands);
  useEffect(() => {
    lifetime.begin();
    return lifetime.end;
  }, [lifetime]);
  const host: ResourceHost = useMemo(
    () => ({
      Title: MapTitleView,
      Own: MapOwn,
      rail,
      RenderedMarkdown: HostRenderedMarkdown,
      SourceEditor: HostSourceEditor,
      railBand: RAIL_BAND,
    }),
    [rail],
  );
  // One set of commits while the operations the surface is handed stay the
  // same, so the plugin's own render, and the rail it publishes, settle.
  const [held, setHeld] = useState(0);
  const onHeld = useCallback((change: 1 | -1) => setHeld((count) => count + change), []);
  // An edit that ends takes the focus it held with it, so the focus goes back
  // to the Resource, as a renamed Title's does — unless the author has already
  // put it somewhere else.
  const surfaceElement = useRef<HTMLDivElement | null>(null);
  const heldWas = useRef(false);
  const returnFocus = title.onReturnFocus;
  useLayoutEffect(() => {
    const active = surfaceElement.current?.ownerDocument.activeElement ?? null;
    if (
      heldWas.current &&
      held === 0 &&
      (active === null ||
        active === active.ownerDocument.body ||
        surfaceElement.current?.contains(active))
    )
      returnFocus();
    heldWas.current = held > 0;
  }, [held, returnFocus]);
  const operations = useMemo(
    () => guarded(props.operations, lifetime, readOnly, onHeld),
    [props.operations, lifetime, readOnly, onHeld],
  );
  // Assets are drawn and read from the application's store; storing and
  // picking are what the host offers with its commits, withdrawn as they are.
  const supplied = usePluginAssets();
  const assets = useMemo(
    (): Assets => ({
      ...readingAssets(supplied),
      store: operations.commitStore,
      pick: operations.pick,
    }),
    [supplied, operations],
  );
  const plugin = props.entry.render({
    resourceId: props.resourceId,
    kind,
    title: title.title,
    content: props.content,
    mapContent: props.mapContent,
    size,
    selected: state === 'selected' || state === 'editing',
    operations,
    drawing: lifetime.drawing,
    assets,
    Embed: HostEmbed,
    onClaim: lifetime.hold,
  });
  const onFailure = props.onFailure ?? props.operations.onFailure;
  const embeddable = props.embeddable;
  const embedding: Embedding = useMemo(
    () => ({
      resources: embeddable ?? [],
      drawing: [props.resourceId],
      nested: false,
      host,
      rail: rail.embedded,
      size,
      selected: state === 'selected' || state === 'editing',
      onFailure,
    }),
    [embeddable, props.resourceId, host, rail, size, state, onFailure],
  );

  const onMapEmbed = props.onMapEmbed;
  const mapNote = props.operations.mapNote;
  const reportFooter = props.onBodyHeightChange;
  const mapSlot = useMemo(
    (): MapEmbedSlot | null =>
      onMapEmbed === undefined
        ? null
        : {
            publish: (request) => onMapEmbed(request, lifetime.drawing),
            note: mapNote,
            reportFooter,
          },
    [onMapEmbed, mapNote, reportFooter, lifetime],
  );

  const entityActions = props.entityActions;
  const actionable = !readOnly && entityActions?.some((group) => group.length > 0) === true;
  // The Map embedding's own commands are the host's: drawn here beside the
  // plugin's, while the plugin embeds a Map it may choose for (ADR 0142).
  const mapRail = props.readOnly ? undefined : props.operations.mapRail;
  const showActions =
    state !== 'dragging' &&
    state !== 'editing' &&
    (actionable || commands.length > 0 || mapRail !== undefined);
  const toolbar = showActions ? (
    <ResourceRailActions
      aria-label={`Resource ${name}`}
      className="canvas-resource__actions"
      data-testid="canvas-resource-actions"
    >
      {actionable && (
        <EntityActionsTrigger
          groups={entityActions}
          label={`Actions for Resource ${name}`}
          icon={<EntityActionsIcon />}
          render={<ResourceRailAction />}
        />
      )}
      {mapRail}
      {commands.length > 0 && (
        <ResourceRailKindActions kind={kind}>
          <PluginRailCommands commands={commands} />
        </ResourceRailKindActions>
      )}
    </ResourceRailActions>
  ) : null;

  const outline = props.outline;
  const style: PluginResourceStyle = {
    '--canvas-resource-graph': graphPaint(props.graphColor),
    '--canvas-resource-border':
      props.borderColor === undefined
        ? 'var(--canvas-resource-ink-color)'
        : graphPaint(props.borderColor),
    '--canvas-resource-drag-tilt': `${CANVAS_RESOURCE_DRAG_TILT_DEGREES}deg`,
  };
  const contextNotice = props.contextNotice ?? null;
  const selected = state === 'selected' || state === 'editing';
  // A plugin drawn bare at rest has no border until it is selected or drawn in
  // a Graph's colour (ADR 0142); the ring and that colour are the canvas's.
  const bare = props.entry.bareAtRest && props.borderColor === undefined && !selected;
  const resource = (
    <Card
      ref={surfaceElement}
      role="article"
      aria-label={name}
      className="canvas-resource canvas-resource--plugin"
      data-testid="resource"
      data-kind={kind}
      data-content-kind={kind}
      // Dotted at rest where its plugin shows another's content (`target-canvas.css`).
      data-shows-target={props.entry.showsTarget || undefined}
      data-state={state}
      // A surface holding a Claim is being worked in, which keeps its active
      // face as an edit does (`canvas-resource.css`).
      data-content-editing={holder === 'this-drawing'}
      // The outline the plugin declared, which `canvas-resource.css` strokes
      // the border and ring on (ADR 0142).
      data-resource-shape={outline}
      data-bare={bare}
      style={style}
    >
      {outline !== 'rectangle' && (
        <ResourceShapeOutlineDrawing outline={resourceShapeOutline(outline, size)} size={size} />
      )}
      {props.renderToolbar === undefined ? toolbar : props.renderToolbar(toolbar, held > 0)}
      <div
        className={
          // A Claim gives the plugin the whole rect to point in: the canvas
          // neither drags nor pans from inside it while one is held. The wheel
          // stays the canvas's, so it still zooms over the Resource (ADR 0064).
          holder === 'this-drawing'
            ? 'canvas-resource__plugin nodrag nopan'
            : 'canvas-resource__plugin'
        }
      >
        <ResourceFailureBoundary
          // A throw is this drawing's: the boundary mounts afresh for another
          // Resource or after a replacement, and a failed drawing is tried
          // again on another Map content value, which leaves a drawn plugin,
          // its state and its Claims as they are.
          key={`${props.resourceId}:${String(props.operations.epoch ?? 0)}`}
          retryOn={props.mapContent}
          onFailure={onFailure}
        >
          <MapTitleContext.Provider value={drawnTitle}>
            <MapEmbedSlotProvider slot={mapSlot}>
              <EmbeddingProvider embedding={embedding}>
                <ResourceHostProvider host={host}>{plugin}</ResourceHostProvider>
              </EmbeddingProvider>
            </MapEmbedSlotProvider>
            {/* A plugin that draws no Title is renamed in the host's editor, drawn over it. */}
            {!props.entry.drawsTitle && title.editor !== undefined && !readOnly && (
              <div className="canvas-resource__title-over">
                <MapTitleView />
              </div>
            )}
          </MapTitleContext.Provider>
        </ResourceFailureBoundary>
      </div>
      {contextNotice !== null && (
        <p role="status" className="canvas-resource__space-note">
          {contextNotice}
        </p>
      )}
    </Card>
  );
  return entityActions !== undefined ? (
    <EntityActions groups={readOnly ? [] : entityActions} render={resource} />
  ) : (
    resource
  );
}

export type { MapTitle };
