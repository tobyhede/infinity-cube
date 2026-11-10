import { screen, fireEvent, waitFor } from '@testing-library/react';
import { OUTLINES, RECTANGLE } from '@project/resource-api/domain';
import { renderPlugin } from '@project/resource-api/view/testing';
import { urPlugin, type UrMapContent } from '@project/plugin-ur/domain';
import { urPluginView } from '@project/plugin-ur/view';

const ellipse: UrMapContent = { shape: 'ellipse' };

describe('the Ur plugin’s domain half', () => {
  it('keeps a Shape per Map, rectangular where a Map stores none and where there is no Map', () => {
    expect(urPlugin.mapContent.default).toEqual({ shape: RECTANGLE });
    expect(urPlugin.mapContent.withoutMap).toBeUndefined();
    for (const outline of OUTLINES) {
      expect(urPlugin.mapContent.schema.parse({ shape: outline })).toEqual({ shape: outline });
      expect(urPlugin.outline?.({ shape: outline })).toBe(outline);
    }
  });

  it('refuses Map content that is not a Shape, and content that is not empty', () => {
    expect(urPlugin.mapContent.schema.safeParse({ shape: 'hexagon' }).success).toBe(false);
    expect(urPlugin.mapContent.schema.safeParse({ shape: 'pill', open: true }).success).toBe(false);
    expect(urPlugin.mapContent.schema.safeParse({}).success).toBe(false);
    expect(urPlugin.content.safeParse({ source: '' }).success).toBe(false);
    expect(urPlugin.content.parse({})).toEqual({});
  });
});

describe('the Ur plugin’s view', () => {
  it('draws its Title and offers nothing with every capability absent', () => {
    const rendered = renderPlugin(urPluginView.View, {
      content: {},
      map: ellipse,
      title: 'Start',
    });
    expect(screen.getByTestId('plugin-title')).toHaveTextContent('Start');
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(rendered.commits).toEqual({
      title: [],
      content: [],
      map: [],
      stored: [],
      exclusive: 0,
    });
  });

  it('offers its Shape on the rail where the Map content commit is present, and commits the choice', async () => {
    const rendered = renderPlugin(urPluginView.View, {
      content: {},
      map: ellipse,
      grants: { map: true },
    });
    const choice = screen.getByRole('radiogroup', { name: 'Shape' });
    expect(screen.getByRole('radio', { name: 'Ellipse' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: 'Diamond' }));
    expect(rendered.commits.map).toEqual([{ shape: 'diamond' }]);
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Diamond' })).toHaveAttribute(
        'aria-checked',
        'true',
      ),
    );
    expect(choice).toBeInTheDocument();
  });

  it('shows a refusal in its rect and keeps the Shape it had', async () => {
    renderPlugin(urPluginView.View, {
      content: {},
      map: ellipse,
      grants: { map: true },
      answer: { refused: 'Not now.' },
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Pill' }));
    // A refusal arrived, announced as a refusal is (`docs/agents/ui.md`); its words are the host's.
    expect(await screen.findByRole('alert')).toHaveTextContent('Not now.');
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('radio', { name: 'Ellipse' })).toHaveAttribute('aria-checked', 'true');
  });
});
