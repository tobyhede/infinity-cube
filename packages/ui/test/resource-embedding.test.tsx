import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  mapContentWithoutMap,
  uuidSchema,
  type JsonValue,
  type PluginKind,
  type Resource,
} from '@project/core';
import { definePlugin, type Answer } from '@project/resource-api/domain';
import { definePluginView, Title, type Surface } from '@project/resource-api/view';
import { PluginResource, PresentedPluginResource, type PluginResourceProps } from '../src';
import { pluginEntry, pluginEntryFor, type PluginEntry } from '../src/kinds/plugin-views';
import { PluginSurface } from '../src/PluginResource';
import { commitWhileDrawn } from '../src/ResourceEmbedding';
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

/**
 * A Target plugin of the test's own, drawn on the embedded surface through the
 * host's own embedding: it keeps every surface it is handed, counts presses in
 * its own state, and embeds the Resource its content names, as no built-in
 * Target plugin does.
 */
const probeContent = z.object({ embeds: z.string().optional() }).strict();
const probeMap = z.object({ shape: z.string() }).strict();
const probePlugin = definePlugin({
  apiVersion: 1,
  kind: 'probe',
  name: 'Probe',
  listName: 'Probes',
  referenceName: null,
  content: probeContent,
  newContent: {},
  mapContent: { schema: probeMap, default: { shape: 'rectangle' } },
});
type ProbeSurface = Surface<z.output<typeof probeContent>, z.output<typeof probeMap>>;
/** What the probe saw: each surface it was handed, and how often it mounted. */
interface Probed {
  surfaces: ProbeSurface[];
  mounts: number;
}
const probed: Probed = { surfaces: [], mounts: 0 };
function ProbeView({ surface }: { readonly surface: ProbeSurface }) {
  probed.surfaces.push(surface);
  const [count, setCount] = useState(0);
  useEffect(() => {
    probed.mounts += 1;
  }, []);
  const { Embed } = surface;
  const embeds = surface.content.value.embeds;
  return (
    <div data-testid="probe">
      <Title />
      <button type="button" onClick={() => setCount(count + 1)}>
        Counted {count}
      </button>
      {embeds !== undefined && <Embed resource={embeds} title={{ value: 'Inner' }} />}
    </div>
  );
}
const probeEntry = pluginEntry(
  probePlugin,
  definePluginView(probePlugin, { View: ProbeView, Glyph: () => null }),
);
/** The build's entries, with the probe drawing every embedded Ur Resource. */
const probingUr = (kind: PluginKind): PluginEntry =>
  kind === 'ur' ? probeEntry : pluginEntryFor(kind);
const probeTarget = (content: z.output<typeof probeContent> = {}): Resource => ({
  id: TARGET,
  title: 'Decide',
  kind: 'ur',
  content,
});
const probedReference = (props: PluginResourceProps) => (
  <PluginSurface {...props} entry={pluginEntryFor('reference')} entryFor={probingUr} />
);
const lastProbed = (): ProbeSurface => {
  const surface = probed.surfaces.at(-1);
  if (surface === undefined) throw new Error('The probe was never drawn.');
  return surface;
};

describe('the surface an embedded plugin is mounted on', () => {
  it('offers the passed Title and its rename alone, with the Map content for no Map', () => {
    probed.surfaces = [];
    render(probedReference(openReference([probeTarget()])));
    const surface = lastProbed();
    expect(surface.resource.id).toBe(TARGET);
    expect(surface.title.value).toBe('A′');
    expect(surface.title.commit).toBeDefined();
    expect(surface.content.commit).toBeUndefined();
    expect(surface.map.commit).toBeUndefined();
    expect(surface.map.value).toEqual(mapContentWithoutMap('ur'));
    expect(surface.claim).toBeUndefined();
    expect(surface.assets.store).toBeUndefined();
    expect(surface.assets.pick).toBeUndefined();
  });

  it('keeps what it embeds mounted across renders of the surface around it', () => {
    probed.mounts = 0;
    const { rerender } = render(probedReference(openReference([probeTarget()])));
    fireEvent.click(screen.getByRole('button', { name: 'Counted 0' }));
    expect(screen.getByRole('button', { name: 'Counted 1' })).toBeInTheDocument();
    // A rename, Map content and Resources that stand anew, and a selection
    // change each render the Reference again.
    rerender(
      probedReference(
        openReference([{ ...probeTarget() }], {
          title: { title: 'A″', readOnly: false, onReturnFocus: () => undefined },
          mapContent: { open: true },
          state: 'rest',
        }),
      ),
    );
    expect(screen.getByRole('button', { name: 'Counted 1' })).toBeInTheDocument();
    expect(probed.mounts).toBe(1);
  });

  it('refuses a Title commit the embedded plugin kept once the Reference is Closed', async () => {
    probed.surfaces = [];
    const operations = { kind: 'reference', ...commits() } as const;
    const { rerender } = render(probedReference(openReference([probeTarget()], { operations })));
    const kept = lastProbed().title.commit;
    if (kept === undefined) throw new Error('The embedded surface offered no rename.');
    expect(await kept('While drawn')).toBe('completed');
    rerender(
      probedReference(openReference([probeTarget()], { operations, mapContent: { open: false } })),
    );
    expect(screen.queryByTestId('probe')).toBeNull();
    expect(await kept('Later')).toEqual({ refused: 'This Resource is no longer drawn here.' });
    expect(operations.commitTitle).toHaveBeenCalledTimes(1);
    expect(operations.commitTitle).toHaveBeenCalledWith('While drawn');
  });

  it('draws a Target whose plugin threw again once its content changes', () => {
    const onFailure = vi.fn();
    const broken: Resource = { ...imageTarget, content: { url: 'not a picture address' } };
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { rerender } = render(
      <PluginResource {...openReference([broken])} onFailure={onFailure} />,
    );
    expect(screen.getByTestId('resource-failure')).toBeInTheDocument();
    expect(onFailure).toHaveBeenCalledTimes(1);
    rerender(<PluginResource {...openReference([imageTarget])} onFailure={onFailure} />);
    quiet.mockRestore();
    expect(screen.queryByTestId('resource-failure')).toBeNull();
    expect(screen.getByRole('img', { name: 'A′' })).toHaveAttribute('src', PICTURE_URL);
  });

  it('draws an embedded Image Target that did not load as the Image plugin does, with no Replace', () => {
    render(<PluginResource {...openReference([imageTarget])} />);
    fireEvent.error(screen.getByRole('img', { name: 'A′' }));
    expect(screen.getByText('Image did not load')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Replace/u })).toBeNull();
    expect(railCommands()).toEqual(['Close Resource A′', 'Rename Resource A′']);
  });
});

describe('an embedding inside an embedded Resource', () => {
  it('draws a note saying it shows nothing further, not that an existing Resource was deleted', () => {
    // The Target embeds a Resource the Reference could itself embed: the
    // embedded surface still offers it nothing.
    const inner = uuidSchema.parse('00000000-0000-4000-8000-0000000000c3');
    const innerImage: Resource = { ...imageTarget, id: inner };
    render(probedReference(openReference([probeTarget({ embeds: inner }), innerImage])));
    expect(screen.getByTestId('probe')).toBeInTheDocument();
    expect(screen.getByTestId('embedding-note')).toHaveTextContent(
      'A Resource shown inside another shows nothing further.',
    );
    expect(screen.queryByRole('img', { name: 'Inner' })).toBeNull();
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
