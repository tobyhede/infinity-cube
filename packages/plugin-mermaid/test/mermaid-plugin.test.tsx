import { z } from 'zod';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { EMPTY_ASSET, lineFeedText, type AssetRef } from '@project/resource-api/domain';
import { renderPlugin } from '@project/resource-api/view/testing';
import {
  mermaidPlugin,
  type MermaidContent,
  type MermaidMapContent,
} from '@project/plugin-mermaid/domain';
import {
  mermaidPluginView as builtView,
  mermaidPluginViewWith,
  type DiagramTheme,
  type RenderDiagram,
} from '@project/plugin-mermaid/view';
import { MERMAID_SETTINGS, loadOnce, settingsIn } from '../src/mermaid';

const TEXT_REF: AssetRef = '/assets/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const SAVED_REF: AssetRef = '/assets/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBA';
const UNREAD_REF: AssetRef = '/assets/CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCA';
const content: MermaidContent = { url: TEXT_REF };
const open: MermaidMapContent = { open: true };
const closed: MermaidMapContent = { open: false };

/**
 * What draws a diagram under jsdom, which has no layout for Mermaid: its source
 * as the text of an SVG declaring its size as Mermaid's does, and a source that
 * begins `bad` refused as Mermaid refuses one it cannot parse.
 */
const drawn: string[] = [];
/** The size the stand-in's SVG declares. */
const DRAWN = { width: 1232, height: 616 };
const themes: DiagramTheme[] = [];
const containers: HTMLElement[] = [];
const drawText: RenderDiagram = (id, source, theme, container) => {
  drawn.push(source);
  themes.push(theme);
  containers.push(container);
  if (source.startsWith('bad')) {
    return Promise.reject(new Error('Parse error on line 1: expecting a diagram type.'));
  }
  const text = source.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
  return Promise.resolve(
    `<svg id="${id}" width="100%" style="max-width: ${DRAWN.width}px;" viewBox="0 0 ${DRAWN.width} ${DRAWN.height}" role="img"><text>${text}</text></svg>`,
  );
};
const mermaidPluginView = mermaidPluginViewWith(drawText);

beforeEach(() => {
  drawn.length = 0;
  themes.length = 0;
  containers.length = 0;
});

/**
 * A theme set on the document root, as the canvas sets its own. jsdom does not
 * inherit `color-scheme`, so the rule names every element under the root.
 */
const scheme = document.createElement('style');
scheme.textContent =
  ":root[data-scheme='dark'], :root[data-scheme='dark'] * { color-scheme: dark; }";
document.head.append(scheme);

afterEach(() => {
  delete document.documentElement.dataset['scheme'];
});

const reading = (texts: Record<string, string>) => ({
  read: (ref: AssetRef) =>
    Promise.resolve(
      texts[ref] === undefined
        ? { refused: 'That text is not stored here.' }
        : new Blob([texts[ref]], { type: 'text/vnd.mermaid' }),
    ),
});

/** An Edit size the Map stores, so an edit begins at once, measuring nothing (ADR 0178). */
const STORED_EDIT_SIZE = { width: 640, height: 360 };
const editable = { content: true, map: true, claim: true, store: true } as const;

describe('the Mermaid plugin’s domain half', () => {
  it('is the `mermaid` kind, created empty from the Command Dock, drawn by Mermaid in the build', () => {
    expect(mermaidPlugin.kind).toBe('mermaid');
    expect(builtView.kind).toBe('mermaid');
    expect(builtView.creates?.map(({ from }) => from)).toEqual(['dock']);
  });

  it('is Closed where a Map stores nothing, Open where there is no Map, and starts as the empty asset', () => {
    expect(mermaidPlugin.mapContent.default).toEqual(closed);
    expect(mermaidPlugin.mapContent.withoutMap).toEqual(open);
    expect(mermaidPlugin.newContent).toEqual({ url: EMPTY_ASSET });
    expect(mermaidPlugin.mayBeTarget).toBe(true);
  });

  it('keeps its text by URL alone, refusing a source, a path or a media type', () => {
    expect(mermaidPlugin.content.parse(content)).toEqual(content);
    expect(mermaidPlugin.content.safeParse({ source: '# x' }).success).toBe(false);
    expect(
      mermaidPlugin.content.safeParse({ path: 'a.md', mediaType: 'text/vnd.mermaid' }).success,
    ).toBe(false);
    expect(mermaidPlugin.content.safeParse({ url: TEXT_REF, source: '' }).success).toBe(false);
    expect(mermaidPlugin.content.safeParse({ url: 'https://example.com/a.md' }).success).toBe(
      false,
    );
    expect(mermaidPlugin.mapContent.schema.safeParse({ shape: 'pill' }).success).toBe(false);
  });

  it('stores text with `\\n` line endings', () => {
    expect(lineFeedText('a\r\nb\rc\n')).toBe('a\nb\nc\n');
  });
});

