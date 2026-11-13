import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { uuidSchema, type Resource } from '@project/core';
import { PLUGIN_VIEWS, pluginHalves, type PluginHalves } from '@project/plugins/view';
import { definePlugin } from '@project/resource-api/domain';
import { definePluginView, Title } from '@project/resource-api/view';
import {
  PluginCatalogProvider,
  PluginResource,
  PresentedPluginResource,
  ResourceKindIcon,
  pluginCatalog,
  type PluginResourceProps,
} from '../src';

/**
 * A surface draws with the catalogue it is handed (ADR 0142), so a plugin in
 * no build's list is drawn on the Map, on the Stage and through an embedding
 * by the same host as a listed one, and what the host draws for a declared
 * content Target comes from that declaration, never from a kind.
 */

const probePlugin = definePlugin({
  apiVersion: 1,
  kind: 'probe',
  name: 'Probe',
  listName: 'Probes',
  referenceName: 'Reference to a Probe',
  mayBeTarget: true,
  content: z.object({ note: z.string() }).strict(),
  mapContent: { schema: z.object({}).strict(), default: {} },
});
function ProbeGlyph({ size }: { readonly size?: number | undefined }) {
  return <svg data-testid="probe-glyph" width={size} />;
}
const probe = pluginHalves(
  probePlugin,
  definePluginView(probePlugin, {
    View: ({ surface }) => (
      <div data-testid="probe">
        <Title />
        <p>{surface.content.value.note}</p>
      </div>
    ),
    Glyph: ProbeGlyph,
  }),
);

/** A plugin whose Resources show another's content: a content Target it declares. */
const pointerPlugin = definePlugin({
  apiVersion: 1,
  kind: 'pointer',
  name: 'Pointer',
  listName: 'Pointers',
  referenceName: null,
  content: z.object({ target: z.string() }).strict(),
  resourceReferences: (content) => [content.target],
  contentTarget: (content) => content.target,
  mapContent: { schema: z.object({}).strict(), default: {} },
});
const pointer = pluginHalves(
  pointerPlugin,
  definePluginView(pointerPlugin, {
    View: () => (
      <div data-testid="pointer">
        <Title />
      </div>
    ),
    Glyph: () => <svg data-testid="pointer-glyph" />,
  }),
);

const listed = (kind: string): PluginHalves => {
  const found = PLUGIN_VIEWS.find((halves) => halves.kind === kind);
  if (found === undefined) throw new Error(`No listed plugin draws "${kind}".`);
  return found;
};
const CATALOG = pluginCatalog([probe, pointer, listed('reference')]);

const RESOURCE = uuidSchema.parse('00000000-0000-4000-8000-0000000000c1');
const TARGET = uuidSchema.parse('00000000-0000-4000-8000-0000000000c2');

const onMap = (overrides: Partial<PluginResourceProps>): PluginResourceProps => ({
  resourceId: RESOURCE,
  kind: 'probe',
  title: { title: 'Probed', readOnly: true, onReturnFocus: () => undefined },
  content: { note: 'Drawn by the probe.' },
  mapContent: {},
  outline: 'rectangle',
  state: 'rest',
  graphColor: '#ffc53d',
  readOnly: true,
  operations: { kind: 'probe' },
  ...overrides,
});

describe('a plugin in the catalogue a surface is handed', () => {
  it('is drawn on the Map', () => {
    render(
      <PluginCatalogProvider catalog={CATALOG}>
        <PluginResource {...onMap({})} />
      </PluginCatalogProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('Drawn by the probe.');
    expect(screen.getByRole('article', { name: 'Probed' })).not.toHaveAttribute(
      'data-shows-target',
    );
  });

  it('is drawn on the Stage', () => {
    render(
      <PluginCatalogProvider catalog={CATALOG}>
        <PresentedPluginResource
          resourceId={RESOURCE}
          kind="probe"
          title="Probed"
          content={{ note: 'Presented by the probe.' }}
        />
      </PluginCatalogProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('Presented by the probe.');
  });

  it('is drawn through an embedding', () => {
    const target: Resource = {
      id: TARGET,
      title: 'The probed one',
      kind: 'probe',
      content: { note: 'Embedded by the probe.' },
    };
    render(
      <PluginCatalogProvider catalog={CATALOG}>
        <PluginResource
          {...onMap({
            kind: 'reference',
            title: { title: 'A view', readOnly: true, onReturnFocus: () => undefined },
            content: { target: TARGET },
            mapContent: { open: true },
            embeddable: [target],
            operations: { kind: 'reference' },
          })}
        />
      </PluginCatalogProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('Embedded by the probe.');
  });

  it('is drawn by the default plugin in a catalogue that does not hold it', () => {
    render(
      <PluginCatalogProvider catalog={pluginCatalog([pointer])}>
        <PluginResource {...onMap({})} />
      </PluginCatalogProvider>,
    );
    expect(screen.queryByTestId('probe')).toBeNull();
    expect(screen.getByRole('article', { name: 'Probed' })).toBeVisible();
  });
});

describe('a plugin that declares a content Target', () => {
  it('is drawn dotted, keyed on that declaration', () => {
    render(
      <PluginCatalogProvider catalog={CATALOG}>
        <PluginResource
          {...onMap({
            kind: 'pointer',
            content: { target: TARGET },
            operations: { kind: 'pointer' },
          })}
        />
      </PluginCatalogProvider>,
    );
    expect(screen.getByRole('article', { name: 'Probed' })).toHaveAttribute('data-shows-target');
  });

  it("has its glyph drawn as its Target's glyph with the badge on it, named for the Target", () => {
    render(
      <PluginCatalogProvider catalog={CATALOG}>
        <ResourceKindIcon kind="pointer" referenceOf="probe" />
      </PluginCatalogProvider>,
    );
    const glyph = screen.getByRole('img', { name: 'Reference to a Probe' });
    expect(glyph.querySelector('[data-testid="probe-glyph"]')).not.toBeNull();
    expect(glyph.querySelector('[data-testid="pointer-glyph"]')).toBeNull();
    expect(glyph.querySelector('mask')).not.toBeNull();
  });

  it('is badged only where it declares a Target', () => {
    render(
      <PluginCatalogProvider catalog={CATALOG}>
        <ResourceKindIcon kind="probe" />
      </PluginCatalogProvider>,
    );
    const glyph = screen.getByRole('img', { name: 'Probe' });
    expect(glyph.querySelector('[data-testid="probe-glyph"]')).not.toBeNull();
    expect(glyph.querySelector('mask')).toBeNull();
  });
});
