import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { uuidSchema, type JsonValue, type Resource } from '@project/core';
import type { Answer } from '@project/resource-api/domain';
import { PluginResource, PresentedPluginResource, type PluginResourceProps } from '../src';
import { createRailStore, RAIL_BAND, type ResourceHost } from '@project/resource-api/view';
import { commitWhileDrawn, EmbeddingProvider, HostEmbed } from '../src/ResourceEmbedding';
import { textAsset, WithTexts } from './markdown-texts';

/**
 * The host-owned embedding (ADR 0142) as the Reference plugin draws through
 * it: an Open Reference shows its Target on a surface offering no authoring of
 * it, under the Reference's own Title and rename (ADR 0070).
 */

const REFERENCE = uuidSchema.parse('00000000-0000-4000-8000-0000000000a1');
const TARGET = uuidSchema.parse('00000000-0000-4000-8000-0000000000b2');
const PICTURE_URL = 'https://example.test/figure.png';

const markdownTarget = (): Resource => ({
  id: TARGET,
  title: 'Strategy notes',
  kind: 'markdown',
  content: { url: textAsset('# Target heading\n\nThe Target’s own text.') },
});
const urTarget: Resource = {
  id: TARGET,
  title: 'Decide',
  kind: 'ur',
  content: {},
};
const imageTarget: Resource = {
  id: TARGET,
  title: 'The figure',
  kind: 'image',
  content: { url: PICTURE_URL },
};
const referenceTarget: Resource = {
  id: TARGET,
  title: 'Another Reference',
  kind: 'reference',
  content: { target: REFERENCE },
};

const commits = () => ({
  commitTitle: vi.fn((_next: string): Promise<Answer> => Promise.resolve('completed')),
  commitMap: vi.fn((_next: JsonValue): Promise<Answer> => Promise.resolve('completed')),
});

const openReference = (
  embeddable: readonly Resource[],
  overrides: Partial<PluginResourceProps> = {},
): PluginResourceProps => ({
  resourceId: REFERENCE,
  kind: 'reference',
  title: { title: 'A′', readOnly: false, onReturnFocus: () => undefined },
  content: { target: TARGET },
  mapContent: { open: true },
  embeddable,
  outline: 'rectangle',
  state: 'selected',
  graphColor: '#ffc53d',
  readOnly: false,
  operations: { kind: 'reference', ...commits() },
  ...overrides,
});

/** The names of the commands on the Resource's rail. */
const railCommands = () =>
  screen
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label') ?? '')
    .filter((label) => label.includes('Resource '));

