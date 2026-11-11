import type { ReactNode } from 'react';
import { titleName, UNRESOLVED_CONTENT, type ResourceContent } from '@project/core';
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
  /**
   * Drawn in place of the content's own view, for content only the composing
   * application can draw.
   */
  readonly children?: ReactNode;
}

/**
 * Renders a resource's title and its content for presenting, as the Notes
 * window draws a note and a preview of each move: its name, and below it its
 * content drawn read-only by the plugin of the content's kind (ADR 0142).
 */
export function PresentedResource({ title, content, children }: PresentedResourceProps) {
  const name = titleName(title);
  return (
    <article
      className={
        children === undefined
          ? 'resource resource--full'
          : 'resource resource--full resource--drawn'
      }
      data-testid="resource-content"
      data-content-kind={content.kind}
    >
      <h2 className="resource__title">{name}</h2>
      {children ??
        (content.kind === UNRESOLVED_CONTENT.kind ? (
          <UnresolvedContent />
        ) : (
          <PresentedPluginContent kind={content.kind} title={name} content={content.content} />
        ))}
    </article>
  );
}
