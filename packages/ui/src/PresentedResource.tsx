import { embedsMap, titleName, UNRESOLVED_CONTENT, type ResourceContent } from '@project/core';
import { PresentedPluginContent } from './PresentedPluginResource';
import { UnresolvedContent } from './UnresolvedContent';

export interface PresentedResourceProps {
  /**
   * The Resource's Title, whole. Presenting draws its **name** — the first line —
   * because the Title ladder belongs to the drawn Resource and nothing else
   * (ADR 0083), and a presented Resource is a different surface with a different
   * frame around it.
   */
  readonly title: string;
  /** The Resource's resolved content, its own or its Target's. */
  readonly content: ResourceContent;
}

/**
 * Renders a resource's title and its content for presenting, as the Notes
 * window draws a note and a preview of each move: its name, and below it its
 * content drawn read-only by the plugin of the content's kind (ADR 0142).
 * Content that embeds a Map is drawn as its name alone, because this surface
 * draws no Map for its plugin to show.
 */
export function PresentedResource({ title, content }: PresentedResourceProps) {
  const name = titleName(title);
  return (
    <article
      className="resource resource--full"
      data-testid="resource-content"
      data-content-kind={content.kind}
    >
      <h2 className="resource__title">{name}</h2>
      {content.kind === UNRESOLVED_CONTENT.kind ? (
        <UnresolvedContent />
      ) : embedsMap(content) ? null : (
        <PresentedPluginContent kind={content.kind} title={name} content={content.content} />
      )}
    </article>
  );
}
