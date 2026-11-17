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
  READING_WIDTH,
  type DiagramTheme,
  type RenderDiagram,
} from '@project/plugin-mermaid/view';
import { withTheme } from '../src/mermaid';

const TEXT_REF: AssetRef = '/assets/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const SAVED_REF: AssetRef = '/assets/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBA';
const UNREAD_REF: AssetRef = '/assets/CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCA';
const content: MermaidContent = { url: TEXT_REF };
const open: MermaidMapContent = { open: true };
const closed: MermaidMapContent = { open: false };

/**
 * What draws a diagram under jsdom, which has no layout for Mermaid: its source
 * as the text of an SVG, and a source that begins `bad` refused as Mermaid
 * refuses one it cannot parse.
 */
const drawn: string[] = [];
const themes: DiagramTheme[] = [];
const drawText: RenderDiagram = (id, source, theme) => {
  drawn.push(source);
  themes.push(theme);
  if (source.startsWith('bad')) {
    return Promise.reject(new Error('Parse error on line 1: expecting a diagram type.'));
  }
  const text = source.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
  return Promise.resolve(`<svg id="${id}" role="img"><text>${text}</text></svg>`);
};
const mermaidPluginView = mermaidPluginViewWith(drawText);

beforeEach(() => {
  drawn.length = 0;
  themes.length = 0;
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

  it('measures its Open size only once its diagram is drawn', async () => {
    let finish: (svg: string) => void = () => undefined;
    let asked = false;
    const later = mermaidPluginViewWith(
      () =>
        new Promise<string>((resolve) => {
          asked = true;
          finish = resolve;
        }),
    );
    const rendered = renderPlugin(later.View, {
      content,
      map: closed,
      title: 'Notes',
      grants: { map: true },
      assets: reading({ [TEXT_REF]: 'graph TD' }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open Resource Notes' }));
    // The diagram is being drawn, unseen, at the width the hint asks for.
    await waitFor(() => expect(asked).toBe(true));
    await Promise.resolve();
    expect(rendered.commits.map).toEqual([]);
    finish('<svg><text>drawn</text></svg>');
    await screen.findByRole('button', { name: 'Close Resource Notes' });
    expect(rendered.commits.map).toEqual([open]);
    expect(rendered.commits.hints[0]?.width).toBe(READING_WIDTH);
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

  it('Opens with one Map content commit carrying a size hint at least the reading width', async () => {
    const rendered = renderPlugin(mermaidPluginView.View, {
      content,
      map: closed,
      title: 'Notes',
      grants: { map: true },
      size: { width: 260, height: 146 },
      assets: reading({ [TEXT_REF]: 'Text' }),
    });
    await waitFor(() => expect(rendered.container.dataset).toBeDefined());
    // Wait for the text, so Open has something to measure.
    await Promise.resolve();
    await Promise.resolve();
    fireEvent.click(screen.getByRole('button', { name: 'Open Resource Notes' }));
    await screen.findByRole('button', { name: 'Close Resource Notes' });
    expect(rendered.commits.map).toEqual([open]);
    expect(rendered.commits.hints).toHaveLength(1);
    expect(rendered.commits.hints[0]?.width).toBe(READING_WIDTH);
    fireEvent.click(screen.getByRole('button', { name: 'Close Resource Notes' }));
    await screen.findByRole('button', { name: 'Open Resource Notes' });
    expect(rendered.commits.map).toEqual([open, closed]);
    expect(rendered.commits.hints[1]).toBeUndefined();
  });

  it('Saves by storing the text with `\\n` endings, then committing its URL, and releases its Claim', async () => {
    const stored: string[] = [];
    const rendered = renderPlugin(mermaidPluginView.View, {
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
    expect(rendered.commits.claims).toEqual({ taken: 2, released: 2 });
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
    expect(await screen.findByRole('alert')).toHaveTextContent('The text could not be saved.');
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
    expect(await screen.findByRole('note')).toHaveTextContent('This text cannot be read.');
    expect(rendered.commits.map).toEqual([open]);
  });

  it('reads its text again on a later Open, and hints at its size, after an earlier read failed', async () => {
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
    // The failed read had no size to hint at; the later one, read, does.
    expect(rendered.commits.hints[2]?.width).toBe(READING_WIDTH);
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
    expect(rendered.commits.hints[2]?.width).toBe(READING_WIDTH);
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

  it('offers Edit when Closed, which Opens it and then begins editing', async () => {
    const rendered = renderPlugin(mermaidPluginView.View, {
      content,
      map: closed,
      title: 'Notes',
      grants: editable,
      assets: { ...reading({ [TEXT_REF]: 'Old' }), store: () => Promise.resolve(SAVED_REF) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Resource Notes' }));
    expect(await screen.findByRole('textbox', { name: 'Mermaid source of Notes' })).toHaveValue(
      'Old',
    );
    expect(rendered.commits.map).toEqual([open]);
    expect(rendered.commits.hints).toHaveLength(1);
    expect(rendered.commits.claims.taken).toBe(1);
  });

  it('Opens but begins no edit from Closed when its text cannot be read', async () => {
    const rendered = renderPlugin(mermaidPluginView.View, {
      content,
      map: closed,
      title: 'Notes',
      grants: editable,
      assets: reading({}),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Resource Notes' }));
    expect(await screen.findByRole('note')).toBeInTheDocument();
    expect(rendered.commits.map).toEqual([open]);
    expect(rendered.commits.claims.taken).toBe(0);
    expect(screen.queryByRole('textbox')).toBeNull();
    // The Edit pressed is answered, not dropped.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This text cannot be read, so it cannot be edited.',
    );
  });

  it('Saves a draft whose content changed meanwhile to text it cannot read', async () => {
    const rendered = renderPlugin(mermaidPluginView.View, {
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
    expect(rendered.commits.claims).toEqual({ taken: 1, released: 1 });
  });

  it('hints the height of its Title and text drawn together at the width it hints', async () => {
    // jsdom lays nothing out: the measured box answers 100px for the text and
    // 50px more where the Title is drawn inside it, at the width it was given.
    const widths: string[] = [];
    const scrollHeight = vi
      .spyOn(HTMLElement.prototype, 'scrollHeight', 'get')
      .mockImplementation(function (this: HTMLElement) {
        widths.push(this.style.width);
        return 100 + (this.querySelector('[data-testid="plugin-title"]') === null ? 0 : 50);
      });
    try {
      const rendered = renderPlugin(mermaidPluginView.View, {
        content,
        map: closed,
        title: 'Notes',
        grants: { map: true },
        size: { width: 260, height: 146 },
        assets: reading({ [TEXT_REF]: 'Text' }),
      });
      fireEvent.click(screen.getByRole('button', { name: 'Open Resource Notes' }));
      await screen.findByRole('button', { name: 'Close Resource Notes' });
      // The Title's 50px and the text's 100px, measured together, and the inset twice.
      expect(rendered.commits.hints[0]).toEqual({
        width: READING_WIDTH,
        height: 50 + 100 + 2 * 12,
      });
      expect(widths).toContain(`${READING_WIDTH}px`);
    } finally {
      scrollHeight.mockRestore();
    }
  });

  it('keeps its draft and Claim while authoring is withdrawn, and Saves once it returns', async () => {
    const rendered = renderPlugin(mermaidPluginView.View, {
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
    expect(rendered.commits.claims).toEqual({ taken: 1, released: 1 });
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
  it('leads the source with an init directive choosing Mermaid’s theme', () => {
    expect(withTheme('graph TD', 'dark')).toBe('%%{init: {"theme": "dark"}}%%\ngraph TD');
    expect(withTheme('graph TD', 'light')).toBe('%%{init: {"theme": "neutral"}}%%\ngraph TD');
  });

  it('keeps frontmatter first, ended by a newline even where the source ends with it', () => {
    expect(withTheme('---\ntitle: A\n---\ngraph TD', 'dark')).toBe(
      '---\ntitle: A\n---\n%%{init: {"theme": "dark"}}%%\ngraph TD',
    );
    expect(withTheme('---\ntitle: A\n---', 'dark')).toBe(
      '---\ntitle: A\n---\n%%{init: {"theme": "dark"}}%%\n',
    );
  });
});
