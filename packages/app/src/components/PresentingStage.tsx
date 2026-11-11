import type { GraphId, MapId, ResourceId } from '@project/core';
import { referencedResources, type Space } from '@project/graph';
import { HostMapProvider, PresentedPluginResource, Stage } from '@project/ui';
import { presentedNotes } from '../notes-window';
import { drawPresentedMapEmbed } from './map-embed-draws';
import { PresentedNotesList } from './PresentedNotesList';
import { PresentingChrome, type PresentingChromeProps } from './PresentingChrome';
import './rehearsal-notes.css';

export interface PresentingStageProps extends PresentingChromeProps {
  /** The Space the Resource being presented belongs to. */
  readonly space: Space;
  /** The Map the presentation is on, which places the notes. */
  readonly mapId: MapId;
  /** The Graph being presented, whose Presentation Notes Graph holds the notes. */
  readonly graphId: GraphId;
  /** The Resource Navigation is presenting. */
  readonly resourceId: ResourceId;
  /** Told what a Resource plugin threw while drawing (ADR 0142). */
  readonly onPluginFailure?: ((error: Error) => void) | undefined;
  /** The Replacement epoch, on which a plugin's drawing starts again. */
  readonly replacementEpoch?: number | undefined;
}

/**
 * Presenting's surface (ADR 0123): the Resource being presented on the Stage,
 * with the presenting chrome in the strip below the frame, and below that the
 * Resource's notes while the presenter rehearses with them (ADR 0129).
 *
 * The Resource is drawn by its plugin with the Map content its plugin gives
 * where there is no Map (ADR 0142), and never by its position, size or Map
 * content on any Map — so nothing about how it sits on the canvas reaches the
 * audience. Nothing here authors the Space.
 */
export function PresentingStage({
  space,
  mapId,
  graphId,
  resourceId,
  onPluginFailure,
  replacementEpoch,
  ...chrome
}: PresentingStageProps) {
  const resource = space.lookup.resource(resourceId);
  if (resource === undefined) return null;
  const notes = chrome.notesShown ? presentedNotes(space, mapId, graphId, resourceId) : undefined;
  return (
    <Stage
      label="Presented Resource"
      contentKey={resourceId}
      chrome={
        <>
          <PresentingChrome {...chrome} />
          {notes === undefined ? null : (
            // Keyed by the Resource, so each Resource's notes open scrolled to the top.
            <section key={resourceId} className="rehearsal-notes" aria-label="Rehearsal notes">
              <PresentedNotesList notes={notes} />
            </section>
          )}
        </>
      }
    >
      <HostMapProvider draw={drawPresentedMapEmbed}>
        <PresentedPluginResource
          resourceId={resource.id}
          kind={resource.kind}
          title={resource.title}
          content={resource.content}
          embeddable={referencedResources(space, resource)}
          onFailure={onPluginFailure}
          replacementEpoch={replacementEpoch}
        />
      </HostMapProvider>
    </Stage>
  );
}
