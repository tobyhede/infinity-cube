import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Answer, AssetRef } from '@project/resource-api/domain';
import { testAssetRef, testAssetUrl } from '@project/resource-api/view/testing';
import type { Assets, Creation, CreationData, CreationHost, New } from '@project/resource-api/view';
import type { ImageContent } from '@project/plugin-image/domain';
import {
  IMAGE_CREATIONS,
  MEASURE_TIMEOUT_MS,
  PICKED_IMAGE_TYPES,
  measurePicture,
} from '../src/creation';

/** A 400×300 PNG's signature and IHDR chunk, which is all creation reads. */
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
const pngFile = (name = 'harbour.png') => file(pngHeader(), name, 'image/png');
/** Declared a PNG, but not one by its bytes. */
const fakePng = () => file(encoded('hello'), 'fake.png', 'image/png');
const svgFile = () => file(encoded('<svg/>'), 'figure.svg', 'image/svg+xml');

interface Recorded {
  readonly host: CreationHost<ImageContent>;
  readonly created: (readonly New<ImageContent>[])[];
  readonly reported: string[];
  readonly stored: Blob[];
  readonly picked: string[];
}

/** A host that records what a creation asks of it. */
function recordingHost(
  options: {
    readonly picks?: readonly File[];
    readonly store?: boolean;
    readonly refuseStore?: string;
  } = {},
): Recorded {
  const created: (readonly New<ImageContent>[])[] = [];
  const reported: string[] = [];
  const stored: Blob[] = [];
  const picked: string[] = [];
  const assets: Assets = {
    url: testAssetUrl,
    read: () => Promise.resolve({ refused: 'Nothing is read here.' }),
    pick: (accept) => {
      picked.push(accept);
      return Promise.resolve([...(options.picks ?? [])]);
    },
    store:
      options.store === false
        ? undefined
        : (bytes) => {
            stored.push(bytes);
            const answer: AssetRef | { readonly refused: string } =
              options.refuseStore === undefined
                ? testAssetRef(stored.length)
                : { refused: options.refuseStore };
            return Promise.resolve(answer);
          },
  };
  const host: CreationHost<ImageContent> = {
    assets,
    create: (items) => {
      created.push(items);
      const answer: Answer = 'completed';
      return Promise.resolve(answer);
    },
    report: (words) => reported.push(words),
  };
  return { host, created, reported, stored, picked };
}

const creation = <F extends Creation<ImageContent>['from']>(from: F) => {
  const found = IMAGE_CREATIONS.find(
    (each): each is Extract<Creation<ImageContent>, { from: F }> => each.from === from,
  );
  if (found === undefined) throw new Error(`The Image plugin offers no ${from} creation.`);
  return found;
};

const fromFiles = (...files: readonly File[]): CreationData => ({ kind: 'files', files });

afterEach(() => {
  vi.useRealTimers();
});

describe('creating Image Resources from the Dock', () => {
  it('opens the picker for the formats an Image Resource draws, and creates one Resource for each picture', async () => {
    const recorded = recordingHost({ picks: [pngFile('a.png'), pngFile('b.png')] });

    await creation('dock').run(recorded.host);

    expect(recorded.picked).toEqual([PICKED_IMAGE_TYPES]);
    expect(recorded.created).toEqual([
      [
        { content: { url: testAssetRef(1), naturalSize: { width: 400, height: 300 } } },
        { content: { url: testAssetRef(2), naturalSize: { width: 400, height: 300 } } },
      ],
    ]);
    expect(recorded.stored.map(({ type }) => type)).toEqual(['image/png', 'image/png']);
  });

  it('creates nothing and says nothing when the picker is cancelled', async () => {
    const recorded = recordingHost({ picks: [] });

    await creation('dock').run(recorded.host);

    expect(recorded.created).toEqual([]);
    expect(recorded.reported).toEqual([]);
  });

  it('opens the picker before anything is awaited, so the press still holds it', () => {
    const recorded = recordingHost({ picks: [] });

    void creation('dock').run(recorded.host);

    expect(recorded.picked).toEqual([PICKED_IMAGE_TYPES]);
  });

  it('offers nothing where the surface has no picker', async () => {
    const recorded = recordingHost();
    const host = { ...recorded.host, assets: { ...recorded.host.assets, pick: undefined } };

    await creation('dock').run(host);

    expect(recorded.created).toEqual([]);
    expect(recorded.reported).toEqual([]);
  });
});

describe('creating Image Resources from dropped files', () => {
  it('says a file refused by its declared type before any file is stored', async () => {
    const recorded = recordingHost();

    await creation('data').run(recorded.host, fromFiles(pngFile(), svgFile()));

    expect(recorded.stored).toEqual([]);
    expect(recorded.created).toEqual([]);
    expect(recorded.reported).toEqual([
      'figure.svg is an SVG image, which cannot be stored. Use PNG, JPEG, WebP or GIF.',
    ]);
  });

  it('says every file its bytes refuse, and creates none of the gesture', async () => {
    const recorded = recordingHost();
    const huge = file(new Uint8Array(10 * 1024 * 1024 + 1), 'huge.png', 'image/png');

    await creation('data').run(recorded.host, fromFiles(pngFile(), fakePng(), huge));

    expect(recorded.created).toEqual([]);
    expect(recorded.reported).toEqual([
      'fake.png is not a PNG, JPEG, WebP or GIF image. ' +
        'huge.png is larger than 10 MB, the largest image that can be stored.',
    ]);
  });

  it('says where there is no asset store to keep a picture in', async () => {
    const recorded = recordingHost({ store: false });

    await creation('data').run(recorded.host, fromFiles(pngFile()));

    expect(recorded.created).toEqual([]);
    expect(recorded.reported).toEqual(['Images cannot be stored here.']);
  });

  it('says what the store refused', async () => {
    const recorded = recordingHost({ refuseStore: 'The store is full.' });

    await creation('data').run(recorded.host, fromFiles(pngFile()));

    expect(recorded.created).toEqual([]);
    expect(recorded.reported).toEqual(['The store is full.']);
  });

  it('is no gesture when no files arrived', async () => {
    const recorded = recordingHost();

    await creation('data').run(recorded.host, fromFiles());

    expect(recorded.created).toEqual([]);
    expect(recorded.reported).toEqual([]);
  });

  it('takes any file, and only an image URL', () => {
    const data = creation('data');

    expect(data.types).toContain('*/*');
    expect(data.accepts?.(fromFiles(svgFile()))).toBe(true);
    expect(data.accepts?.({ kind: 'url', url: 'https://example.com/a.png' })).toBe(true);
    expect(data.accepts?.({ kind: 'url', url: 'data:image/png;base64,AA==' })).toBe(false);
  });
});

describe('creating an Image Resource from a pasted URL', () => {
  it('creates it unsized when the picture never loads', async () => {
    vi.useFakeTimers();
    const recorded = recordingHost();

    const running = creation('data').run(recorded.host, {
      kind: 'url',
      url: 'https://example.com/a.png',
    });
    await vi.advanceTimersByTimeAsync(MEASURE_TIMEOUT_MS);
    await running;

    expect(recorded.created).toEqual([[{ content: { url: 'https://example.com/a.png' } }]]);
  });
});

describe('measuring a picture', () => {
  it('answers nothing once the picture has taken too long', async () => {
    vi.useFakeTimers();

    const measured = measurePicture('https://example.com/slow.png', 50);
    await vi.advanceTimersByTimeAsync(50);

    await expect(measured).resolves.toBeUndefined();
  });
});
