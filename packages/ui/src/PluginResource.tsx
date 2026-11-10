import {
  createContext,
  useContext,
  useEffect,
  useMemo,
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
  type PluginKind,
  type ResourceShape,
} from '@project/core';
import type { Answer } from '@project/resource-api/domain';
import type { OwnProps, RailCommand, TitleProps } from '@project/resource-api/view';
import {
  createRailStore,
  ResourceHostProvider,
  type ResourceHost,
} from '@project/resource-api/view/host';
import { Button } from './Button';
import { CANVAS_RESOURCE_DRAG_TILT_DEGREES, type CanvasResourceState } from './CanvasResource';
import { Card, CardTitle } from './components/card';
import { EntityActions, EntityActionsTrigger, type EntityActionGroup } from './EntityActionsMenu';
import { graphPaint } from './graph-color';
import { EntityActionsIcon } from './icons';
import { InlineTitleEditor } from './InlineTitleEditor';
import {
  NoEmbed,
  pluginEntryFor,
  type PluginEntry,
  type PluginHostClaim,
  type PluginOperations,
} from './kinds/plugin-views';
import { readingAssets, usePluginAssets } from './plugin-assets';
import { RailChoiceMenu } from './RailChoiceMenu';
import { ResourceFailureBoundary } from './ResourceFailureBoundary';
import {
  ResourceRailAction,
  ResourceRailActions,
  ResourceRailKindActions,
} from './ResourceRailActions';
import { resourceShapeOutline, type OutlineSize } from './resource-shape-outline';
import { ResourceShapeOutlineDrawing } from './ResourceShapeOutlineDrawing';
import { TitleHeading } from './ResourceTitleHeading';
import './canvas-resource.css';

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

const SURFACE_GONE: Answer = { refused: 'This Resource is no longer drawn here.' };
const HELD_ELSEWHERE: Answer = {
  refused: 'This Resource is being changed where it is drawn elsewhere. Try again when that ends.',
};

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

/** The Title as the Map draws it, and the rename it offers (ADR 0065, ADR 0083). */
export interface MapTitle {
  readonly title: string;
  readonly readOnly: boolean;
  readonly onBeginTitleEdit?: (() => void) | undefined;
  readonly editor?:
    | {
        readonly onComplete: (title: string) => string | null;
        readonly onCancel: () => void;
      }
    | undefined;
  readonly onReturnFocus: () => void;
}

/**
 * The Title the Map draws, read from context rather than closed over, so the
 * host hands the plugin one Title component for the surface's lifetime and a
 * rename's caret survives every render of the Resource around it.
 */
const MapTitleContext = createContext<MapTitle | null>(null);

