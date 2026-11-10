import { z } from 'zod';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { EMPTY_ASSET, type AssetRef } from '@project/resource-api/domain';
import { renderPlugin } from '@project/resource-api/view/testing';
import {
  markdownPlugin,
  markdownText,
  type MarkdownContent,
  type MarkdownMapContent,
} from '@project/plugin-markdown/domain';
import { markdownPluginView, READING_WIDTH } from '@project/plugin-markdown/view';

const TEXT_REF: AssetRef = '/assets/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const SAVED_REF: AssetRef = '/assets/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBA';
const content: MarkdownContent = { url: TEXT_REF };
const open: MarkdownMapContent = { open: true };
const closed: MarkdownMapContent = { open: false };

const reading = (texts: Record<string, string>) => ({
  read: (ref: AssetRef) =>
    Promise.resolve(
      texts[ref] === undefined
        ? { refused: 'That text is not stored here.' }
        : new Blob([texts[ref]], { type: 'text/markdown' }),
    ),
});

const editable = { content: true, map: true, claim: true, store: true } as const;

describe('the Markdown plugin’s domain half', () => {
  it('is Closed where a Map stores nothing, Open where there is no Map, and starts as the empty asset', () => {
    expect(markdownPlugin.mapContent.default).toEqual(closed);
    expect(markdownPlugin.mapContent.withoutMap).toEqual(open);
    expect(markdownPlugin.newContent).toEqual({ url: EMPTY_ASSET });
    expect(markdownPlugin.mayBeTarget).toBe(true);
  });

  it('keeps its text by URL alone, refusing a source, a path or a media type', () => {
    expect(markdownPlugin.content.parse(content)).toEqual(content);
    expect(markdownPlugin.content.safeParse({ source: '# x' }).success).toBe(false);
    expect(
      markdownPlugin.content.safeParse({ path: 'a.md', mediaType: 'text/markdown' }).success,
    ).toBe(false);
    expect(markdownPlugin.content.safeParse({ url: TEXT_REF, source: '' }).success).toBe(false);
    expect(markdownPlugin.content.safeParse({ url: 'https://example.com/a.md' }).success).toBe(
      false,
    );
    expect(markdownPlugin.mapContent.schema.safeParse({ shape: 'pill' }).success).toBe(false);
  });

  it('stores text with `\\n` line endings', () => {
    expect(markdownText('a\r\nb\rc\n')).toBe('a\nb\nc\n');
  });
});

