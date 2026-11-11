import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { type JsonValue, type ResourceShape } from '@project/core';
import { definePlugin, type Answer } from '@project/resource-api/domain';
import { definePluginView, Title, type Surface } from '@project/resource-api/view';
import {
  PluginResource,
  PresentedPluginResource,
  type PluginHostClaim,
  type PluginResourceProps,
} from '../src';
import { pluginEntry } from '../src/kinds/plugin-views';
import { PluginSurface } from '../src/PluginResource';

/**
 * A plugin of the test's own, drawn through the same host: it keeps every
 * surface it is handed, takes a Claim when told to, and throws when its
 * content says so, so what the host offers and withdraws can be read.
 */
const probeContent = z.object({ fails: z.boolean() }).strict();
const probeMap = z.object({ n: z.number() }).strict();
const probePlugin = definePlugin({
  apiVersion: 1,
  kind: 'probe',
  name: 'Probe',
  listName: 'Probes',
  referenceName: null,
  content: probeContent,
  newContent: { fails: false },
  mapContent: { schema: probeMap, default: { n: 0 } },
});
type ProbeSurface = Surface<z.output<typeof probeContent>, z.output<typeof probeMap>>;
const surfaces: ProbeSurface[] = [];
let claimOnMount = false;
function ProbeView({ surface }: { readonly surface: ProbeSurface }) {
  surfaces.push(surface);
  if (surface.content.value.fails) throw new Error('The probe was told to fail.');
  const claim = surface.claim;
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (claimOnMount) claim?.();
  }, [claim]);
  return (
    <div data-testid="probe">
      <Title />
      <button type="button" onClick={() => setCount(count + 1)}>
        Counted {count}
      </button>
    </div>
  );
}
const probeEntry = pluginEntry(
  probePlugin,
  definePluginView(probePlugin, { View: ProbeView, Glyph: () => null }),
);
const probeProps = (overrides: Partial<PluginResourceProps> = {}): PluginResourceProps => ({
  resourceId: 'probe',
  kind: 'ur',
  title: { title: 'Probe', readOnly: false, onReturnFocus: () => undefined },
  content: { fails: false },
  mapContent: { n: 1 },
  outline: 'rectangle',
  state: 'rest',
  graphColor: '#ffc53d',
  readOnly: false,
  operations: { kind: 'ur' },
  ...overrides,
});

const title = { title: 'Decide', readOnly: false, onReturnFocus: () => undefined };

const props = (
  resourceShape: ResourceShape,
  overrides: Partial<PluginResourceProps> = {},
): PluginResourceProps => ({
  resourceId: 'decide',
  kind: 'ur',
  title,
  content: {},
  mapContent: { shape: resourceShape },
  outline: resourceShape,
  state: 'rest',
  graphColor: '#ffc53d',
  readOnly: false,
  operations: { kind: 'ur' },
  ...overrides,
});

/** Why an answer refused, or undefined for one that did not. */
const reasonOf = (answer: Answer | undefined): string | undefined =>
  answer === undefined || answer === 'completed' || answer === 'unchanged'
    ? undefined
    : answer.refused;

const outline = (resource: HTMLElement) => resource.querySelector('.canvas-resource__outline');

