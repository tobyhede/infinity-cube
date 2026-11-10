import { fireEvent, screen } from '@testing-library/react';
import { renderPlugin } from '@project/resource-api/view/testing';
import {
  selectView,
  spacePlugin,
  viewOf,
  type SpaceContent,
  type SpaceMapContent,
} from '@project/plugin-space/domain';
import { spacePluginView } from '@project/plugin-space/view';

const SPACE = '00000000-0000-4000-8000-000000000001';
const MAP = '00000000-0000-4000-8000-000000000002';
const GRAPH = '00000000-0000-4000-8000-000000000003';
const OTHER_MAP = '00000000-0000-4000-8000-000000000004';
const OTHER_GRAPH = '00000000-0000-4000-8000-000000000005';
const framing = { centreX: 10, centreY: 20, zoom: 2 };
const content: SpaceContent = { spaceId: SPACE, map: MAP, graph: GRAPH };
const open: SpaceMapContent = { open: true };
const closed: SpaceMapContent = { open: false };

describe('the Space plugin’s domain half', () => {
  it('references the Space it shows, owning its lifetime, and may be a Target', () => {
    expect(spacePlugin.spaceReferences?.(content)).toEqual([SPACE]);
    expect(spacePlugin.ownsReferencedSpaces).toBe(true);
    expect('resourceReferences' in spacePlugin).toBe(false);
    expect(spacePlugin.mayBeTarget).toBe(true);
    expect(spacePlugin.referenceName).toBe('Reference to a Space Resource');
    // Created with the Space it shows, by the host's lifecycle (ADR 0074).
    expect(spacePlugin.newContent).toBeUndefined();
  });

  it('is Closed where a Map stores nothing and Open where there is no Map', () => {
    expect(spacePlugin.mapContent.default).toEqual(closed);
    expect(spacePlugin.mapContent.withoutMap).toEqual(open);
    expect(spacePlugin.mapContent.schema.safeParse({ open: true, size: 1 }).success).toBe(false);
  });

  it('keeps its selection strictly, with framing optional', () => {
    expect(spacePlugin.content.parse(content)).toEqual(content);
    expect(spacePlugin.content.parse({ ...content, framing })).toEqual({ ...content, framing });
    expect(spacePlugin.content.safeParse({ ...content, map: 'not-an-id' }).success).toBe(false);
    expect(spacePlugin.content.safeParse({ ...content, open: true }).success).toBe(false);
    expect(
      spacePlugin.content.safeParse({ ...content, framing: { ...framing, zoom: 0 } }).success,
    ).toBe(false);
  });

  it('declares its selection, which keeps the Space it shows and drops framing on another Map', () => {
    const framed = { ...content, framing };
    const declared = spacePlugin.selection;
    expect(declared?.of(framed)).toEqual(viewOf(framed));
    expect(declared?.select(framed, viewOf(content))).toEqual(selectView(framed, viewOf(content)));
    expect(viewOf(framed)).toEqual({ spaceId: SPACE, map: MAP, graph: GRAPH, framing });
    expect(selectView(framed, { ...viewOf(framed), graph: OTHER_GRAPH })).toEqual({
      ...framed,
      graph: OTHER_GRAPH,
    });
    expect(
      selectView(framed, { spaceId: SPACE, map: OTHER_MAP, graph: OTHER_GRAPH, framing }),
    ).toEqual({ spaceId: SPACE, map: OTHER_MAP, graph: OTHER_GRAPH });
    // The Space it shows is chosen once, at creation: a view naming another is not taken.
    expect(selectView(content, { ...viewOf(content), spaceId: OTHER_MAP }).spaceId).toBe(SPACE);
  });
});

