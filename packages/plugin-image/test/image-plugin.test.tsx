import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderPlugin, testAssetRef, testAssetUrl } from '@project/resource-api/view/testing';
import {
  IMAGE_URL_UNSUPPORTED,
  imagePlugin,
  type ImageContent,
} from '@project/plugin-image/domain';
import { imagePluginView } from '@project/plugin-image/view';

const FIGURE: ImageContent = { url: 'https://example.com/figure.png' };

/** A 400×300 PNG's signature and IHDR chunk, which is all the plugin reads. */
const pngHeader = (): Uint8Array<ArrayBuffer> => {
  const header = new Uint8Array(24);
  header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
  header.set(new TextEncoder().encode('IHDR'), 12);
  new DataView(header.buffer).setUint32(16, 400);
  new DataView(header.buffer).setUint32(20, 300);
  return header;
};

/** A file as a browser hands it over: jsdom's `File` has no `arrayBuffer`, so it is given one. */
const file = (bytes: Uint8Array<ArrayBuffer>, name: string, type: string): File =>
  Object.assign(new File([bytes], name, { type }), {
    arrayBuffer: () => Promise.resolve(bytes.slice().buffer),
  });

const encoded = (text: string) => new TextEncoder().encode(text);
const pngFile = () => file(pngHeader(), 'harbour.png', 'image/png');
const textFile = () => file(encoded('hello'), 'notes.txt', 'text/plain');
const svgFile = () => file(encoded('<svg/>'), 'figure.svg', 'image/svg+xml');

/** Every capability Replace and Rename reach. */
const AUTHORING = { title: true, content: true, claim: true, store: true, pick: true } as const;

describe('the Image plugin’s domain half', () => {
  it('holds a web URL or a stored asset, and refuses any other', () => {
    expect(imagePlugin.content.parse(FIGURE)).toEqual(FIGURE);
    expect(imagePlugin.content.parse({ url: testAssetRef(1) })).toEqual({ url: testAssetRef(1) });
    for (const url of ['data:image/png;base64,AA==', 'figure.png', '/files/figure.png', '']) {
      expect(imagePlugin.content.safeParse({ url }).success).toBe(false);
    }
    expect(imagePlugin.content.safeParse({ url: FIGURE.url, open: true }).success).toBe(false);
  });

  it('names a URL it refuses by its own refusal code', () => {
    const parsed = imagePlugin.content.safeParse({ url: 'data:image/png;base64,AA==' });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues).toEqual([
      expect.objectContaining({ params: { code: IMAGE_URL_UNSUPPORTED } }),
    ]);
    expect(IMAGE_URL_UNSUPPORTED).toBe('image-url-unsupported');
  });

  it('keeps nothing per Map, is a Target, is drawn bare at rest with no Title, and never starts empty', () => {
    expect(imagePlugin.mapContent.default).toEqual({});
    expect(imagePlugin.mapContent.schema.safeParse({ open: true }).success).toBe(false);
    expect(imagePlugin.mayBeTarget).toBe(true);
    expect(imagePlugin.bareAtRest).toBe(true);
    expect(imagePlugin.drawsTitle).toBe(false);
    expect('outline' in imagePlugin).toBe(false);
    expect('newContent' in imagePlugin).toBe(false);
  });
});

