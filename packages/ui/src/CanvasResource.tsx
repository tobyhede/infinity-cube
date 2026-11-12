import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  authorsContent,
  drawsContentArea,
  titleName,
  UNRESOLVED_CONTENT,
  type ResourceContent,
} from '@project/core';
import { Button } from './Button';
import { graphPaint } from './graph-color';
import { canvasContent, contentCommand, type KindOperations } from './kinds/registry';
import { isSpaceOperations } from './kinds/space';
import {
  ResourceRailAction,
  ResourceRailActions,
  ResourceRailKindActions,
  ResourceRailSharedActions,
} from './ResourceRailActions';
import { EntityActions, EntityActionsTrigger, type EntityActionGroup } from './EntityActionsMenu';
import { ResourceRail, ResourceRailKind } from './ResourceRail';
import { Card, CardContent, CardTitle } from './components/card';
import { CloseResourceIcon, CommitEditIcon, EntityActionsIcon, OpenResourceIcon } from './icons';
import './canvas-resource.css';
import './kinds/reference-canvas.css';
import './kinds/space-canvas.css';
import { usePresence } from './use-presence';
import { InlineTitleEditor } from './InlineTitleEditor';
import { UnresolvedContent } from './UnresolvedContent';
import type { ResourceDisplay } from './resource-display';
import type { OutlineSize } from './resource-shape-outline';
import { TitleHeading } from './ResourceTitleHeading';

export type { KindOperations } from './kinds/registry';

/** External visual facts the adapter knows and CanvasResource cannot derive:
 *  React Flow selection, drag and inline-title-editing. Hover and the
 *  selected+hover combination are the Resource's own CSS, driven by real
 *  pointer/focus pseudo-classes rather than a computed React state. */
export type CanvasResourceState = 'rest' | 'selected' | 'dragging' | 'editing';

interface CanvasResourceCommonProps {
  readonly kindOperations: KindOperations;
  /**
   * Whether this Resource is Open, and the content it draws when it is. `CanvasResource` reads Open from
   * this alone; the Map's authored Open state reaches it only through the
   * display the projection made from it.
   */
  readonly display: ResourceDisplay;
  /**
   * The rect the Resource is drawn at, in canvas units. A canvas adapter
   * supplies the size it gives the Resource; absent, the Resource is drawn at
   * the Closed Size.
   */
  readonly size?: OutlineSize;
  /**
   * Where the Resource's command toolbar is drawn, and when.
   *
   * A canvas adapter supplies this to float the toolbar outside the Resource and
   * show it while the Resource is selected — React Flow's `NodeToolbar`, in
   * `ResourceNode`. Absent, the toolbar is drawn in the rail, always shown.
   */
  readonly renderToolbar?: (toolbar: ReactNode) => ReactNode;
  /**
   * Hand focus back to the Resource the adapter renders this component inside. Where an
   * edit ends on a Resource whose toolbar is no longer drawn, there is no Edit
   * control to return to, so focus returns to the Resource instead.
   */
  readonly onReturnFocus?: () => void;
  /** Reports the content-sized title footer in unscaled layout pixels. */
  readonly onBodyHeightChange?: (height: number | null) => void;
  /**
   * A refusal or busy notice from this Resource's context commands, supplied by
   * decoration. Absent or null leaves the alert region unmounted.
   */
  readonly contextNotice?: string | null;
  readonly title: string;
  /** The Active Graph's colour, which the Title's hover and caret treatment draws in. */
  readonly graphColor: string;
  /**
   * The colour of the Graph this Resource is drawn in, which its border and its
   * Shape's outline take (ADR 0135). Absent, both are ink.
   */
  readonly borderColor?: string;
  /**
   * Draw this Resource as content only. Authoring callbacks may still be present in
   * an upstream composition, but this boundary does not expose them as title,
   * open or edit controls while the Resource belongs to a read-only surface.
   */
  readonly readOnly?: boolean;
  /** Present only when activating the displayed Title may begin a rename. */
  readonly onBeginTitleEdit?: () => void;
  /**
   * Request that the Map Open or Close this Resource, answering whether it did.
   * Every kind Opens through this one operation; absent, no Open or Close
   * control is drawn.
   */
  readonly onOpenChange?: (open: boolean) => 'completed' | 'retained';
  /**
   * This Resource's own commands — rename it, copy an address it can be reached by,
   * open it elsewhere — drawn as one more control on the rail.
   *
   * Absent by default, and absent means no control rather than an empty menu:
   * a Resource drawn where none of those commands can run (a creation ghost, a
   * story with nothing behind it) offers nothing instead of offering a menu
   * that refuses.
   */
  readonly entityActions?: readonly EntityActionGroup[];
}