function MapTitleView({ className }: TitleProps) {
  const props = useContext(MapTitleContext);
  if (props === null) return null;
  const name = titleName(props.title);
  const titleClass = ['canvas-resource__title', className].filter(Boolean).join(' ');
  if (props.editor !== undefined && !props.readOnly) {
    return (
      <InlineTitleEditor
        title={props.title}
        label="Resource title"
        variant="resource"
        multiline
        onComplete={props.editor.onComplete}
        onCancel={props.editor.onCancel}
        onReturnFocus={props.onReturnFocus}
      />
    );
  }
  const begin = props.readOnly ? undefined : props.onBeginTitleEdit;
  return (
    <CardTitle className={titleClass} data-editable={begin !== undefined}>
      {begin === undefined ? (
        <TitleHeading title={props.title} />
      ) : (
        <Button
          variant="ghost"
          className="canvas-resource__title-control nodrag nopan"
          aria-label={`Edit Title ${name}`}
          onClick={(event) => {
            event.stopPropagation();
            begin();
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <TitleHeading title={props.title} />
        </Button>
      )}
    </CardTitle>
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
  readonly kind: PluginKind;
  readonly title: MapTitle;
  /** The Resource's content as stored, which its plugin's schema parses. */
  readonly content: unknown;
  /** The Map content the plugin is given on this Map. */
  readonly mapContent: JsonValue;
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
  /** Where the rail is drawn, and when; absent, it is drawn in the rect. */
  readonly renderToolbar?: ((toolbar: ReactNode) => ReactNode) | undefined;
  /** Told what a plugin threw while drawing. */
  readonly onFailure?: ((error: Error) => void) | undefined;
}

/**
 * One mounted surface's lifetime: the key its drawing is known by, whether it
 * is still drawn, and a Claim it was granted, whose `unmount` tells the host
 * this surface is gone, releasing every Claim taken through it. One is kept,
 * the latest, since each says the same of the same surface; keeping every one
 * would grow with each Claim taken and tell the host once per Claim.
 */
interface SurfaceLifetime {
  readonly drawing: symbol;
  readonly drawn: () => boolean;
  readonly hold: (claim: PluginHostClaim) => void;
  readonly begin: () => void;
  readonly end: () => void;
}

function createSurfaceLifetime(): SurfaceLifetime {
  let drawn = true;
  let held: PluginHostClaim | null = null;
  return {
    drawing: Symbol('drawing'),
    drawn: () => drawn,
    hold: (claim) => {
      held = claim;
    },
    begin: () => {
      drawn = true;
    },
    end: () => {
      drawn = false;
      const last = held;
      held = null;
      last?.unmount();
    },
  };
}

/**
 * What the surface offers, less what has gone with an unmounted surface, and
 * less every commit while another drawing of the Resource holds a Claim.
 */
function guarded(
  operations: PluginOperations,
  lifetime: SurfaceLifetime,
  readOnly: boolean,
): PluginOperations {
  if (readOnly) return { kind: operations.kind };
  const withheld = (): Answer | null => {
    if (!lifetime.drawn()) return SURFACE_GONE;
    return operations.claimHolder?.(lifetime.drawing) === 'another-drawing' ? HELD_ELSEWHERE : null;
  };
  const whileMounted =
    <A extends readonly unknown[]>(commit: (...args: A) => Promise<Answer>) =>
    (...args: A): Promise<Answer> => {
      const refusal = withheld();
      return refusal === null ? commit(...args) : Promise.resolve(refusal);
    };
  const { commitTitle, commitContent, commitMap, claim } = operations;
  return {
    kind: operations.kind,
    commitTitle: commitTitle === undefined ? undefined : whileMounted(commitTitle),
    commitContent: commitContent === undefined ? undefined : whileMounted(commitContent),
    commitMap: commitMap === undefined ? undefined : whileMounted(commitMap),
    claim:
      claim === undefined
        ? undefined
        : (drawing) => (lifetime.drawn() ? claim(drawing) : undefined),
  };
}

/** A Resource a plugin in this build draws, on the Map. */
export function PluginResource(props: PluginResourceProps) {
  return <PluginSurface {...props} entry={pluginEntryFor(props.kind)} />;
}

/**
 * The Map host around one plugin's entry, whichever plugin it is: what
 * `PluginResource` draws, and what a test draws a plugin of its own through.
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
  const host: ResourceHost = useMemo(() => ({ Title: MapTitleView, Own: MapOwn, rail }), [rail]);
  // One set of commits while the operations the surface is handed stay the
  // same, so the plugin's own render, and the rail it publishes, settle.
  const operations = useMemo(
    () => guarded(props.operations, lifetime, readOnly),
    [props.operations, lifetime, readOnly],
  );
  const supplied = usePluginAssets();
  const assets = useMemo(
    () => (readOnly ? readingAssets(supplied) : supplied),
    [readOnly, supplied],
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
    assets,
    Embed: NoEmbed,
    onClaim: lifetime.hold,
  });

  const entityActions = props.entityActions;
  const actionable = !readOnly && entityActions?.some((group) => group.length > 0) === true;
  const showActions =
    state !== 'dragging' && state !== 'editing' && (actionable || commands.length > 0);
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
  const resource = (
    <Card
      role="article"
      aria-label={name}
      className="canvas-resource canvas-resource--plugin"
      data-testid="resource"
      data-kind={kind}
      data-content-kind={kind}
      data-state={state}
      data-open={false}
      // The outline the plugin declared, which `canvas-resource.css` strokes
      // the border and ring on (ADR 0142).
      data-resource-shape={outline}
      style={style}
    >
      {outline !== 'rectangle' && (
        <ResourceShapeOutlineDrawing outline={resourceShapeOutline(outline, size)} size={size} />
      )}
      {props.renderToolbar === undefined ? toolbar : props.renderToolbar(toolbar)}
      <div
        className={
          // A Claim gives the plugin the whole rect: the canvas neither drags,
          // pans nor zooms from inside it while one is held.
          holder === 'this-drawing'
            ? 'canvas-resource__plugin nodrag nopan nowheel'
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
          onFailure={props.onFailure ?? props.operations.onFailure}
        >
          <MapTitleContext.Provider value={drawnTitle}>
            <ResourceHostProvider host={host}>{plugin}</ResourceHostProvider>
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