describe('the Markdown plugin’s view', () => {
  it('draws its Title and nothing else when Closed, offering nothing with every capability absent', async () => {
    const rendered = renderPlugin(markdownPluginView.View, {
      content,
      map: closed,
      title: 'Notes',
      assets: reading({ [TEXT_REF]: 'Hidden text' }),
    });
    expect(screen.getByTestId('plugin-title')).toHaveTextContent('Notes');
    await Promise.resolve();
    expect(screen.queryByTestId('rendered-markdown')).toBeNull();
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(rendered.commits.map).toEqual([]);
  });

  it('draws its text in full when Open with no commit, as on the Stage', async () => {
    renderPlugin(markdownPluginView.View, {
      content,
      map: open,
      title: 'Notes',
      assets: reading({ [TEXT_REF]: '# Notes\n\nThe whole text.' }),
    });
    expect(await screen.findByTestId('rendered-markdown')).toHaveTextContent('The whole text.');
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('draws a note and offers no Edit when its text cannot be read', async () => {
    renderPlugin(markdownPluginView.View, {
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
    const rendered = renderPlugin(markdownPluginView.View, {
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
    const rendered = renderPlugin(markdownPluginView.View, {
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
          expect(bytes.type).toBe('text/markdown');
          return SAVED_REF;
        },
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Resource Notes' }));
    expect(rendered.commits.claims.taken).toBe(1);
    const editor = screen.getByRole('textbox', { name: 'Markdown source of Notes' });
    expect(editor).toHaveValue('Old');
    fireEvent.change(editor, { target: { value: 'New\r\nline' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Resource Notes' }));
    await screen.findByRole('button', { name: 'Edit Resource Notes' });
    expect(stored).toEqual(['New\nline']);
    expect(rendered.commits.content).toEqual([{ url: SAVED_REF }]);
    expect(rendered.commits.claims.released).toBe(1);
    expect(screen.getByTestId('rendered-markdown')).toHaveTextContent('New line');
  });

  it('keeps the draft up when the store is refused, and commits nothing', async () => {
    const rendered = renderPlugin(markdownPluginView.View, {
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
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('Draft');
    expect(rendered.commits.content).toEqual([]);
    expect(rendered.commits.claims.released).toBe(0);
  });

  it('keeps the draft up when the content commit is refused', async () => {
    const rendered = renderPlugin(markdownPluginView.View, {
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
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('Draft');
    expect(rendered.commits.content).toEqual([{ url: SAVED_REF }]);
  });

  it('Saves on Mod-Enter, and Cancel and Escape abandon the draft without committing', async () => {
    const rendered = renderPlugin(markdownPluginView.View, {
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
    renderPlugin(markdownPluginView.View, {
      content,
      map: open,
      title: 'Notes',
      selected: true,
      grants: editable,
      assets: { ...reading({ [TEXT_REF]: 'Old' }), store: () => Promise.resolve(SAVED_REF) },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Markdown source of Notes' }));
    expect(screen.getByRole('textbox')).toHaveValue('Old');
  });
  it('keeps the draft up and Save available again when the store rejects', async () => {
    let stores = 0;
    const rendered = renderPlugin(markdownPluginView.View, {
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
    expect(await screen.findByRole('status')).toHaveTextContent('The text could not be saved.');
    expect(screen.getByRole('textbox')).toHaveValue('Draft');
    expect(screen.getByRole('button', { name: 'Save Resource Notes' })).toBeEnabled();
    expect(rendered.commits.content).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Save Resource Notes' }));
    await screen.findByRole('button', { name: 'Edit Resource Notes' });
    expect(rendered.commits.content).toEqual([{ url: SAVED_REF }]);
  });

  it('draws a note, and still Opens, when reading its text rejects', async () => {
    const rendered = renderPlugin(markdownPluginView.View, {
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

  it('keeps editing what was typed while a Save was under way', async () => {
    let finish: (ref: AssetRef) => void = () => undefined;
    const rendered = renderPlugin(markdownPluginView.View, {
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
    renderPlugin(markdownPluginView.View, {
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
    expect(await screen.findByRole('status')).toHaveTextContent('Not stored.');
    expect(screen.getByRole('textbox')).toHaveValue('Draft');
  });

  it('offers Edit when Closed, which Opens it and then begins editing', async () => {
    const rendered = renderPlugin(markdownPluginView.View, {
      content,
      map: closed,
      title: 'Notes',
      grants: editable,
      assets: { ...reading({ [TEXT_REF]: 'Old' }), store: () => Promise.resolve(SAVED_REF) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Resource Notes' }));
    expect(await screen.findByRole('textbox', { name: 'Markdown source of Notes' })).toHaveValue(
      'Old',
    );
    expect(rendered.commits.map).toEqual([open]);
    expect(rendered.commits.hints).toHaveLength(1);
    expect(rendered.commits.claims.taken).toBe(1);
  });

  it('Opens but begins no edit from Closed when its text cannot be read', async () => {
    const rendered = renderPlugin(markdownPluginView.View, {
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
  });
  it('keeps its draft and Claim while authoring is withdrawn, and Saves once it returns', async () => {
    const rendered = renderPlugin(markdownPluginView.View, {
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
    renderPlugin(markdownPluginView.View, {
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
    renderPlugin(markdownPluginView.View, {
      content,
      map: closed,
      title: 'Notes',
      grants: { map: true },
      assets: reading({ [TEXT_REF]: 'Text' }),
    });
    expect(screen.getByRole('img', { name: 'Markdown Resource' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Resource Notes' }));
    await screen.findByRole('button', { name: 'Close Resource Notes' });
    expect(screen.queryByRole('img', { name: 'Markdown Resource' })).toBeNull();
  });
});