/**
 * The title editor's operations are supplied together with `state: 'editing'`
 * and nowhere else — there is no separate flag pairing them with an
 * independent "editing enabled" boolean, so a caller cannot ask for the
 * editing state without also supplying what completes, cancels and closes it.
 */
export type CanvasResourceProps = CanvasResourceCommonProps &
  (
    | { readonly state: Exclude<CanvasResourceState, 'editing'> }
    | {
        readonly state: 'editing';
        /** Submit the draft; answers a refusal reason, or `null` when accepted. */
        readonly onCompleteTitleEdit: (title: string) => string | null;
        readonly onCancelTitleEdit: () => void;
        /** Hand focus back to the Resource the adapter renders this component inside. */
        readonly onReturnFocus: () => void;
      }
  );

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

/**
 * The CSS custom properties this Resource publishes to `canvas-resource.css`.
 *
 * `CSSProperties` does not type CSS custom properties (`--*`), so the style
 * object is *declared* as the intersection it is actually built as rather than
 * asserted into `CSSProperties` after the fact — the fact is true by
 * construction and needs no claim the compiler cannot check (ADR 0062).
 */
type CanvasResourceStyle = CSSProperties & {
  readonly '--canvas-resource-graph': string;
  readonly '--canvas-resource-border': string;
  readonly '--canvas-resource-drag-tilt': string;
};

/**
 * How long the content's own opacity transition runs, in milliseconds.
 *
 * Read from the computed style rather than restated in TypeScript, so the
 * stylesheet stays the one place the Resource's timing is written. `transition`
 * shorthand expands to a list, and the durations are positional — so the
 * opacity duration is the one at opacity's index in `transition-property`,
 * falling back to the first when the property is not named individually.
 */
const opacityTransitionMs = (element: HTMLElement): number => {
  const style = getComputedStyle(element);
  const opacityIndex = style.transitionProperty
    .split(',')
    .map((property) => property.trim())
    .indexOf('opacity');
  const durations = style.transitionDuration.split(',').map((duration) => duration.trim());
  const duration = opacityIndex < 0 ? durations[0] : durations[opacityIndex % durations.length];
  if (duration === undefined) return 0;
  const milliseconds = duration.endsWith('ms')
    ? Number.parseFloat(duration)
    : Number.parseFloat(duration) * 1000;
  return Number.isFinite(milliseconds) ? milliseconds : 0;
};

/**
 * The content the content area draws, or `null` for none, keeping one identity
 * while it holds the same values: `usePresence` holds its value by identity, and
 * a display is rebuilt on every projection. Values are compared whole, nested
 * ones included, so content that holds an object keeps its identity too. The
 * held value is adjusted during render, React's pattern for state that follows
 * a prop, and only when the values differ, so it settles in one pass.
 */
function useAreaContent(content: ResourceContent | null): ResourceContent | null {
  const next = content !== null && drawsContentArea(content) ? content : null;
  const [held, setHeld] = useState(next);
  if (sameValues(held, next)) return held;
  setHeld(next);
  return next;
}

/** Whether two contents hold the same values, nested ones included; each kind builds its content in one key order. */
const sameValues = (left: ResourceContent | null, right: ResourceContent | null): boolean =>
  left === right || JSON.stringify(left) === JSON.stringify(right);

