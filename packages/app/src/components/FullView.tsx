import { useLayoutEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { isPluginKind, type ResourceId } from '@project/core';
import {
  referencedResources,
  resolveResourceContent,
  resourceDrawnByPlugin,
  type Space,
} from '@project/graph';
import { Button, PresentedPluginResource, PresentedResource, Stage } from '@project/ui';
import { FULL_VIEW_KEYS } from '../key-bindings';

export interface FullViewProps {
  /** The Space the Resource belongs to. */
  readonly space: Space;
  /** The Resource being read. */
  readonly resourceId: ResourceId;
  /** Leave Full View. */
  readonly onLeave: () => void;
  /** Leave Full View and Open the Resource on the canvas, or `null` while it cannot be Opened. */
  readonly onOpen: (() => void) | null;
  /**
   * Every key pressed inside the view, for the walk along the Active Graph.
   * `fromContent` is whether it was pressed on the Resource's content rather
   * than on one of the view's own controls.
   */
  readonly onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>, fromContent: boolean) => void;
  /** Told what a Resource plugin threw while drawing (ADR 0142). */
  readonly onPluginFailure?: ((error: Error) => void) | undefined;
  /** The Replacement epoch, on which a plugin's drawing starts again. */
  readonly replacementEpoch?: number | undefined;
}

/**
 * A Resource read on the presenting Stage over the canvas, with the Dock still
 * floating above it: transient and read-only, so nothing here is an Edit, and
 * nothing about it reaches the Map, the camera or the address.
 *
 * Drawn by the Resource's kind, through the content `resolveResourceContent`
 * answers, exactly as presenting draws it, so it is also a preview of what the
 * audience sees. The Stage's body takes focus when the view appears and each
 * time it moves to another Resource, so the keys reach the view at once.
 */
export function FullView({
  space,
  resourceId,
  onLeave,
  onOpen,
  onKeyDown,
  onPluginFailure,
  replacementEpoch,
}: FullViewProps) {
  const body = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    body.current?.focus();
  }, [resourceId]);

  const resource = space.lookup.resource(resourceId);
  if (resource === undefined) return null;
  return (
    <div
      data-testid="full-view"
      onKeyDown={(event) => onKeyDown(event, event.target === body.current)}
    >
      <Stage
        label="Full View"
        contentKey={resourceId}
        bodyRef={body}
        chrome={
          <div className="flex items-center justify-end gap-3 border-t border-border bg-background p-3">
            {onOpen === null ? null : (
              <Button
                variant="secondary"
                aria-keyshortcuts={FULL_VIEW_KEYS.openOnCanvas.ariaKeyShortcuts}
                onClick={onOpen}
              >
                Open on Canvas
              </Button>
            )}
            <Button
              variant="secondary"
              aria-keyshortcuts={FULL_VIEW_KEYS.leave.ariaKeyShortcuts}
              onClick={onLeave}
            >
              Leave Full View
            </Button>
          </div>
        }
      >
        {isPluginKind(resource.kind) && resourceDrawnByPlugin(space, resource) ? (
          <PresentedPluginResource
            resourceId={resource.id}
            kind={resource.kind}
            title={resource.title}
            content={resource.content}
            embeddable={referencedResources(space, resource)}
            onFailure={onPluginFailure}
            replacementEpoch={replacementEpoch}
          />
        ) : (
          <PresentedResource
            title={resource.title}
            content={resolveResourceContent(space, resource)}
          />
        )}
      </Stage>
    </div>
  );
}
