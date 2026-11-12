import { fireEvent, screen } from '@testing-library/react';
import { RAIL_BAND } from '@project/resource-api/view';
import { renderPlugin } from '@project/resource-api/view/testing';
import {
  referencePlugin,
  type ReferenceContent,
  type ReferenceMapContent,
} from '@project/plugin-reference/domain';
import { referencePluginView } from '@project/plugin-reference/view';

const TARGET = '00000000-0000-4000-8000-000000000002';
const content: ReferenceContent = { target: TARGET };
const open: ReferenceMapContent = { open: true };
const closed: ReferenceMapContent = { open: false };

describe('the Reference plugin’s domain half', () => {
  it('references its Target, shows its content, and may not itself be a Target', () => {
    expect(referencePlugin.resourceReferences?.(content)).toEqual([TARGET]);
    expect(referencePlugin.contentTarget?.(content)).toBe(TARGET);
    expect(referencePlugin.mayBeTarget).toBeUndefined();
    expect(referencePlugin.referenceName).toBeNull();
    expect(referencePlugin.newContent).toBeUndefined();
  });

  it('is Closed where a Map stores nothing and Open where there is no Map', () => {
    expect(referencePlugin.mapContent.default).toEqual(closed);
    expect(referencePlugin.mapContent.withoutMap).toEqual(open);
    expect(referencePlugin.mapContent.schema.safeParse({ shape: 'pill' }).success).toBe(false);
  });

  it('keeps one Target id, strictly', () => {
    expect(referencePlugin.content.parse(content)).toEqual(content);
    expect(referencePlugin.content.safeParse({ target: 'not-an-id' }).success).toBe(false);
    expect(referencePlugin.content.safeParse({ target: TARGET, open: true }).success).toBe(false);
  });
});

describe('the Reference plugin’s view', () => {
  it('draws its own Title when Closed and embeds nothing, offering nothing with every capability absent', () => {
    renderPlugin(referencePluginView.View, { content, map: closed, title: 'A′' });
    expect(screen.getByTestId('plugin-title')).toHaveTextContent('A′');
    expect(screen.getByRole('img', { name: 'Reference Resource' })).toBeInTheDocument();
    expect(screen.queryByTestId('embedded-resource')).toBeNull();
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('pads its Closed Title by the band its surface keeps clear, none where it keeps none', () => {
    const { unmount } = renderPlugin(referencePluginView.View, { content, map: closed });
    expect(screen.getByTestId('plugin-title').parentElement).toHaveStyle({
      paddingTop: `${String(RAIL_BAND)}px`,
    });
    unmount();
    renderPlugin(referencePluginView.View, { content, map: closed, railBand: 0 });
    expect(screen.getByTestId('plugin-title').parentElement).toHaveStyle({ paddingTop: '0px' });
  });

  it('embeds its Target when Open, passing its own Title in place of drawing it', () => {
    renderPlugin(referencePluginView.View, { content, map: open, title: 'A′' });
    const embedded = screen.getByTestId('embedded-resource');
    expect(embedded).toHaveAttribute('data-resource', TARGET);
    expect(screen.getByTestId('embedded-title')).toHaveTextContent('A′');
    expect(screen.queryByTestId('plugin-title')).toBeNull();
    // With no Title commit, it passes no rename.
    expect(screen.queryByRole('button', { name: `Rename embedded ${TARGET}` })).toBeNull();
  });

  it('passes its own rename with its Title, so a rename inside the embedding renames the Reference', async () => {
    const rendered = renderPlugin(referencePluginView.View, {
      content,
      map: open,
      title: 'A′',
      grants: { title: true },
    });
    fireEvent.click(screen.getByRole('button', { name: `Rename embedded ${TARGET}` }));
    expect(await screen.findByText('A′′')).toBeInTheDocument();
    expect(rendered.commits.title).toEqual(['A′′']);
  });

  it('Opens and Closes through its Map content, with no size hint', async () => {
    const rendered = renderPlugin(referencePluginView.View, {
      content,
      map: closed,
      title: 'A′',
      grants: { map: true },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open Resource A′' }));
    await screen.findByTestId('embedded-resource');
    fireEvent.click(screen.getByRole('button', { name: 'Close Resource A′' }));
    await screen.findByTestId('plugin-title');
    expect(rendered.commits.map).toEqual([open, closed]);
    expect(rendered.commits.hints).toEqual([undefined, undefined]);
  });

  it('shows a refused Open as the host worded it, staying Closed', async () => {
    renderPlugin(referencePluginView.View, {
      content,
      map: closed,
      title: 'A′',
      grants: { map: true },
      answer: { refused: 'Not now.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open Resource A′' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Not now.');
    expect(screen.getByTestId('plugin-title')).toHaveTextContent('A′');
  });
});