/**
 * The one drawn Resource shared by the production canvas and its stories.
 *
 * The deep production module for every Resource kind: title editing, refusal
 * display and interaction-state visual treatment. React Flow geometry,
 * connection state, selection/drag translation and containment stay
 * with the adapter that renders this component (`@project/react-flow-adapter`
 * `ResourceNode`) — nothing here imports React Flow or reaches into its DOM. Its
 * own visual treatment lives in `canvas-resource.css`, colocated with this module.
 */
export function CanvasResource(props: CanvasResourceProps) {
  const { kindOperations, title, graphColor, entityActions, state, readOnly = false } = props;
  /**
   * What this Resource is called wherever it is *named* rather than drawn.
   *
   * The Title's first line (ADR 0083). The visible heading below still draws
   * the whole ladder — that is what the drawn Resource is for — but every
   * accessible name here is one line, because a screen reader announcing three
   * lines as one control's name reads as a control with a paragraph for a name.
   * A reader who wants the rest reads the heading.
   */
  const name = titleName(title);
  const kind = kindOperations.kind;
  /*
   * Read-only is decided here, once: every authoring affordance below reads one
   * of these operations, each absent on a read-only Resource.
   */
  const display = props.display;
  const open = display.shown !== 'closed';
  const content = display.shown === 'closed' ? null : display.content;
  const onBeginTitleEdit = readOnly ? undefined : props.onBeginTitleEdit;
  const onOpenChange = readOnly ? undefined : props.onOpenChange;
  const command = contentCommand(kind);
  const spaceOperations =
    !readOnly && content !== null && authorsContent(content) && isSpaceOperations(kindOperations)
      ? kindOperations
      : undefined;
  const areaContent = useAreaContent(content);
  const bodyControl = useRef<HTMLDivElement>(null);
  const contentControl = useRef<HTMLDivElement>(null);
  const contentExitDuration = useCallback(
    () => (contentControl.current === null ? 0 : opacityTransitionMs(contentControl.current)),
    [],
  );
  // Follows the *content area's* presence rather than the Resource's, so a Space
  // Resource opening and closing does not run a presence machine over a document
  // that is never mounted. While leaving it draws the content Open last drew,
  // because a Closed display carries none.
  const contentPresence = usePresence(areaContent, contentExitDuration);
  const contentLeaving = contentPresence.mounted && contentPresence.state === 'leaving';
  /**
   * Whether the drawn content may be authored here: the Resource's own, and not
   * leaving. A Target's content, reached through a Reference Resource, is never
   * edited or replaced from the Reference Resource (ADR 0070).
   */
  const contentAuthoring =
    contentPresence.mounted && !contentLeaving && authorsContent(contentPresence.value);
  const editControl = useRef<HTMLButtonElement>(null);
  const actionableEntityActions =
    !readOnly && entityActions?.some((group) => group.length > 0) === true;
  const contextNotice = props.contextNotice ?? null;
  const spaceRail = spaceOperations?.spaceRail;
  const portal = spaceOperations?.portal;
  const portalEditing = portal?.editing === true;
  const showActions =
    state !== 'dragging' &&
    state !== 'editing' &&
    (spaceRail !== undefined ||
      portal !== undefined ||
      onOpenChange !== undefined ||
      actionableEntityActions);
  const style: CanvasResourceStyle = {
    '--canvas-resource-graph': graphPaint(graphColor),
    '--canvas-resource-border':
      props.borderColor === undefined
        ? 'var(--canvas-resource-ink-color)'
        : graphPaint(props.borderColor),
    '--canvas-resource-drag-tilt': `${CANVAS_RESOURCE_DRAG_TILT_DEGREES}deg`,
  };
  /** The content area: unresolved content, or what its kind's view half draws. */
  const drawAreaContent = (value: ResourceContent): ReactNode =>
    value.kind === UNRESOLVED_CONTENT.kind ? (
      <UnresolvedContent />
    ) : (
      canvasContent(value, {
        name,
        display,
        authoring: contentAuthoring,
        selected: state === 'selected',
      })
    );

  useLayoutEffect(() => {
    if (contentControl.current !== null) {
      contentControl.current.inert = contentLeaving;
    }
  }, [contentLeaving]);

  const onBodyHeightChange = props.onBodyHeightChange;
  useLayoutEffect(() => {
    const body = bodyControl.current;
    if (body === null || onBodyHeightChange === undefined) return;
    const report = () => onBodyHeightChange(body.offsetHeight);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(body);
    return () => {
      observer.disconnect();
      onBodyHeightChange(null);
    };
  }, [onBodyHeightChange]);

  // An Open Resource's content already says what it is, so it draws no kind.
  const kindMark = open ? null : <ResourceRailKind kind={kind} />;
  const toolbar = showActions ? (
    // ADR 0073. One tab stop for the whole rail, arrows between its
    // controls: a canvas carries many Resources and a Resource's rail carries
    // several commands, so a control apiece would put the Resources
    // themselves out of reach behind their own actions. The keyboard
    // contract, the shared control treatment and the canvas suppression
    // every one of these needs are `ResourceRailActions`' and
    // `ResourceRailAction`'s; what is left here is which commands this Resource
    // has, and what each one runs.
    //
    // The two groups are the answer to "whose command is this?". A Space
    // Resource's portal is its own business and means nothing on another kind;
    // opening and closing is every Resource's.
    //
    // The entity actions lead, then a Space Resource's choices, its portal
    // command, and Open/Close last.
    <ResourceRailActions
      aria-label={`Resource ${name}`}
      className="canvas-resource__actions"
      data-testid="canvas-resource-actions"
    >
      {actionableEntityActions && (
        <EntityActionsTrigger
          groups={entityActions}
          label={`Actions for Resource ${name}`}
          icon={<EntityActionsIcon />}
          render={<ResourceRailAction />}
        />
      )}
      {spaceRail}
      <ResourceRailKindActions kind={kind}>
        {portal !== undefined ? (
          portalEditing ? (
            <ResourceRailAction
              ref={editControl}
              aria-label={`Done Resource ${name}`}
              onClick={() => portal.onEditingChange(false)}
            >
              <CommitEditIcon data-icon="inline-start" />
            </ResourceRailAction>
          ) : command !== undefined ? (
            <ResourceRailAction
              ref={editControl}
              aria-label={command.label(name)}
              onClick={() => portal.onEditingChange(true)}
            >
              <command.Icon data-icon="inline-start" />
            </ResourceRailAction>
          ) : null
        ) : null}
      </ResourceRailKindActions>
      <ResourceRailSharedActions>
        {onOpenChange !== undefined && (
          <ResourceRailAction
            aria-label={`${open ? 'Close' : 'Open'} Resource ${name}`}
            onClick={() => {
              onOpenChange(!open);
            }}
          >
            {open ? (
              <CloseResourceIcon data-icon="inline-start" />
            ) : (
              <OpenResourceIcon data-icon="inline-start" />
            )}
          </ResourceRailAction>
        )}
      </ResourceRailSharedActions>
    </ResourceRailActions>
  ) : null;
  const rail = (
    <ResourceRail className="canvas-resource__rail">
      {props.renderToolbar === undefined ? toolbar : null}
      {kindMark}
    </ResourceRail>
  );

  const resource = (
    <Card
      role="article"
      aria-label={name}
      className="canvas-resource"
      data-testid="resource"
      data-kind={kind}
      data-content-kind={content === null ? kind : content.kind}
      data-content-area={
        (contentPresence.mounted && drawsContentArea(contentPresence.value)) || undefined
      }
      data-state={state}
      // Exposes authored state for the Resource's public treatment and evidence.
      // The React Flow wrapper owns the moving rect, while the Markdown Title's
      // layout remains invariant; no wall-clock presentation state is allowed
      // to become a second Open fact and move the Title mid-close.
      data-open={open}
      // Every Resource this frame draws is a rectangle; a plugin's outline is
      // drawn by `PluginResource` (ADR 0142).
      data-resource-shape="rectangle"
      // A running edit is not a hover, so `canvas-resource.css` draws the active
      // face off this as well as `:hover` — a Resource being written in reads as
      // active without the pointer on it.
      data-content-editing={portalEditing}
      style={style}
    >
      {/* Neutral: the band carries no colour and the commands on it sit on the
          shared command surface. The Graph's colour is on this Resource — `--canvas-resource-graph` below draws the
          Title's own hover and caret treatment — and on the handles and
          Edges the adapter draws around it. */}
      {rail}
      {props.renderToolbar?.(toolbar)}
      <CardContent ref={bodyControl} className="canvas-resource__body">
        {state === 'editing' && !readOnly ? (
          <InlineTitleEditor
            title={title}
            label="Resource title"
            variant="resource"
            // A Resource's Title is Title Lines (ADR 0083), and the drawn Resource is
            // the one surface that draws them, so the drawn Resource is where the
            // capability is asked for.
            multiline
            onComplete={props.onCompleteTitleEdit}
            onCancel={props.onCancelTitleEdit}
            onReturnFocus={props.onReturnFocus}
          />
        ) : (
          <CardTitle
            className="canvas-resource__title"
            data-editable={onBeginTitleEdit !== undefined}
          >
            {onBeginTitleEdit === undefined ? (
              <TitleHeading title={title} />
            ) : (
              // ADR 0065's one-activation control, wrapping the heading rather
              // than sitting inside it (ADR 0083).
              //
              // The nesting is the whole point and it is the opposite of the
              // obvious arrangement. An accessible name comes from an element's
              // own label first and its content second, so a heading that
              // *contains* a labelled control is named by that control: do not
              // move the control inside, or the heading reads `Edit Title
              // <name>` and the Title Lines are reachable through nothing. With
              // the control outside, the control keeps the short action name ADR
              // 0065 asks for and the heading is named by the Title Lines it
              // draws, which is how a reader reaches the lines below the name.
              //
              // Verified in Chromium, not inferred: `heading` survives inside
              // `button` un-ignored, with both names as intended. jsdom
              // disagrees with a browser here, so `ladle-e2e` owns the proof.
              <Button
                variant="ghost"
                className="canvas-resource__title-control nodrag nopan"
                aria-label={`Edit Title ${name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onBeginTitleEdit();
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <TitleHeading title={title} />
              </Button>
            )}
          </CardTitle>
        )}
        {/* Withheld while the Resource is read-only for the same reason every other
            authoring affordance is — a read-only surface draws what the Resource
            shows, not what could be changed about it. */}
        {spaceOperations !== undefined && spaceRail === undefined && (
          <p className="canvas-resource__space-note">Reading the referenced Space…</p>
        )}
        {contextNotice !== null && (
          <p role="status" className="canvas-resource__space-note">
            {contextNotice}
          </p>
        )}
      </CardContent>
      {/* A sibling of the Title's body rather than a child of it. The body is
          inset so a Title sits off the Resource's border; a writing surface brings
          its own gutter and padding and has to reach the paper's edges, and
          nesting it would draw one inset inside another. */}
      {contentPresence.mounted && (
        <div
          ref={contentControl}
          className="canvas-resource__content"
          data-presence={contentPresence.state}
        >
          {drawAreaContent(contentPresence.value)}
        </div>
      )}
    </Card>
  );
  return entityActions !== undefined ? (
    <EntityActions groups={readOnly ? [] : entityActions} render={resource} />
  ) : (
    resource
  );
}

/**
 * How far the content of a `CanvasResource` drawn inside `root` overflows the
 * rect it is drawn at, in pixels: the most any element of its content area
 * would scroll. `0` when it fits, or when `root` holds no Open content.
 */
export function canvasResourceContentOverflow(root: Element): number {
  let overflow = 0;
  for (const element of root.querySelectorAll(
    '.canvas-resource__content, .canvas-resource__content *',
  )) {
    overflow = Math.max(overflow, element.scrollHeight - element.clientHeight);
  }
  return overflow;
}
