import { useRef, useState } from 'react';
import type { Story } from '@ladle/react';
import { titleName, type JsonValue } from '@project/core';
import {
  CanvasResource,
  CLOSED_DISPLAY,
  PluginResource,
  type KindOperations,
  type PluginCommits,
  type PluginHostClaim,
  type PluginOperations,
  type ResourceDisplay,
} from '@project/ui';
import { resourceSizeVars } from '#src/resource';
import type { ResourceFrameStyle } from '../support/CanvasResourceSpecimen';
import { storeStoryText, storyText } from '../support/story-assets';

export default { title: 'Components/Resource/Editing' };

/**
 * The Resource's own title editor, entirely private to this component: begins from
 * the Title's native control, keeps a refused draft local with a field-local
 * error, completes and exits on Enter, cancels on Escape, and returns focus to
 * the Resource around it.
 */
function TitleEditingResource({
  initiallyOpen,
  initialTitle,
}: {
  readonly initiallyOpen: boolean;
  readonly initialTitle: string;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(initiallyOpen);
  const changeOpen = (next: boolean) => {
    setOpen(next);
    return 'completed' as const;
  };
  const group = useRef<HTMLDivElement>(null);
  const kindOperations: KindOperations = { kind: 'markdown' };
  const display: ResourceDisplay = open
    ? {
        shown: 'open',
        content: {
          kind: 'markdown',
          content: { url: storyText('## Open Resource body') },
          via: 'self',
        },
      }
    : CLOSED_DISPLAY;

  return (
    <div style={open ? openFrame : resourceSizeVars}>
      <div
        role="group"
        // The Resource's **name**, which is the Title's first line: everything that
        // refers to a Resource rather than drawing it shows that and nothing
        // else (ADR 0083). The ladder belongs to the drawn Resource alone.
        aria-label={`${titleName(title)} on the canvas`}
        tabIndex={-1}
        ref={group}
        data-testid="resource-group"
      >
        <CanvasResource
          kindOperations={kindOperations}
          onOpenChange={changeOpen}
          display={display}
          title={title}
          graphColor="#ffc53d"
          {...(editing
            ? {
                state: 'editing' as const,
                onCompleteTitleEdit: (draft: string) => {
                  if (draft.trim().length === 0) return 'A Resource title is required.';
                  setTitle(draft);
                  setEditing(false);
                  return null;
                },
                onCancelTitleEdit: () => setEditing(false),
                onReturnFocus: () => group.current?.focus(),
              }
            : {
                state: 'rest' as const,
                onBeginTitleEdit: () => setEditing(true),
              })}
        />
      </div>
    </div>
  );
}

/**
 * A third specimen, and the one the heading nesting is proved on.
 *
 * The two above it are titled on one line, which is the shape the in-place
 * geometry of this editor is a promise about.
 * That shape cannot tell ADR 0083's two arrangements apart: `Edit Title <name>`
 * and the heading's own name are then the same string, so a control that had
 * swallowed the heading, and an implementation that drew the name and dropped
 * every line after it, both read as correct. A ladder is what separates them.
 *
 * Named differently from the others on purpose — the Resource's name is its first
 * line, so `Auth` is what every control on this specimen is named after, and a
 * lookup cannot cross specimens by accident.
 */
const ladderTitle = 'Auth\nhow tokens are minted\ndraft, 2026';

/** The Title opens its editor with the value selected, keeps a refused draft field-local, and completes on Enter or cancels on Escape — for a Closed, an Open and a laddered Resource. */
export const Title: Story = () => (
  <div className="flex flex-wrap items-start gap-8 p-8">
    <section aria-label="Closed Resource title editing" className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">Closed</p>
      <TitleEditingResource initiallyOpen={false} initialTitle="Draft entry" />
    </section>
    <section aria-label="Open Resource title editing" className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">Open</p>
      <TitleEditingResource initiallyOpen initialTitle="Draft entry" />
    </section>
    <section aria-label="Laddered Resource title editing" className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">Title Lines</p>
      <TitleEditingResource initiallyOpen={false} initialTitle={ladderTitle} />
    </section>
  </div>
);

const openFrame: ResourceFrameStyle = {
  '--resource-width': '480px',
  '--resource-height': '360px',
  width: '480px',
  height: '360px',
};

const markdown = `## Placement is authored

A **Map** owns explicit Resource rects. A strategy only computes placement.`;

/**
 * The story's own host for one Markdown Resource: its content and Map content
 * in state, every commit answered `completed`, and a Claim that hands the
 * plugin those same commits while it is held.
 */
function useStoryHost(initialText: string) {
  const [content, setContent] = useState<JsonValue>({ url: storyText(initialText) });
  const [mapContent, setMapContent] = useState<JsonValue>({ open: true });
  const commits: PluginCommits = {
    content: (next) => {
      setContent(next);
      return Promise.resolve('completed');
    },
    map: (next) => {
      setMapContent(next);
      return Promise.resolve('completed');
    },
  };
  const claim = (): PluginHostClaim => ({
    release: () => true,
    exclusively: (work) => work(commits),
    unmount: () => undefined,
  });
  const operations: PluginOperations = {
    kind: 'markdown',
    commitContent: commits.content,
    commitMap: commits.map,
    // The host offers a store only where it says so: Save stores its text in
    // the catalogue's asset store.
    commitStore: storeStoryText,
    claim,
  };
  return { content, mapContent, operations };
}

/**
 * An Open Markdown Resource drawn by its plugin through the Map surface's host
 * (ADR 0142): it begins an edit from its rendered body or rail, keeps blur
 * inert, and ends through Save, Cancel, Escape or Mod-Enter, storing its text
 * in the catalogue's asset store.
 */
export const Markdown: Story = () => {
  const { content, mapContent, operations } = useStoryHost(markdown);
  const group = useRef<HTMLDivElement>(null);
  return (
    <div className="flex flex-col items-start gap-3 p-8">
      <div
        role="group"
        aria-label="Strategies on the canvas"
        tabIndex={-1}
        ref={group}
        style={openFrame}
      >
        <PluginResource
          resourceId="story-markdown"
          kind="markdown"
          title={{
            title: 'Strategies',
            readOnly: true,
            onReturnFocus: () => group.current?.focus(),
          }}
          content={content}
          mapContent={mapContent}
          outline="rectangle"
          state="selected"
          graphColor="#ffc53d"
          readOnly={false}
          operations={operations}
        />
      </div>
    </div>
  );
};
