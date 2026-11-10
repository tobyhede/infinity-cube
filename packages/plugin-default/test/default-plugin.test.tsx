import { screen } from '@testing-library/react';
import { renderPlugin } from '@project/resource-api/view/testing';
import { defaultPlugin } from '@project/plugin-default/domain';
import { defaultPluginView } from '@project/plugin-default/view';

describe('the default plugin’s domain half', () => {
  it('accepts any content and Map content, reading neither', () => {
    for (const value of [{}, { source: '/assets/x', nested: [1, null] }, 'text', 3]) {
      expect(defaultPlugin.content.parse(value)).toEqual(value);
      expect(defaultPlugin.mapContent.schema.parse(value)).toEqual(value);
    }
  });

  it('declares no reference, no Create and no outline, and may be a Target', () => {
    for (const declaration of [
      'resourceReferences',
      'spaceReferences',
      'contentTarget',
      'newContent',
      'outline',
    ] as const) {
      expect(defaultPlugin).not.toHaveProperty(declaration);
    }
    expect(defaultPlugin.mayBeTarget).toBe(true);
  });
});

describe('the default plugin’s view', () => {
  it('draws the Title and says the kind is not available, offering nothing', () => {
    const rendered = renderPlugin(defaultPluginView.View, {
      content: { diagram: 'graph TD' },
      map: {},
      title: 'Flow',
      kind: 'vnd.example.diagram',
    });
    expect(screen.getByTestId('plugin-title')).toHaveTextContent('Flow');
    expect(screen.getByText(/vnd\.example\.diagram/u)).toHaveTextContent('not available');
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(rendered.commits).toEqual({
      title: [],
      content: [],
      map: [],
      stored: [],
      hints: [],
      claims: { taken: 0, released: 0 },
      exclusive: 0,
      picked: 0,
    });
  });

  it('commits no content, Map content or asset where every capability is granted', () => {
    const rendered = renderPlugin(defaultPluginView.View, {
      content: {},
      map: {},
      kind: 'video',
      grants: { title: true, content: true, map: true, claim: true, store: true, pick: true },
    });
    expect(rendered.commits.content).toEqual([]);
    expect(rendered.commits.map).toEqual([]);
    expect(rendered.commits.stored).toEqual([]);
    expect(rendered.commits.claims.taken).toBe(0);
  });
});