describe('the Image plugin’s view', () => {
  it('is its picture, named by its Title, with no drawn Title and nothing offered when every capability is absent', () => {
    const rendered = renderPlugin(imagePluginView.View, {
      content: FIGURE,
      map: {},
      title: 'Figure\nThe harbour wall',
    });
    const picture = screen.getByRole('img', { name: 'Figure' });
    expect(picture).toHaveAttribute('src', FIGURE.url);
    expect(picture).toHaveStyle({ objectFit: 'contain', width: '100%', height: '100%' });
    expect(screen.queryByTestId('plugin-title')).toBeNull();
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(rendered.commits).toMatchObject({ title: [], content: [], map: [], stored: [] });
  });

  it('draws a stored picture from where the surface resolves its asset', () => {
    renderPlugin(imagePluginView.View, { content: { url: testAssetRef(7) }, map: {} });
    expect(screen.getByRole('img')).toHaveAttribute('src', testAssetUrl(testAssetRef(7)));
  });

  it('draws a skeleton until the picture loads, and names its URL when it does not', () => {
    renderPlugin(imagePluginView.View, { content: FIGURE, map: {}, title: 'Figure' });
    expect(screen.getByRole('status', { name: 'Loading image' })).toBeInTheDocument();
    fireEvent.load(screen.getByRole('img', { name: 'Figure' }));
    expect(screen.queryByRole('status', { name: 'Loading image' })).toBeNull();
    fireEvent.error(screen.getByRole('img', { name: 'Figure' }));
    expect(screen.getByText('Image did not load')).toBeInTheDocument();
    expect(screen.getByText(FIGURE.url)).toBeInTheDocument();
  });

  it('renames from the rail where the Title commit is present', async () => {
    const rendered = renderPlugin(imagePluginView.View, {
      content: FIGURE,
      map: {},
      title: 'Figure',
      grants: { title: true },
    });
    expect(screen.queryByRole('button', { name: 'Replace image of Resource Figure' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Rename Resource Figure' }));
    const field = screen.getByRole('textbox', { name: 'Resource title' });
    fireEvent.change(field, { target: { value: 'Harbour' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(rendered.commits.title).toEqual(['Harbour']);
    await waitFor(() => expect(screen.getByRole('img', { name: 'Harbour' })).toBeInTheDocument());
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('keeps a refused rename open with its draft, and says why', async () => {
    const rendered = renderPlugin(imagePluginView.View, {
      content: FIGURE,
      map: {},
      title: 'Figure',
      grants: { title: true },
      answer: { refused: 'A Resource needs a title.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rename Resource Figure' }));
    const field = screen.getByRole('textbox', { name: 'Resource title' });
    fireEvent.change(field, { target: { value: '   ' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(rendered.commits.title).toEqual(['   ']);
    expect(await screen.findByText('A Resource needs a title.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Resource title' })).toHaveValue('   ');
    expect(screen.getByRole('img', { name: 'Figure' })).toBeInTheDocument();
  });

  it('abandons a rename on Escape, committing nothing', () => {
    const rendered = renderPlugin(imagePluginView.View, {
      content: FIGURE,
      map: {},
      title: 'Figure',
      grants: { title: true },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rename Resource Figure' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Resource title' }), { key: 'Escape' });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(rendered.commits.title).toEqual([]);
  });

  it('replaces from the rail: picks in the press, then stores and names the picture exclusively', async () => {
    const rendered = renderPlugin(imagePluginView.View, {
      content: FIGURE,
      map: {},
      title: 'Figure',
      grants: AUTHORING,
      files: [pngFile()],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Replace image of Resource Figure' }));
    await waitFor(() => expect(rendered.commits.content).toHaveLength(1));
    expect(rendered.commits.exclusive).toBe(1);
    expect(rendered.commits.stored.map(({ type }) => type)).toEqual(['image/png']);
    expect(rendered.commits.content).toEqual([
      { url: testAssetRef(1), naturalSize: { width: 400, height: 300 } },
    ]);
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Figure' })).toHaveAttribute(
        'src',
        testAssetUrl(testAssetRef(1)),
      ),
    );
  });

  it.each([
    ['a file that is not a picture', textFile],
    ['an SVG', svgFile],
  ])('refuses %s without storing or committing it', async (_, refused) => {
    const rendered = renderPlugin(imagePluginView.View, {
      content: FIGURE,
      map: {},
      title: 'Figure',
      grants: AUTHORING,
      files: [refused()],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Replace image of Resource Figure' }));
    expect(await screen.findByRole('alert')).not.toBeEmptyDOMElement();
    await waitFor(() => expect(screen.queryByText('Replacing image…')).toBeNull());
    expect(rendered.commits.stored).toEqual([]);
    expect(rendered.commits.content).toEqual([]);
    expect(screen.getByRole('img', { name: 'Figure' })).toHaveAttribute('src', FIGURE.url);
  });

  it('replaces by a file dropped on the picture, which the canvas never sees', async () => {
    const rendered = renderPlugin(imagePluginView.View, {
      content: FIGURE,
      map: {},
      title: 'Figure',
      grants: AUTHORING,
    });
    // React stops the native event at its root, so a listener past the root —
    // where no canvas handler could see it — is never reached.
    const dropped = vi.fn();
    const plugin = screen.getByTestId('image-plugin');
    document.addEventListener('drop', dropped);
    const dataTransfer = { files: [pngFile()], types: ['Files'], dropEffect: 'none' };
    expect(fireEvent.dragOver(plugin, { dataTransfer })).toBe(false);
    fireEvent.drop(plugin, { dataTransfer });
    await waitFor(() => expect(rendered.commits.content).toHaveLength(1));
    expect(dropped).not.toHaveBeenCalled();
    document.removeEventListener('drop', dropped);
  });

  it('leaves a drop to the canvas where it offers no Replace', () => {
    renderPlugin(imagePluginView.View, { content: FIGURE, map: {}, title: 'Figure' });
    const dataTransfer = { files: [pngFile()], types: ['Files'] };
    expect(fireEvent.dragOver(screen.getByTestId('image-plugin'), { dataTransfer })).toBe(true);
  });

  it('refuses more than one dropped file', async () => {
    const rendered = renderPlugin(imagePluginView.View, {
      content: FIGURE,
      map: {},
      grants: AUTHORING,
    });
    fireEvent.drop(screen.getByTestId('image-plugin'), {
      dataTransfer: { files: [pngFile(), pngFile()], types: ['Files'] },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Use one image at a time.');
    expect(rendered.commits.exclusive).toBe(0);
  });

  it('opens no picker and starts nothing when the Claim is refused', async () => {
    const rendered = renderPlugin(imagePluginView.View, {
      content: FIGURE,
      map: {},
      title: 'Figure',
      grants: AUTHORING,
      files: [pngFile()],
      claimRefused: true,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Replace image of Resource Figure' }));
    expect(await screen.findByRole('alert')).not.toBeEmptyDOMElement();
    // The Claim is taken in the press, so a refused one opens no picker.
    expect(rendered.commits.picked).toBe(0);
    expect(rendered.commits.exclusive).toBe(0);
    expect(rendered.commits.stored).toEqual([]);
  });

  it('shows a refused content commit and keeps its picture', async () => {
    renderPlugin(imagePluginView.View, {
      content: FIGURE,
      map: {},
      title: 'Figure',
      grants: AUTHORING,
      files: [pngFile()],
      answer: { refused: 'Not now.' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Replace image of Resource Figure' }));
      await Promise.resolve();
    });
    // A refusal arrived; its words are the host's.
    await waitFor(() => expect(screen.queryByText('Replacing image…')).toBeNull());
    expect(screen.getByRole('alert')).toHaveTextContent('Not now.');
    expect(screen.getByRole('img', { name: 'Figure' })).toHaveAttribute('src', FIGURE.url);
  });

  it.each([
    ['answers HTTP 500', new Error('Unable to store an asset: HTTP 500')],
    ['cannot be reached', new TypeError('Failed to fetch')],
    ['times out', new Error('Request timed out')],
  ])(
    'says a Replace whose store %s failed, keeps its picture, and ends its work and Claim',
    async (_, cause) => {
      let failing = true;
      const rendered = renderPlugin(imagePluginView.View, {
        content: FIGURE,
        map: {},
        title: 'Figure',
        grants: AUTHORING,
        files: [pngFile()],
        storing: () => (failing ? Promise.reject(cause) : Promise.resolve(testAssetRef(1))),
      });
      const replace = () =>
        screen.getByRole('button', { name: 'Replace image of Resource Figure' });
      fireEvent.click(replace());
      expect(await screen.findByRole('alert')).not.toBeEmptyDOMElement();
      expect(screen.queryByText('Replacing image…')).toBeNull();
      expect(rendered.commits.content).toEqual([]);
      expect(screen.getByRole('img', { name: 'Figure' })).toHaveAttribute('src', FIGURE.url);
      // The exclusive work has ended, so every plain commit is offered again,
      // and the Claim is released, so a second Replace runs and lands.
      expect(screen.getByRole('button', { name: 'Rename Resource Figure' })).toBeEnabled();
      expect(replace()).toBeEnabled();
      failing = false;
      fireEvent.click(replace());
      await waitFor(() => expect(rendered.commits.content).toHaveLength(1));
      expect(rendered.commits.exclusive).toBe(2);
      await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    },
  );

  it('keeps an open rename and its draft while exclusive work withdraws the Title commit, and commits it after', async () => {
    const read = Promise.withResolvers<ArrayBuffer>();
    const slow = Object.assign(new File([pngHeader()], 'harbour.png', { type: 'image/png' }), {
      arrayBuffer: () => read.promise,
    });
    const rendered = renderPlugin(imagePluginView.View, {
      content: FIGURE,
      map: {},
      title: 'Figure',
      grants: AUTHORING,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rename Resource Figure' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Resource title' }), {
      target: { value: 'Harbour wall' },
    });
    // Exclusive work begins, which withdraws every plain commit on the page.
    fireEvent.drop(screen.getByTestId('image-plugin'), {
      dataTransfer: { files: [slow], types: ['Files'] },
    });
    expect(await screen.findByText('Replacing image…')).toBeInTheDocument();
    const withdrawn = screen.getByRole('textbox', { name: 'Resource title' });
    expect(withdrawn).toHaveValue('Harbour wall');
    // Committed while withdrawn, the draft is kept and nothing is sent.
    fireEvent.keyDown(withdrawn, { key: 'Enter' });
    expect(rendered.commits.title).toEqual([]);
    read.resolve(pngHeader().buffer);
    await waitFor(() => expect(screen.queryByText('Replacing image…')).toBeNull());
    const field = screen.getByRole('textbox', { name: 'Resource title' });
    expect(field).toHaveValue('Harbour wall');
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(rendered.commits.title).toEqual(['Harbour wall']);
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Harbour wall' })).toBeInTheDocument(),
    );
  });

  it('announces a replacement in progress politely, as a status', async () => {
    const read = Promise.withResolvers<ArrayBuffer>();
    const slow = Object.assign(new File([pngHeader()], 'harbour.png', { type: 'image/png' }), {
      arrayBuffer: () => read.promise,
    });
    renderPlugin(imagePluginView.View, {
      content: FIGURE,
      map: {},
      title: 'Figure',
      grants: AUTHORING,
      files: [slow],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Replace image of Resource Figure' }));
    expect(await screen.findByText('Replacing image…')).toHaveAttribute('role', 'status');
    read.resolve(pngHeader().buffer);
    await waitFor(() => expect(screen.queryByText('Replacing image…')).toBeNull());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('replaces with a second pick when the first picker settles empty as the second opens', async () => {
    const first = Promise.withResolvers<readonly File[]>();
    const rendered = renderPlugin(imagePluginView.View, {
      content: FIGURE,
      map: {},
      title: 'Figure',
      grants: AUTHORING,
      // A browser settles a picker left open with nothing when the next one opens.
      picker: (opening) => {
        if (opening === 1) return first.promise;
        first.resolve([]);
        return Promise.resolve([pngFile()]);
      },
    });
    const replace = screen.getByRole('button', { name: 'Replace image of Resource Figure' });
    fireEvent.click(replace);
    fireEvent.click(replace);
    await waitFor(() => expect(rendered.commits.content).toHaveLength(1));
    expect(screen.queryByRole('alert')).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Figure' })).toHaveAttribute(
        'src',
        testAssetUrl(testAssetRef(1)),
      ),
    );
  });

  it('replaces with a second pick while the first picker never settles', async () => {
    const rendered = renderPlugin(imagePluginView.View, {
      content: FIGURE,
      map: {},
      title: 'Figure',
      grants: AUTHORING,
      picker: (opening) =>
        opening === 1 ? new Promise<never>(() => undefined) : Promise.resolve([pngFile()]),
    });
    const replace = screen.getByRole('button', { name: 'Replace image of Resource Figure' });
    fireEvent.click(replace);
    fireEvent.click(replace);
    await waitFor(() => expect(rendered.commits.content).toHaveLength(1));
    expect(rendered.commits.exclusive).toBe(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('commits a newer draft entered while a rename is still settling', async () => {
    const rendered = renderPlugin(imagePluginView.View, {
      content: FIGURE,
      map: {},
      title: 'Figure',
      grants: { title: true },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rename Resource Figure' }));
    const field = screen.getByRole('textbox', { name: 'Resource title' });
    fireEvent.change(field, { target: { value: 'Harbour' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    fireEvent.change(field, { target: { value: 'Harbour wall' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await waitFor(() => expect(rendered.commits.title).toEqual(['Harbour', 'Harbour wall']));
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Harbour wall' })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('draws a picture the browser already holds at once, with no skeleton', () => {
    const complete = vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    const width = vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(400);
    try {
      renderPlugin(imagePluginView.View, { content: FIGURE, map: {}, title: 'Figure' });
      expect(screen.queryByRole('status', { name: 'Loading image' })).toBeNull();
      expect(screen.getByRole('img', { name: 'Figure' })).toHaveStyle({ opacity: '1' });
    } finally {
      complete.mockRestore();
      width.mockRestore();
    }
  });
});

describe('Create and Replace admit a picture alike', () => {
  /** A PNG's signature and IHDR tag, with no dimensions: admitted, but its header is silent on its size. */
  const silentPng = () =>
    file(
      Uint8Array.from([
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a,
        0,
        0,
        0,
        13,
        ...encoded('IHDR'),
      ]),
      'silent.png',
      'image/png',
    );
  const namelessText = () => file(encoded('hello'), '', 'text/plain');

  /** What the Image plugin's data creation asks the host for, and what it reports. */
  async function created(dropped: File) {
    const data = imagePluginView.creates?.find((each) => each.from === 'data');
    if (data?.from !== 'data') throw new Error('The Image plugin offers no data creation.');
    const items: unknown[] = [];
    const reported: string[] = [];
    const measure = vi.fn(() => Promise.resolve({ width: 1, height: 1 }));
    await data.run(
      {
        assets: {
          url: testAssetUrl,
          read: () => Promise.resolve({ refused: 'Nothing is read here.' }),
          store: () => Promise.resolve(testAssetRef(1)),
          measure,
        },
        create: (asked) => {
          items.push(...asked.map((item) => ('content' in item ? item.content : null)));
          return Promise.resolve('completed');
        },
        report: (words) => reported.push(words),
      },
      { kind: 'files', files: [dropped] },
    );
    return { items, reported, measure };
  }

  /** What Replace commits, and what it says. */
  async function replaced(picked: File) {
    const rendered = renderPlugin(imagePluginView.View, {
      content: FIGURE,
      map: {},
      title: 'Figure',
      grants: AUTHORING,
      files: [picked],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Replace image of Resource Figure' }));
    await waitFor(() => expect(screen.queryByText('Replacing image…')).toBeNull());
    return { content: rendered.commits.content, alert: screen.queryByRole('alert')?.textContent };
  }

  it('records no size for a picture whose header is silent, and loads none to measure it', async () => {
    const create = await created(silentPng());
    const replace = await replaced(silentPng());

    expect(create.items).toEqual([{ url: testAssetRef(1) }]);
    expect(create.measure).not.toHaveBeenCalled();
    expect(replace.content).toEqual([{ url: testAssetRef(1) }]);
  });

  it('names a nameless file in the same words', async () => {
    const create = await created(namelessText());
    const replace = await replaced(namelessText());

    expect(create.reported).toEqual([replace.alert]);
    expect(replace.alert).toMatch(/^The image is not /);
  });
});