describe('the Map host a plugin draws inside (ADR 0142)', () => {
  it.each([
    ['pill', 'rect'],
    ['ellipse', 'rect'],
    ['diamond', 'polygon'],
  ] as const)('strokes the border and ring on a declared %s', (resourceShape, element) => {
    render(
      <PluginResource
        {...props(resourceShape)}
        state="selected"
        size={{ width: 480, height: 300 }}
      />,
    );
    const resource = screen.getByRole('article', { name: 'Decide' });
    expect(resource).toHaveAttribute('data-resource-shape', resourceShape);
    const drawn = outline(resource);
    const ring = drawn?.querySelector('.canvas-resource__outline-ring');
    const edge = drawn?.querySelector('.canvas-resource__outline-edge');
    expect(edge?.tagName).toBe(element);
    expect(ring?.tagName).toBe(element);
    expect(drawn?.getAttribute('viewBox')).toBe('0 0 480 300');
  });

  it('draws no outline for a rectangle, whose border is the rect', () => {
    render(<PluginResource {...props('rectangle')} />);
    const resource = screen.getByRole('article', { name: 'Decide' });
    expect(resource).toHaveAttribute('data-resource-shape', 'rectangle');
    expect(outline(resource)).toBeNull();
  });

  it("draws the plugin's view, with the Title the host owns", () => {
    render(
      <PluginResource {...props('diamond')} title={{ ...title, title: 'Decide\nwhich way' }} />,
    );
    const resource = screen.getByRole('article', { name: 'Decide' });
    expect(resource.querySelector('[data-outline="diamond"]')).not.toBeNull();
    expect(resource).toHaveTextContent(/Decide/u);
    expect(resource).toHaveTextContent(/which way/u);
  });

  it('offers the rename the Title carries, and writes it in place', () => {
    const begin = vi.fn();
    const { rerender } = render(
      <PluginResource {...props('pill')} title={{ ...title, onBeginTitleEdit: begin }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit Title Decide' }));
    expect(begin).toHaveBeenCalledTimes(1);
    rerender(
      <PluginResource
        {...props('pill')}
        state="editing"
        title={{ ...title, editor: { onComplete: () => null, onCancel: () => undefined } }}
      />,
    );
    const box = screen.getByRole('textbox', { name: 'Resource title' });
    fireEvent.change(box, { target: { value: 'Decide now' } });
    // A render of the host does not remount the Title, so the draft survives it.
    rerender(
      <PluginResource
        {...props('pill')}
        state="editing"
        graphColor="#00ff00"
        title={{ ...title, editor: { onComplete: () => null, onCancel: () => undefined } }}
      />,
    );
    expect(screen.getByRole('textbox', { name: 'Resource title' })).toBe(box);
  });

  it("draws the plugin's rail commands on the Resource's rail, and runs them", async () => {
    const commitMap = vi.fn((next: JsonValue): Promise<Answer> => {
      expect(next).toEqual({ shape: 'pill' });
      return Promise.resolve('completed');
    });
    render(
      <PluginResource
        {...props('ellipse')}
        state="selected"
        operations={{ kind: 'ur', commitMap }}
      />,
    );
    const face = screen.getByRole('button', { name: 'Shape: Ellipse' });
    expect(face.querySelector('svg[data-resource-shape="ellipse"]')).not.toBeNull();
    fireEvent.click(face);
    const items = await screen.findAllByRole('menuitemradio');
    expect(items.map((item) => item.textContent)).toEqual([
      'Rectangle',
      'Pill',
      'Ellipse',
      'Diamond',
    ]);
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Pill' }));
    expect(commitMap).toHaveBeenCalledTimes(1);
  });

  it('offers a plugin no commit on a read-only surface, so it draws no Shape choice', () => {
    render(
      <PluginResource
        {...props('ellipse')}
        readOnly
        state="selected"
        operations={{ kind: 'ur', commitMap: () => Promise.resolve('completed') }}
      />,
    );
    expect(screen.queryByRole('button', { name: /^Shape/u })).toBeNull();
  });

  it('answers a commit the plugin kept refused once the surface has gone', async () => {
    surfaces.length = 0;
    const commitMap = vi.fn(() => Promise.resolve<Answer>('completed'));
    const { unmount } = render(
      <PluginSurface
        {...probeProps({ operations: { kind: 'ur', commitMap } })}
        entry={probeEntry}
      />,
    );
    const kept = surfaces.at(-1)?.map.commit;
    expect(kept).toBeDefined();
    await expect(kept?.({ n: 2 })).resolves.toBe('completed');
    expect(commitMap).toHaveBeenLastCalledWith({ n: 2 }, undefined);
    unmount();
    await expect(kept?.({ n: 3 })).resolves.toEqual({
      refused: 'This Resource is no longer drawn here.',
    });
    expect(commitMap).toHaveBeenCalledTimes(1);
  });

  it('refuses a committed value that is not JSON before the host sees it', async () => {
    surfaces.length = 0;
    const commitMap = vi.fn(() => Promise.resolve<Answer>('completed'));
    render(
      <PluginSurface
        {...probeProps({ operations: { kind: 'ur', commitMap } })}
        entry={probeEntry}
      />,
    );
    await expect(surfaces.at(-1)?.map.commit?.({ n: Number.NaN })).resolves.toEqual({
      refused: 'This change cannot be kept.',
    });
    expect(commitMap).not.toHaveBeenCalled();
  });

  it('hands the plugin one Embed and one Title for the surface’s lifetime', () => {
    surfaces.length = 0;
    const { rerender } = render(<PluginSurface {...probeProps()} entry={probeEntry} />);
    rerender(
      <PluginSurface
        {...probeProps({ state: 'selected', mapContent: { n: 9 } })}
        entry={probeEntry}
      />,
    );
    rerender(<PluginSurface {...probeProps({ graphColor: '#000000' })} entry={probeEntry} />);
    expect(surfaces.length).toBeGreaterThanOrEqual(3);
    expect(new Set(surfaces.map((surface) => surface.Embed)).size).toBe(1);
    expect(surfaces.map((surface) => surface.map.value)).toContainEqual({ n: 9 });
  });

  it('offers no commit and no Claim on a read-only surface', () => {
    surfaces.length = 0;
    render(
      <PluginSurface
        {...probeProps({
          readOnly: true,
          operations: {
            kind: 'ur',
            commitMap: () => Promise.resolve('completed'),
            claim: () => undefined,
          },
        })}
        entry={probeEntry}
      />,
    );
    const surface = surfaces.at(-1);
    expect(surface?.map.commit).toBeUndefined();
    expect(surface?.content.commit).toBeUndefined();
    expect(surface?.claim).toBeUndefined();
  });

  it('releases every Claim taken through it when it unmounts, and grants none after', () => {
    surfaces.length = 0;
    claimOnMount = true;
    const unmountClaim = vi.fn();
    const held: PluginHostClaim = {
      release: () => true,
      exclusively: () => Promise.resolve('busy'),
      unmount: unmountClaim,
    };
    const claim = vi.fn(() => held);
    const { unmount } = render(
      <PluginSurface {...probeProps({ operations: { kind: 'ur', claim } })} entry={probeEntry} />,
    );
    claimOnMount = false;
    expect(claim).toHaveBeenCalledTimes(1);
    expect(unmountClaim).not.toHaveBeenCalled();
    const kept = surfaces.at(-1)?.claim;
    unmount();
    expect(unmountClaim).toHaveBeenCalledTimes(1);
    expect(kept?.()).toBeUndefined();
    expect(claim).toHaveBeenCalledTimes(1);
  });

  it('loses only its own Resource when its plugin throws', () => {
    const onFailure = vi.fn();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <div>
        <PluginSurface
          {...probeProps({ content: { fails: true }, title: { ...title, title: 'Decide' } })}
          entry={probeEntry}
          onFailure={onFailure}
        />
        <PluginResource
          {...props('pill')}
          resourceId="other"
          title={{ ...title, title: 'Other' }}
        />
      </div>,
    );
    error.mockRestore();
    expect(screen.getByRole('article', { name: 'Decide' })).toContainElement(
      screen.getByTestId('resource-failure'),
    );
    expect(screen.getByRole('article', { name: 'Other' })).toHaveTextContent('Other');
    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  it('reports a throw to the reporter the surface was offered', () => {
    const onFailure = vi.fn();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <PluginSurface
        {...probeProps({ content: { fails: true }, operations: { kind: 'ur', onFailure } })}
        entry={probeEntry}
      />,
    );
    error.mockRestore();
    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  it('draws the plugin again once the Space is replaced or its Map content changes', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { rerender } = render(
      <PluginSurface
        {...probeProps({ content: { fails: true }, operations: { kind: 'ur', epoch: 1 } })}
        entry={probeEntry}
      />,
    );
    expect(screen.getByTestId('resource-failure')).toBeInTheDocument();
    // The same content, as drawn: still failed.
    rerender(
      <PluginSurface
        {...probeProps({ content: { fails: false }, operations: { kind: 'ur', epoch: 1 } })}
        entry={probeEntry}
      />,
    );
    expect(screen.getByTestId('resource-failure')).toBeInTheDocument();
    rerender(
      <PluginSurface
        {...probeProps({ content: { fails: false }, operations: { kind: 'ur', epoch: 2 } })}
        entry={probeEntry}
      />,
    );
    expect(screen.getByTestId('probe')).toBeInTheDocument();
    rerender(
      <PluginSurface
        {...probeProps({ content: { fails: true }, operations: { kind: 'ur', epoch: 2 } })}
        entry={probeEntry}
      />,
    );
    rerender(
      <PluginSurface
        {...probeProps({
          content: { fails: false },
          mapContent: { n: 2 },
          operations: { kind: 'ur', epoch: 2 },
        })}
        entry={probeEntry}
      />,
    );
    error.mockRestore();
    expect(screen.getByTestId('probe')).toBeInTheDocument();
  });

  it('offers no authoring while exclusive work runs elsewhere, its own Title and Actions included', () => {
    render(
      <PluginResource
        {...props('pill')}
        state="selected"
        title={{ ...title, onBeginTitleEdit: () => undefined }}
        entityActions={[[{ id: 'delete', label: 'Delete', onSelect: () => 'done' as const }]]}
        operations={{ kind: 'ur', withdrawn: true, commitMap: () => Promise.resolve('completed') }}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Edit Title Decide' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Shape/u })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Actions for Resource Decide' })).toBeNull();
  });

  it('gives the plugin the whole rect while this drawing holds a Claim, and not another', () => {
    const { rerender } = render(<PluginResource {...props('pill')} />);
    const layer = () =>
      screen.getByRole('article', { name: 'Decide' }).querySelector('.canvas-resource__plugin');
    expect(layer()).not.toHaveClass('nodrag');
    rerender(
      <PluginResource
        {...props('pill')}
        operations={{ kind: 'ur', claimHolder: () => 'another-drawing' }}
      />,
    );
    expect(layer()).not.toHaveClass('nodrag');
    rerender(
      <PluginResource
        {...props('pill')}
        operations={{ kind: 'ur', claimHolder: () => 'this-drawing' }}
      />,
    );
    expect(layer()).toHaveClass('nodrag', 'nopan', 'nowheel');
  });

  it('keeps a drawn plugin, its state and its Claim through a change of its Map content', () => {
    surfaces.length = 0;
    claimOnMount = true;
    const unmountClaim = vi.fn();
    const claim = vi.fn((): PluginHostClaim => ({
      release: () => true,
      exclusively: () => Promise.resolve('busy'),
      unmount: unmountClaim,
    }));
    const operations = { kind: 'ur' as const, claim };
    const { rerender } = render(
      <PluginSurface {...probeProps({ operations })} entry={probeEntry} />,
    );
    claimOnMount = false;
    fireEvent.click(screen.getByRole('button', { name: 'Counted 0' }));
    rerender(
      <PluginSurface {...probeProps({ operations, mapContent: { n: 2 } })} entry={probeEntry} />,
    );
    expect(screen.getByRole('button', { name: 'Counted 1' })).toBeInTheDocument();
    expect(claim).toHaveBeenCalledTimes(1);
    expect(unmountClaim).not.toHaveBeenCalled();
  });

  it('offers no commit to a drawing while another drawing of its Resource holds a Claim', async () => {
    surfaces.length = 0;
    let holder: symbol | undefined;
    const commitMap = vi.fn(() => Promise.resolve<Answer>('completed'));
    const operations = {
      kind: 'ur' as const,
      commitMap,
      claim: (drawing: symbol): PluginHostClaim | undefined => {
        if (holder !== undefined && holder !== drawing) return undefined;
        holder = drawing;
        return {
          release: () => true,
          exclusively: () => Promise.resolve('busy'),
          unmount: () => {
            holder = undefined;
          },
        };
      },
      claimHolder: (drawing: symbol) =>
        holder === undefined ? 'none' : holder === drawing ? 'this-drawing' : 'another-drawing',
    } as const;
    const second = render(
      <PluginSurface
        {...probeProps({ operations, title: { ...title, title: 'Second' } })}
        entry={probeEntry}
      />,
    );
    const kept = surfaces.at(-1)?.map.commit;
    expect(kept).toBeDefined();
    claimOnMount = true;
    render(
      <PluginSurface
        {...probeProps({ operations, title: { ...title, title: 'First' } })}
        entry={probeEntry}
      />,
    );
    claimOnMount = false;
    expect(holder).toBeDefined();
    const claimant = surfaces.at(-1);

    // A commit the second drawing kept from before the Claim answers refused.
    expect(reasonOf(await kept?.({ n: 5 }))).toMatch(/\S/u);
    expect(commitMap).not.toHaveBeenCalled();
    // Drawn again, it is offered none, and no Claim.
    second.rerender(
      <PluginSurface
        {...probeProps({ operations, title: { ...title, title: 'Second' } })}
        entry={probeEntry}
      />,
    );
    expect(surfaces.at(-1)?.map.commit).toBeUndefined();
    expect(surfaces.at(-1)?.claim).toBeUndefined();
    // The claimant's commits stay.
    await expect(claimant?.map.commit?.({ n: 6 })).resolves.toBe('completed');
    expect(commitMap).toHaveBeenCalledTimes(1);
    // Unmounting the second drawing leaves the claimant's Claim held.
    second.unmount();
    expect(holder).toBeDefined();
  });
});

describe('the Stage host a plugin draws inside (ADR 0142)', () => {
  it('hands the plugin one Title for the drawing’s lifetime, which a rename does not remount', () => {
    const { rerender } = render(
      <PresentedPluginResource resourceId="decide" kind="ur" title="Decide" content={{}} />,
    );
    const drawn = screen.getByRole('heading', { name: 'Decide' });
    rerender(
      <PresentedPluginResource resourceId="decide" kind="ur" title="Decided" content={{}} />,
    );
    expect(screen.getByRole('heading', { name: 'Decided' })).toBe(drawn);
  });

  it('gives the plugin the value withoutMap gives, and no commit', () => {
    render(
      <PresentedPluginResource
        resourceId="decide"
        kind="ur"
        title={'Decide\nwhich way'}
        content={{}}
      />,
    );
    const presented = screen.getByTestId('resource-content');
    expect(presented).toHaveAttribute('data-content-kind', 'ur');
    expect(presented.querySelector('[data-outline="rectangle"]')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Decide' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Shape/u })).toBeNull();
  });

  it('draws a short note in place of a plugin that throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await act(async () => {
      render(<PresentedPluginResource resourceId="x" kind="ur" title="X" content="not Ur's" />);
      await Promise.resolve();
    });
    error.mockRestore();
    expect(screen.getByTestId('resource-failure')).toHaveTextContent(
      'This Resource could not be drawn.',
    );
  });

  it('draws the next Resource afresh after one that threw, and after a replacement', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onFailure = vi.fn();
    let rendered: ReturnType<typeof render> | undefined;
    await act(async () => {
      rendered = render(
        <PresentedPluginResource
          resourceId="x"
          kind="ur"
          title="X"
          content="not Ur's"
          onFailure={onFailure}
        />,
      );
      await Promise.resolve();
    });
    expect(onFailure).toHaveBeenCalledTimes(1);
    const rerender = (ui: Parameters<ReturnType<typeof render>['rerender']>[0]) =>
      rendered?.rerender(ui);
    rerender(<PresentedPluginResource resourceId="y" kind="ur" title="Y" content={{}} />);
    expect(screen.queryByTestId('resource-failure')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Y' })).toBeVisible();
    rerender(<PresentedPluginResource resourceId="y" kind="ur" title="Y" content="not Ur's" />);
    rerender(
      <PresentedPluginResource
        resourceId="y"
        kind="ur"
        title="Y"
        content={{}}
        replacementEpoch={1}
      />,
    );
    error.mockRestore();
    expect(screen.queryByTestId('resource-failure')).toBeNull();
  });
});