describe('the Mermaid plugin’s view', () => {
  it('draws its Title and nothing else when Closed, offering nothing with every capability absent', async () => {
    const rendered = renderPlugin(mermaidPluginView.View, {
      content,
      map: closed,
      title: 'Notes',
      assets: reading({ [TEXT_REF]: 'Hidden text' }),
    });
    expect(screen.getByTestId('plugin-title')).toHaveTextContent('Notes');
    await Promise.resolve();
    expect(screen.queryByTestId('mermaid-diagram')).toBeNull();
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(rendered.commits.map).toEqual([]);
  });

  it('draws its diagram when Open with no commit, as on the Stage', async () => {
    renderPlugin(mermaidPluginView.View, {
      content,
      map: open,
      title: 'Notes',
      assets: reading({ [TEXT_REF]: 'graph TD\n  A --> B' }),
    });
    const diagram = await screen.findByTestId('mermaid-diagram');
    expect(diagram.querySelector('svg')).toHaveTextContent('graph TD A --> B');
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('draws nothing while Closed, and its diagram once per source when Open', async () => {
    const rendered = renderPlugin(mermaidPluginView.View, {
      content,
      map: closed,
      title: 'Notes',
      grants: editable,
      assets: reading({ [TEXT_REF]: 'graph TD\n  A --> B' }),
    });
    await Promise.resolve();
    expect(drawn).toEqual([]);
    act(() => rendered.changeMap(open));
    await screen.findByTestId('mermaid-diagram');
    fireEvent.click(screen.getByRole('button', { name: 'Edit Resource Notes' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Mermaid source of Notes' }), {
      target: { value: 'graph LR\n  A --> C' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Resource Notes' }));
    await waitFor(() =>
      expect(screen.getByTestId('mermaid-diagram')).toHaveTextContent('graph LR A --> C'),
    );
    expect(drawn).toEqual(['graph TD\n  A --> B', 'graph LR\n  A --> C']);
  });

  it('says why a source cannot be drawn, in Mermaid’s words, and still offers Edit', async () => {
    renderPlugin(mermaidPluginView.View, {
      content,
      map: open,
      title: 'Notes',
      grants: editable,
      assets: reading({ [TEXT_REF]: 'bad diagram' }),
    });
    expect(await screen.findByRole('note')).toHaveTextContent(
      'This diagram cannot be drawn. Parse error on line 1: expecting a diagram type.',
    );
    expect(screen.queryByTestId('mermaid-diagram')).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit Resource Notes' })).toBeEnabled();
  });

  it.each([open, closed])(
    'suggests the source editor’s dimensions once per edit without a stored Edit size, Map content %j',
    async (mapContent) => {
      const width = vi
        .spyOn(HTMLTextAreaElement.prototype, 'offsetWidth', 'get')
        .mockReturnValue(431);
      const height = vi
        .spyOn(HTMLTextAreaElement.prototype, 'offsetHeight', 'get')
        .mockReturnValue(187);
      try {
        const pendingDiagram = mermaidPluginViewWith(() => new Promise<string>(() => undefined));
        const rendered = renderPlugin(pendingDiagram.View, {
          content,
          map: mapContent,
          title: 'Notes',
          grants: editable,
          assets: reading({ [TEXT_REF]: 'Old' }),
        });
        fireEvent.click(await screen.findByRole('button', { name: 'Edit Resource Notes' }));
        const editor = await screen.findByRole('textbox');
        expect(width.mock.contexts).toEqual([editor]);
        expect(height.mock.contexts).toEqual([editor]);
        fireEvent.change(editor, { target: { value: 'A different draft' } });
        expect(screen.getByRole('textbox')).toBe(editor);
        expect(rendered.commits.claims.editors).toEqual([
          { suggestedSize: { width: 431, height: 187 } },
        ]);
        fireEvent.keyDown(editor, { key: 'Escape' });
        width.mockReturnValue(515);
        fireEvent.click(await screen.findByRole('button', { name: 'Edit Resource Notes' }));
        expect(rendered.commits.claims.editors[1]).toEqual({
          suggestedSize: { width: 515, height: 187 },
        });
        expect(rendered.commits.map).toEqual([]);
        if (!mapContent.open) expect(drawn).toEqual([]);
      } finally {
        width.mockRestore();
        height.mockRestore();
      }
    },
  );

  it('says a failure Mermaid gives no words for in its own', async () => {
    const silent = mermaidPluginViewWith(() => Promise.reject(new Error(' ')));
    renderPlugin(silent.View, {
      content,
      map: open,
      title: 'Notes',
      assets: reading({ [TEXT_REF]: 'graph TD' }),
    });
    expect(await screen.findByRole('note')).toHaveTextContent(
      'This diagram cannot be drawn. Mermaid could not draw it.',
    );
  });

  it('draws an empty source as an empty diagram to edit, asking Mermaid for nothing', async () => {
    renderPlugin(mermaidPluginView.View, {
      content: { url: EMPTY_ASSET },
      map: open,
      title: 'Notes',
      grants: editable,
      assets: reading({ [EMPTY_ASSET]: '' }),
    });
    expect(await screen.findByRole('note')).toHaveTextContent(
      'This diagram is empty. Edit it to write its Mermaid source.',
    );
    expect(drawn).toEqual([]);
    expect(screen.getByRole('button', { name: 'Edit Resource Notes' })).toBeEnabled();
  });

  it('draws its diagram in the canvas’s colour scheme, again when that changes', async () => {
    document.documentElement.dataset['scheme'] = 'dark';
    renderPlugin(mermaidPluginView.View, {
      content,
      map: open,
      title: 'Notes',
      assets: reading({ [TEXT_REF]: 'graph TD' }),
    });
    await screen.findByTestId('mermaid-diagram');
    expect(themes).toEqual(['dark']);
    act(() => {
      delete document.documentElement.dataset['scheme'];
    });
    await waitFor(() => expect(themes).toEqual(['dark', 'light']));
    expect(drawn).toEqual(['graph TD', 'graph TD']);
  });

  it('lays its diagram out in an unseen element of its own, never the document body', async () => {
    renderPlugin(mermaidPluginView.View, {
      content,
      map: open,
      title: 'Notes',
      assets: reading({ [TEXT_REF]: 'graph TD' }),
    });
    const diagram = await screen.findByTestId('mermaid-diagram');
    const [container] = containers;
    expect(container).toBeDefined();
    expect(container).not.toBe(document.body);
    expect(container?.getAttribute('aria-hidden')).toBe('true');
    expect(diagram.closest('[data-open]')?.contains(container ?? null)).toBe(true);
  });

  it('draws again neither on Cancel nor on a Save that changes nothing', async () => {
    renderPlugin(mermaidPluginView.View, {
      content,
      map: open,
      title: 'Notes',
      grants: editable,
      assets: reading({ [TEXT_REF]: 'graph TD' }),
    });
    await screen.findByTestId('mermaid-diagram');
    fireEvent.click(screen.getByRole('button', { name: 'Edit Resource Notes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel editing Resource Notes' }));
    await screen.findByTestId('mermaid-diagram');
    fireEvent.click(screen.getByRole('button', { name: 'Edit Resource Notes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Resource Notes' }));
    await screen.findByTestId('mermaid-diagram');
    await Promise.resolve();
    expect(drawn).toEqual(['graph TD']);
  });

  it('draws again on the next Open after a draw fails, as after a failed fetch', async () => {
    let calls = 0;
    const flaky = mermaidPluginViewWith((id, source, theme, container) => {
      calls += 1;
      return calls === 1
        ? Promise.reject(new Error('Failed to fetch dynamically imported module'))
        : drawText(id, source, theme, container);
    });
    renderPlugin(flaky.View, {
      content,
      map: open,
      title: 'Notes',
      grants: editable,
      assets: reading({ [TEXT_REF]: 'graph TD' }),
    });
    expect(await screen.findByRole('note')).toHaveTextContent('Failed to fetch');
    fireEvent.click(screen.getByRole('button', { name: 'Close Resource Notes' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open Resource Notes' }));
    await screen.findByTestId('mermaid-diagram');
    expect(calls).toBe(2);
  });

  it('draws nothing while Closed, even when the colour scheme changes', async () => {
    renderPlugin(mermaidPluginView.View, {
      content,
      map: open,
      title: 'Notes',
      grants: editable,
      assets: reading({ [TEXT_REF]: 'graph TD' }),
    });
    await screen.findByTestId('mermaid-diagram');
    fireEvent.click(screen.getByRole('button', { name: 'Close Resource Notes' }));
    await screen.findByRole('button', { name: 'Open Resource Notes' });
    await act(async () => {
      document.documentElement.dataset['scheme'] = 'dark';
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(themes).toEqual(['light']);
    await act(async () => {
      delete document.documentElement.dataset['scheme'];
      await Promise.resolve();
    });
  });

  it('keeps the lines of Mermaid’s message as Mermaid wrote them', async () => {
    const lined = mermaidPluginViewWith(() =>
      Promise.reject(
        new Error('Parse error on line 2:\ngraph TD A--\n-----------^\nExpecting NODE'),
      ),
    );
    renderPlugin(lined.View, {
      content,
      map: open,
      title: 'Notes',
      assets: reading({ [TEXT_REF]: 'graph TD A--' }),
    });
    expect(await screen.findByRole('note')).toHaveStyle({ whiteSpace: 'pre-wrap' });
  });

  it('draws a blank source as an empty diagram, asking Mermaid for nothing', async () => {
    renderPlugin(mermaidPluginView.View, {
      content,
      map: open,
      title: 'Notes',
      grants: editable,
      assets: reading({ [TEXT_REF]: '  \n\t\n' }),
    });
    expect(await screen.findByRole('note')).toHaveTextContent(
      'This diagram is empty. Edit it to write its Mermaid source.',
    );
    expect(drawn).toEqual([]);
  });

  it('names no Edit in the empty note where Edit is not offered, as on the Stage', async () => {
    renderPlugin(mermaidPluginView.View, {
      content: { url: EMPTY_ASSET },
      map: open,
      title: 'Notes',
      assets: reading({ [EMPTY_ASSET]: '' }),
    });
    expect(await screen.findByRole('note')).toHaveTextContent(/^This diagram is empty\.$/u);
  });

  it('draws a note and offers no Edit when its text cannot be read', async () => {
    renderPlugin(mermaidPluginView.View, {
      content,
      map: open,
      title: 'Notes',
      grants: editable,
      assets: reading({}),
    });
    expect(await screen.findByRole('note')).toHaveTextContent('That text is not stored here.');
    expect(screen.queryByRole('button', { name: 'Edit Resource Notes' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Close Resource Notes' })).toBeEnabled();
  });

  it('Opens with one Map content commit, before its source is read', async () => {
    const rendered = renderPlugin(mermaidPluginView.View, {
      content,
      map: closed,
      title: 'Notes',
      grants: { map: true },
      size: { width: 260, height: 146 },
      // A read that never answers: Opening waits for nothing (ADR 0178).
      assets: { read: () => new Promise<never>(() => undefined) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open Resource Notes' }));
    expect(rendered.commits.map).toEqual([open]);
    await screen.findByRole('button', { name: 'Close Resource Notes' });
    fireEvent.click(screen.getByRole('button', { name: 'Close Resource Notes' }));
    await screen.findByRole('button', { name: 'Open Resource Notes' });
    expect(rendered.commits.map).toEqual([open, closed]);
  });

  it('Saves by storing the text with `\\n` endings, then committing its URL, and releases its Claim', async () => {
    const stored: string[] = [];
    const rendered = renderPlugin(mermaidPluginView.View, {
      editSize: STORED_EDIT_SIZE,
      content,
      map: open,
      title: 'Notes',
      grants: editable,
      assets: {
        ...reading({ [TEXT_REF]: 'Old', [SAVED_REF]: 'New\nline' }),
        store: async (bytes) => {
          stored.push(
            await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(z.string().parse(reader.result));
              reader.readAsText(bytes);
            }),
          );
          expect(bytes.type).toBe('text/vnd.mermaid');
          return SAVED_REF;
        },
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Resource Notes' }));
    expect(rendered.commits.claims.taken).toBe(1);
    // A stored Edit size needs no suggestion.
    expect(rendered.commits.claims.editors).toEqual([{}]);
    const editor = screen.getByRole('textbox', { name: 'Mermaid source of Notes' });
    expect(editor).toHaveValue('Old');
    fireEvent.change(editor, { target: { value: 'New\r\nline' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Resource Notes' }));
    await screen.findByRole('button', { name: 'Edit Resource Notes' });
    expect(stored).toEqual(['New\nline']);
    expect(rendered.commits.content).toEqual([{ url: SAVED_REF }]);
    expect(rendered.commits.claims.released).toBe(1);
    expect(screen.getByTestId('mermaid-diagram')).toHaveTextContent('New line');
  });

  it('Saves nothing for an unchanged draft of a text stored with `\\r\\n` endings', async () => {
    const store = vi.fn(() => Promise.resolve(SAVED_REF));
    const rendered = renderPlugin(mermaidPluginView.View, {
      content,
      map: open,
      title: 'Notes',
      grants: editable,
      assets: { ...reading({ [TEXT_REF]: 'Old\r\nline' }), store },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Resource Notes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Resource Notes' }));
    await screen.findByRole('button', { name: 'Edit Resource Notes' });
    expect(store).not.toHaveBeenCalled();
    expect(rendered.commits.content).toEqual([]);
  });

  it('keeps the draft up when the store is refused, and commits nothing', async () => {
    const rendered = renderPlugin(mermaidPluginView.View, {
      content,
      map: open,
      title: 'Notes',
      grants: editable,
      assets: {
        ...reading({ [TEXT_REF]: 'Old' }),
        store: () => Promise.resolve({ refused: 'The text could not be stored.' }),
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Resource Notes' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Resource Notes' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('Draft');
    expect(rendered.commits.content).toEqual([]);
    expect(rendered.commits.claims.released).toBe(0);
  });

  it('keeps the draft up when the content commit is refused', async () => {
    const rendered = renderPlugin(mermaidPluginView.View, {
      content,
      map: open,
      title: 'Notes',
      grants: editable,
      answer: { refused: 'No.' },
      assets: { ...reading({ [TEXT_REF]: 'Old' }), store: () => Promise.resolve(SAVED_REF) },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Resource Notes' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Draft' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', ctrlKey: true });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('Draft');
    expect(rendered.commits.content).toEqual([{ url: SAVED_REF }]);
  });

  it('Saves on Mod-Enter, and Cancel and Escape abandon the draft without committing', async () => {
    const rendered = renderPlugin(mermaidPluginView.View, {
      editSize: STORED_EDIT_SIZE,
      content,
      map: open,
      title: 'Notes',
      grants: editable,
      assets: { ...reading({ [TEXT_REF]: 'Old' }), store: () => Promise.resolve(SAVED_REF) },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Resource Notes' }));
    expect(screen.getByRole('button', { name: 'Close Resource Notes' })).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Draft' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Resource Notes' }));
    expect(screen.getByRole('textbox')).toHaveValue('Old');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel editing Resource Notes' }));
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(rendered.commits.content).toEqual([]);
    expect(rendered.commits.claims).toEqual({ taken: 2, released: 2, editors: [{}, {}] });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Resource Notes' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Saved' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', metaKey: true });
    await waitFor(() => expect(rendered.commits.content).toEqual([{ url: SAVED_REF }]));
  });

  it('begins an edit from a press on its selected body', async () => {
    renderPlugin(mermaidPluginView.View, {
      content,
      map: open,
      title: 'Notes',
      selected: true,
      grants: editable,
      assets: { ...reading({ [TEXT_REF]: 'Old' }), store: () => Promise.resolve(SAVED_REF) },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Mermaid source of Notes' }));
    expect(screen.getByRole('textbox')).toHaveValue('Old');
  });
  it('keeps the draft up and Save available again when the store rejects', async () => {
    let stores = 0;
    const rendered = renderPlugin(mermaidPluginView.View, {
      content,
      map: open,
      title: 'Notes',
      grants: editable,
      assets: {
        ...reading({ [TEXT_REF]: 'Old' }),
        store: () => {
          stores += 1;
          return stores === 1 ? Promise.reject(new Error('502')) : Promise.resolve(SAVED_REF);
        },
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Resource Notes' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Resource Notes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The source could not be saved.');
    expect(screen.getByRole('textbox')).toHaveValue('Draft');
    expect(screen.getByRole('button', { name: 'Save Resource Notes' })).toBeEnabled();
    expect(rendered.commits.content).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Save Resource Notes' }));
    await screen.findByRole('button', { name: 'Edit Resource Notes' });
    expect(rendered.commits.content).toEqual([{ url: SAVED_REF }]);
  });

  it('draws a note, and still Opens, when reading its text rejects', async () => {
    const rendered = renderPlugin(mermaidPluginView.View, {
      content,
      map: closed,
      title: 'Notes',
      grants: { map: true },
      assets: { read: () => Promise.reject(new Error('timeout')) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open Resource Notes' }));
    expect(await screen.findByRole('note')).toHaveTextContent('This source cannot be read.');
    expect(rendered.commits.map).toEqual([open]);
  });

  it('reads its text again on a later Open after an earlier read failed', async () => {
    let readable = false;
    const rendered = renderPlugin(mermaidPluginView.View, {
      content,
      map: closed,
      title: 'Notes',
      grants: { map: true },
      assets: {
        read: () =>
          readable
            ? Promise.resolve(new Blob(['Text'], { type: 'text/vnd.mermaid' }))
            : Promise.reject(new Error('timeout')),
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open Resource Notes' }));
    expect(await screen.findByRole('note')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close Resource Notes' }));
    await screen.findByRole('button', { name: 'Open Resource Notes' });
    readable = true;
    fireEvent.click(screen.getByRole('button', { name: 'Open Resource Notes' }));
    expect(await screen.findByTestId('mermaid-diagram')).toHaveTextContent('Text');
    expect(rendered.commits.map).toEqual([open, closed, open]);
  });

  it('begins an Edit from Closed, after an earlier read failed, once its text reads', async () => {
    let readable = false;
    const rendered = renderPlugin(mermaidPluginView.View, {
      content,
      map: closed,
      title: 'Notes',
      grants: editable,
      assets: {
        read: () =>
          readable
            ? Promise.resolve(new Blob(['Text'], { type: 'text/vnd.mermaid' }))
            : Promise.reject(new Error('timeout')),
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open Resource Notes' }));
    expect(await screen.findByRole('note')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close Resource Notes' }));
    await screen.findByRole('button', { name: 'Open Resource Notes' });
    readable = true;
    fireEvent.click(screen.getByRole('button', { name: 'Edit Resource Notes' }));
    expect(await screen.findByRole('textbox')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(rendered.commits.map).toEqual([open, closed]);
  });

  it('keeps editing what was typed while a Save was under way', async () => {
    let finish: (ref: AssetRef) => void = () => undefined;
    const rendered = renderPlugin(mermaidPluginView.View, {
      content,
      map: open,
      title: 'Notes',
      grants: editable,
      assets: {
        ...reading({ [TEXT_REF]: 'Old' }),
        store: () =>
          new Promise<AssetRef>((resolve) => {
            finish = resolve;
          }),
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Resource Notes' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'First' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Resource Notes' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'First and more' } });
    finish(SAVED_REF);
    await waitFor(() => expect(rendered.commits.content).toEqual([{ url: SAVED_REF }]));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save Resource Notes' })).toBeEnabled(),
    );
    expect(screen.getByRole('textbox')).toHaveValue('First and more');
    expect(rendered.commits.claims.released).toBe(0);
  });

  it('ignores Escape while a Save is under way, so a refused Save keeps its draft', async () => {
    let finish: (answer: { readonly refused: string }) => void = () => undefined;
    renderPlugin(mermaidPluginView.View, {
      content,
      map: open,
      title: 'Notes',
      grants: editable,
      assets: {
        ...reading({ [TEXT_REF]: 'Old' }),
        store: () =>
          new Promise<{ readonly refused: string }>((resolve) => {
            finish = resolve;
          }),
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Resource Notes' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Resource Notes' }));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(screen.getByRole('textbox')).toHaveValue('Draft');
    finish({ refused: 'Not stored.' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Not stored.');
    expect(screen.getByRole('textbox')).toHaveValue('Draft');
  });

  it('begins an edit from Closed with no Open, and every exit leaves it Closed (ADR 0178)', async () => {
    const rendered = renderPlugin(mermaidPluginView.View, {
      editSize: STORED_EDIT_SIZE,
      content,
      map: closed,
      title: 'Notes',
      grants: editable,
      assets: { ...reading({ [TEXT_REF]: 'Old' }), store: () => Promise.resolve(SAVED_REF) },
    });
    const view = () => document.querySelector('[data-open]');
    const source = () => screen.queryByRole('textbox', { name: 'Mermaid source of Notes' });
    const edit = async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Edit Resource Notes' }));
      expect(await screen.findByRole('textbox', { name: 'Mermaid source of Notes' })).toHaveValue(
        'Old',
      );
      // Still Closed: the Open control keeps its place, unavailable.
      expect(view()).toHaveAttribute('data-open', 'false');
      expect(screen.getByRole('button', { name: 'Open Resource Notes' })).toBeDisabled();
    };

    await edit();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel editing Resource Notes' }));
    expect(source()).toBeNull();
    expect(view()).toHaveAttribute('data-open', 'false');
    expect(screen.getByRole('img', { name: mermaidPlugin.name })).toBeInTheDocument();
    // Closed again, no diagram is drawn.
    expect(screen.queryByTestId('mermaid-diagram')).toBeNull();

    await edit();
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(source()).toBeNull();
    expect(view()).toHaveAttribute('data-open', 'false');

    await edit();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'New' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Resource Notes' }));
    await waitFor(() => expect(source()).toBeNull());
    expect(view()).toHaveAttribute('data-open', 'false');
    expect(rendered.commits.content).toEqual([{ url: SAVED_REF }]);

    // No exit and no beginning committed Open or Close.
    expect(rendered.commits.map).toEqual([]);
    expect(rendered.commits.claims.taken).toBe(3);
    expect(rendered.commits.claims.released).toBe(3);
  });

  it('begins no edit from Closed, and commits nothing, when its source cannot be read', async () => {
    const rendered = renderPlugin(mermaidPluginView.View, {
      editSize: STORED_EDIT_SIZE,
      content,
      map: closed,
      title: 'Notes',
      grants: editable,
      assets: reading({}),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Resource Notes' }));
    // The Edit pressed is answered, not dropped.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This source cannot be read, so it cannot be edited.',
    );
    expect(rendered.commits.map).toEqual([]);
    expect(rendered.commits.claims.taken).toBe(0);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(document.querySelector('[data-open]')).toHaveAttribute('data-open', 'false');
  });

  it('Saves from Closed on Mod-Enter, leaving it Closed', async () => {
    const rendered = renderPlugin(mermaidPluginView.View, {
      editSize: STORED_EDIT_SIZE,
      content,
      map: closed,
      title: 'Notes',
      grants: editable,
      assets: { ...reading({ [TEXT_REF]: 'Old' }), store: () => Promise.resolve(SAVED_REF) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Resource Notes' }));
    const source = await screen.findByRole('textbox', { name: 'Mermaid source of Notes' });
    fireEvent.change(source, { target: { value: 'New' } });
    fireEvent.keyDown(source, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
    expect(rendered.commits.content).toEqual([{ url: SAVED_REF }]);
    expect(rendered.commits.map).toEqual([]);
    expect(document.querySelector('[data-open]')).toHaveAttribute('data-open', 'false');
    expect(rendered.commits.claims.released).toBe(1);
  });

  it('reads nothing more for an edit from Closed once its Save lands', async () => {
    const reads: AssetRef[] = [];
    const texts = reading({ [TEXT_REF]: 'Old' });
    const rendered = renderPlugin(mermaidPluginView.View, {
      editSize: STORED_EDIT_SIZE,
      content,
      map: closed,
      title: 'Notes',
      grants: editable,
      assets: {
        read: (ref: AssetRef) => {
          reads.push(ref);
          return texts.read(ref);
        },
        store: () => Promise.resolve(SAVED_REF),
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Resource Notes' }));
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'New' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Resource Notes' }));
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
    // Closed again, a source changed elsewhere is not read.
    act(() => rendered.changeContent({ url: UNREAD_REF }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(reads).toEqual([TEXT_REF]);
    // Nor is a diagram drawn for it, seen or unseen.
    expect(drawn).toEqual([]);
  });

  it('finishes one Closed edit read using the Edit size supplied while it was pending', async () => {
    const pending = Promise.withResolvers<Blob>();
    const read = vi.fn(() => pending.promise);
    let sizeStored = false;
    const rendered = renderPlugin<MermaidContent, MermaidMapContent>(
      ({ surface }) => (
        <mermaidPluginView.View
          surface={{ ...surface, editSize: sizeStored ? STORED_EDIT_SIZE : undefined }}
        />
      ),
      { content, map: closed, title: 'Notes', grants: editable, assets: { read } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit Resource Notes' }));
    sizeStored = true;
    rendered.changeMap({ ...closed });
    expect(read).toHaveBeenCalledTimes(1);

    pending.resolve(new Blob(['Requested source']));
    expect(await screen.findByRole('textbox')).toHaveValue('Requested source');
    expect(rendered.commits.claims.editors).toEqual([{}]);
  });

  it('drops a pending Closed edit when authoring is withdrawn and later granted again', async () => {
    const pending = Promise.withResolvers<Blob>();
    const read = vi.fn(() => pending.promise);
    const rendered = renderPlugin(mermaidPluginView.View, {
      content,
      map: closed,
      title: 'Notes',
      grants: editable,
      assets: { read },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Resource Notes' }));
    expect(read).toHaveBeenCalledTimes(1);
    rendered.withdraw(true);
    rendered.withdraw(false);
    await act(async () => {
      pending.resolve(new Blob(['Requested source']));
      await pending.promise;
    });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(rendered.commits.claims.taken).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Resource Notes' }));
    expect(await screen.findByRole('textbox')).toHaveValue('Requested source');
    expect(rendered.commits.claims.taken).toBe(1);
  });

  it('discards a Closed edit request when the Resource changes source during its read', async () => {
    const pending = Promise.withResolvers<Blob>();
    const read = vi.fn((url: AssetRef) =>
      url === TEXT_REF ? pending.promise : Promise.resolve(new Blob(['New source'])),
    );
    const rendered = renderPlugin(mermaidPluginView.View, {
      content,
      map: closed,
      editSize: STORED_EDIT_SIZE,
      title: 'Notes',
      grants: editable,
      assets: { read },
    });
    const edit = screen.getByRole('button', { name: 'Edit Resource Notes' });
    fireEvent.click(edit);
    expect(read).toHaveBeenCalledWith(TEXT_REF);
    act(() => rendered.changeContent({ url: UNREAD_REF }));
    await act(async () => {
      pending.resolve(new Blob(['Stale source']));
      await pending.promise;
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(rendered.commits.claims.taken).toBe(0);
    expect(screen.queryByRole('textbox')).toBeNull();

    fireEvent.click(edit);
    expect(await screen.findByRole('textbox')).toHaveValue('New source');
    expect(rendered.commits.claims.taken).toBe(1);
  });

  it('ends an Edit from Closed whose Claim is refused as it begins, so a later Edit begins', async () => {
    for (const sized of [{ editSize: STORED_EDIT_SIZE }, {}]) {
      let refusing = true;
      let asked = 0;
      const rendered = renderPlugin(mermaidPluginView.View, {
        ...sized,
        content,
        map: closed,
        title: 'Notes',
        grants: editable,
        get claimRefused() {
          asked += 1;
          return refusing;
        },
        assets: reading({ [TEXT_REF]: 'graph TD' }),
      });
      fireEvent.click(screen.getByRole('button', { name: 'Edit Resource Notes' }));
      await waitFor(() => expect(asked).toBe(1));
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Another change is still being made. Try again when it ends.',
      );
      expect(screen.queryByRole('textbox')).toBeNull();
      expect(document.querySelector('[data-open]')).toHaveAttribute('data-open', 'false');
      expect(screen.getByRole('button', { name: 'Open Resource Notes' })).toBeEnabled();
      refusing = false;
      fireEvent.click(screen.getByRole('button', { name: 'Edit Resource Notes' }));
      expect(await screen.findByRole('textbox', { name: 'Mermaid source of Notes' })).toHaveValue(
        'graph TD',
      );
      expect(screen.queryByRole('alert')).toBeNull();
      expect(rendered.commits.claims.taken).toBe(1);
      expect(rendered.commits.map).toEqual([]);
      rendered.unmount();
    }
  });

  it('keeps editing when a Close from elsewhere arrives mid-edit (ADR 0178)', async () => {
    const rendered = renderPlugin(mermaidPluginView.View, {
      editSize: STORED_EDIT_SIZE,
      content,
      map: open,
      title: 'Notes',
      grants: editable,
      assets: { ...reading({ [TEXT_REF]: 'Old' }), store: () => Promise.resolve(SAVED_REF) },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Resource Notes' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Draft' } });
    act(() => rendered.changeMap(closed));
    // Editing is not stored, so a stored Close does not end it.
    expect(screen.getByRole('textbox', { name: 'Mermaid source of Notes' })).toHaveValue('Draft');
    expect(rendered.commits.claims.released).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Save Resource Notes' }));
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
    expect(rendered.commits.content).toEqual([{ url: SAVED_REF }]);
    expect(document.querySelector('[data-open]')).toHaveAttribute('data-open', 'false');
  });

  it('Saves a draft whose content changed meanwhile to text it cannot read', async () => {
    const rendered = renderPlugin(mermaidPluginView.View, {
      editSize: STORED_EDIT_SIZE,
      content,
      map: open,
      title: 'Notes',
      grants: editable,
      assets: { ...reading({ [TEXT_REF]: 'Old' }), store: () => Promise.resolve(SAVED_REF) },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Resource Notes' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Draft' } });
    rendered.changeContent({ url: UNREAD_REF });
    fireEvent.click(screen.getByRole('button', { name: 'Save Resource Notes' }));
    await screen.findByRole('button', { name: 'Edit Resource Notes' });
    expect(rendered.commits.content).toEqual([{ url: SAVED_REF }]);
    expect(rendered.commits.claims).toEqual({ taken: 1, released: 1, editors: [{}] });
  });

  it('keeps its draft and Claim while authoring is withdrawn, and Saves once it returns', async () => {
    const rendered = renderPlugin(mermaidPluginView.View, {
      editSize: STORED_EDIT_SIZE,
      content,
      map: open,
      title: 'Notes',
      grants: editable,
      assets: { ...reading({ [TEXT_REF]: 'Old' }), store: () => Promise.resolve(SAVED_REF) },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Resource Notes' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Draft' } });
    rendered.withdraw(true);
    expect(screen.getByRole('textbox')).toHaveValue('Draft');
    expect(screen.queryByRole('button', { name: 'Save Resource Notes' })).toBeNull();
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', ctrlKey: true });
    expect(screen.getByRole('textbox')).toHaveValue('Draft');
    expect(rendered.commits.claims.released).toBe(0);
    rendered.withdraw(false);
    fireEvent.click(screen.getByRole('button', { name: 'Save Resource Notes' }));
    await screen.findByRole('button', { name: 'Edit Resource Notes' });
    expect(rendered.commits.content).toEqual([{ url: SAVED_REF }]);
    expect(rendered.commits.claims).toEqual({ taken: 1, released: 1, editors: [{}] });
  });
  it('keeps focus on its Open command as it becomes Close, and back', async () => {
    renderPlugin(mermaidPluginView.View, {
      content,
      map: closed,
      title: 'Notes',
      grants: { map: true },
      assets: reading({ [TEXT_REF]: 'Text' }),
    });
    const open = screen.getByRole('button', { name: 'Open Resource Notes' });
    open.focus();
    fireEvent.click(open);
    const close = await screen.findByRole('button', { name: 'Close Resource Notes' });
    expect(close).toBe(open);
    expect(close).toHaveFocus();
  });

  it('draws its kind glyph, named for a screen reader, only while Closed', async () => {
    renderPlugin(mermaidPluginView.View, {
      content,
      map: closed,
      title: 'Notes',
      grants: { map: true },
      assets: reading({ [TEXT_REF]: 'Text' }),
    });
    expect(screen.getByRole('img', { name: 'Mermaid Resource' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Resource Notes' }));
    await screen.findByRole('button', { name: 'Close Resource Notes' });
    expect(screen.queryByRole('img', { name: 'Mermaid Resource' })).toBeNull();
  });
});

describe('the theme a diagram is drawn in', () => {
  it('sets Mermaid’s theme for the canvas’s colour scheme beside its other settings', () => {
    expect(settingsIn('light')).toEqual({ ...MERMAID_SETTINGS, theme: 'neutral' });
    expect(settingsIn('dark')).toEqual({ ...MERMAID_SETTINGS, theme: 'dark' });
  });
});

describe('Mermaid, fetched on first draw', () => {
  it('is set up at its `strict` security level, with its error drawing suppressed', () => {
    expect(MERMAID_SETTINGS).toEqual({
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
    });
  });

  it('is fetched once while that fetch holds, and again after one fails', async () => {
    let calls = 0;
    const load = loadOnce(() => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error('offline')) : Promise.resolve(calls);
    });
    await expect(load()).rejects.toThrow('offline');
    await expect(load()).resolves.toBe(2);
    await expect(load()).resolves.toBe(2);
    expect(calls).toBe(2);
  });
});