describe('an Open Reference drawn through the embedding', () => {
  it('draws its own Title once over a Markdown Target, offering no command of the Target', async () => {
    render(
      <WithTexts>
        <PluginResource {...openReference([markdownTarget()])} />
      </WithTexts>,
    );
    expect(await screen.findByText('The Target’s own text.')).toBeVisible();
    expect(screen.getAllByRole('heading', { name: 'A′' })).toHaveLength(1);
    expect(screen.queryByText('Strategy notes')).toBeNull();
    expect(railCommands()).toEqual(['Close Resource A′']);
  });

  it('draws its own Title once over an Ur Target, offering no Shape of it', () => {
    render(<PluginResource {...openReference([urTarget])} />);
    const resource = screen.getByRole('article', { name: 'A′' });
    expect(resource.querySelector('[data-content-kind="ur"]')).not.toBeNull();
    expect(resource).toHaveTextContent('A′');
    expect(resource).not.toHaveTextContent('Decide');
    expect(screen.queryByRole('button', { name: /^Shape:/u })).toBeNull();
    expect(railCommands()).toEqual(['Close Resource A′']);
  });

  it('is a picture of an Image Target named by its own Title, renamed from the rail through its own commit', async () => {
    const operations = { kind: 'reference', ...commits() } as const;
    render(<PluginResource {...openReference([imageTarget], { operations })} />);
    expect(screen.getByRole('img', { name: 'A′' })).toHaveAttribute('src', PICTURE_URL);
    expect(screen.queryByRole('img', { name: 'The figure' })).toBeNull();
    expect(railCommands()).toEqual(['Close Resource A′', 'Rename Resource A′']);
    fireEvent.click(screen.getByRole('button', { name: 'Rename Resource A′' }));
    const box = await screen.findByRole('textbox', { name: 'Resource title' });
    fireEvent.change(box, { target: { value: 'A picture' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    // The rename is the Reference's: the Target is offered no commit at all.
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'Resource title' })).toBeNull(),
    );
    expect(operations.commitTitle).toHaveBeenCalledWith('A picture');
    expect(operations.commitMap).not.toHaveBeenCalled();
  });

  it('draws its own commands before its Target’s, whether it was drawn Open or Opened since', () => {
    const operations = { kind: 'reference', ...commits() } as const;
    const { rerender } = render(
      <PluginResource
        {...openReference([imageTarget], { operations, mapContent: { open: false } })}
      />,
    );
    rerender(<PluginResource {...openReference([imageTarget], { operations })} />);
    expect(railCommands()).toEqual(['Close Resource A′', 'Rename Resource A′']);
  });

  it('offers no rename of an Image Target on a surface whose Title carries no commit', () => {
    render(
      <PluginResource {...openReference([imageTarget], { operations: { kind: 'reference' } })} />,
    );
    expect(screen.getByRole('img', { name: 'A′' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rename Resource A′' })).toBeNull();
  });

  it('draws a note where its Target was deleted', () => {
    render(<PluginResource {...openReference([])} />);
    expect(screen.getByTestId('embedding-note')).toHaveTextContent(
      'The Resource this shows was deleted.',
    );
  });

  it('keeps referencing to one hop, drawing a note for a Target that may not be one', () => {
    render(<PluginResource {...openReference([referenceTarget])} />);
    expect(screen.getByTestId('embedding-note')).toHaveTextContent(
      'This Resource cannot be shown here.',
    );
  });

  it('never draws a Resource inside itself', () => {
    const itself: Resource = {
      id: REFERENCE,
      title: 'A′',
      kind: 'reference',
      content: { target: REFERENCE },
    };
    render(<PluginResource {...openReference([itself], { content: { target: REFERENCE } })} />);
    expect(screen.getByTestId('embedding-note')).toHaveTextContent(
      'This Resource cannot be shown inside itself.',
    );
  });

  it('draws its own Title alone when Closed, embedding nothing', () => {
    render(<PluginResource {...openReference([imageTarget], { mapContent: { open: false } })} />);
    expect(screen.getByRole('heading', { name: 'A′' })).toBeVisible();
    expect(screen.queryByRole('img', { name: 'A′' })).toBeNull();
    expect(screen.getByRole('img', { name: 'Reference Resource' })).toBeInTheDocument();
    expect(railCommands()).toEqual(['Open Resource A′']);
  });

  it('shows its Target on the Stage under its own Title', async () => {
    render(
      <WithTexts>
        <PresentedPluginResource
          resourceId={REFERENCE}
          kind="reference"
          title="A′"
          content={{ target: TARGET }}
          embeddable={[markdownTarget()]}
        />
      </WithTexts>,
    );
    expect(await screen.findByText('The Target’s own text.')).toBeVisible();
    expect(screen.getAllByRole('heading', { name: 'A′' })).toHaveLength(1);
    expect(screen.queryByText('Strategy notes')).toBeNull();
  });
});

describe('an embedding inside an embedded Resource', () => {
  it('draws a note saying it shows nothing further, not that an existing Resource was deleted', () => {
    const host: ResourceHost = {
      Title: () => null,
      Own: ({ children }) => <div>{children}</div>,
      rail: createRailStore(),
      RenderedMarkdown: () => null,
      SourceEditor: () => null,
      railBand: RAIL_BAND,
    };
    // As an embedded surface hands its plugin: inside the Reference and its
    // Target, offering nothing of its own to embed.
    render(
      <EmbeddingProvider
        embedding={{
          resources: [],
          drawing: [REFERENCE, TARGET],
          nested: true,
          rail: host.rail,
          host,
          size: { width: 260, height: 146 },
          selected: false,
        }}
      >
        <HostEmbed
          resource={uuidSchema.parse('00000000-0000-4000-8000-0000000000c3')}
          title={{ value: 'Inner' }}
        />
      </EmbeddingProvider>,
    );
    expect(screen.getByTestId('embedding-note')).toHaveTextContent(
      'A Resource shown inside another shows nothing further.',
    );
  });
});

describe('a Title commit an embedded plugin keeps', () => {
  it('reaches the embedding while the embedded surface is drawn, and is refused once it is gone', async () => {
    let drawn = true;
    const passed = vi.fn((_next: string): Promise<Answer> => Promise.resolve('completed'));
    const kept = commitWhileDrawn(passed, () => drawn);
    expect(await kept('A picture')).toBe('completed');
    drawn = false;
    expect(await kept('Later')).toEqual({ refused: 'This Resource is no longer drawn here.' });
    expect(passed).toHaveBeenCalledTimes(1);
  });
});