describe('the Space plugin’s view', () => {
  it('requests nothing while Closed, drawing its Title and glyph, and offers nothing with every capability absent', () => {
    renderPlugin(spacePluginView.View, { content, map: closed, title: 'Elsewhere' });
    expect(screen.getByTestId('plugin-title')).toHaveTextContent('Elsewhere');
    expect(screen.getByRole('img', { name: 'Space Resource' })).toBeInTheDocument();
    expect(screen.queryByTestId('embedded-map')).toBeNull();
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('embeds the Map it selects while Open, with no choice and no Claim where nothing is granted', () => {
    renderPlugin(spacePluginView.View, {
      content: { ...content, framing },
      map: open,
      title: 'Elsewhere',
    });
    const embedded = screen.getByTestId('embedded-map');
    expect(embedded).toHaveAttribute('data-space', SPACE);
    expect(embedded).toHaveAttribute('data-map', MAP);
    expect(embedded).toHaveAttribute('data-graph', GRAPH);
    expect(embedded).toHaveAttribute('data-claimed', 'false');
    expect(screen.getByTestId('plugin-title')).toHaveTextContent('Elsewhere');
    expect(screen.queryByRole('button', { name: /Choose another Map/u })).toBeNull();
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('writes a choice the embedding makes through its own content commit', async () => {
    const rendered = renderPlugin(spacePluginView.View, {
      content: { ...content, framing },
      map: open,
      title: 'Elsewhere',
      grants: { content: true },
    });
    fireEvent.click(screen.getByRole('button', { name: `Choose another Map than ${MAP}` }));
    expect(await screen.findByTestId('embedded-map')).toHaveAttribute('data-map', `${MAP}′`);
    // A different Map drops the framing, which was the old Map's.
    expect(rendered.commits.content).toEqual([{ spaceId: SPACE, map: `${MAP}′`, graph: GRAPH }]);
  });

  it('Opens and Closes through its Map content', async () => {
    const rendered = renderPlugin(spacePluginView.View, {
      content,
      map: closed,
      title: 'Elsewhere',
      grants: { map: true },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open Resource Elsewhere' }));
    await screen.findByTestId('embedded-map');
    fireEvent.click(screen.getByRole('button', { name: 'Close Resource Elsewhere' }));
    await screen.findByRole('img', { name: 'Space Resource' });
    expect(rendered.commits.map).toEqual([open, closed]);
  });

  it('takes a Claim on Edit and passes it to the embedding, releasing it on Done', async () => {
    const rendered = renderPlugin(spacePluginView.View, {
      content,
      map: open,
      title: 'Elsewhere',
      grants: { claim: true },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Resource Elsewhere' }));
    expect(await screen.findByTestId('embedded-map')).toHaveAttribute('data-claimed', 'true');
    expect(rendered.commits.claims).toEqual({ taken: 1, released: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Done Resource Elsewhere' }));
    await screen.findByRole('button', { name: 'Edit Resource Elsewhere' });
    expect(screen.getByTestId('embedded-map')).toHaveAttribute('data-claimed', 'false');
    expect(rendered.commits.claims).toEqual({ taken: 1, released: 1 });
  });

  it('releases its Claim when Closed during Edit, so nothing stays held behind a Closed face', async () => {
    const rendered = renderPlugin(spacePluginView.View, {
      content,
      map: open,
      title: 'Elsewhere',
      grants: { claim: true, map: true },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Resource Elsewhere' }));
    expect(await screen.findByTestId('embedded-map')).toHaveAttribute('data-claimed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Close Resource Elsewhere' }));
    await screen.findByRole('img', { name: 'Space Resource' });
    expect(rendered.commits.claims).toEqual({ taken: 1, released: 1 });
    expect(rendered.commits.map).toEqual([closed]);
    // Opened again, it is out of Edit: the Claim went with the Close.
    fireEvent.click(screen.getByRole('button', { name: 'Open Resource Elsewhere' }));
    expect(await screen.findByRole('button', { name: 'Edit Resource Elsewhere' })).toBeVisible();
  });

  it('offers no Edit while Closed, and stays out of editing where the Claim is refused', () => {
    renderPlugin(spacePluginView.View, {
      content,
      map: closed,
      title: 'Elsewhere',
      grants: { claim: true },
    });
    expect(screen.queryByRole('button', { name: 'Edit Resource Elsewhere' })).toBeNull();
  });

  it('stays out of editing where the host refuses the Claim', async () => {
    renderPlugin(spacePluginView.View, {
      content,
      map: open,
      title: 'Elsewhere',
      grants: { claim: true },
      claimRefused: true,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Resource Elsewhere' }));
    expect(await screen.findByTestId('embedded-map')).toHaveAttribute('data-claimed', 'false');
    expect(screen.queryByRole('button', { name: 'Done Resource Elsewhere' })).toBeNull();
  });

  it('shows a refused Open as the host worded it, staying Closed', async () => {
    renderPlugin(spacePluginView.View, {
      content,
      map: closed,
      title: 'Elsewhere',
      grants: { map: true },
      answer: { refused: 'Not now.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open Resource Elsewhere' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Not now.');
    expect(screen.queryByTestId('embedded-map')).toBeNull();
  });
});
