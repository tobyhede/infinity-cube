import { describe, expect, it } from 'vitest';
import { EMPTY_ASSET_REF, type Resource } from '@project/core';
import {
  parseResourceFiles,
  serializeResource,
  type ParseResourceFilesResult,
  type ResourceFile,
} from '../src/index';
import { uuid, type Json } from './resource-files';

const RESOURCE_A = '00000000-0000-4000-8000-000000000002';
const RESOURCE_B = '00000000-0000-4000-8000-000000000003';
const SPACE = '00000000-0000-4000-8000-000000000010';
const MAP = '00000000-0000-4000-8000-000000000011';
const GRAPH = '00000000-0000-4000-8000-000000000012';

/** A Resource file at `resources/<name>.json` holding this JSON value, as an author writes it. */
const json = (value: Json, name = RESOURCE_A): ResourceFile => ({
  path: `resources/${name}.json`,
  text: `${JSON.stringify(value, null, 2)}\n`,
});

const markdownEnvelope = (overrides: Record<string, Json> = {}) => ({
  id: RESOURCE_A,
  title: 'A',
  kind: 'markdown',
  content: { url: EMPTY_ASSET_REF },
  ...overrides,
});

const spaceEnvelope = (content: Record<string, Json> = {}) => ({
  id: RESOURCE_A,
  title: 'Inner',
  kind: 'space',
  content: { spaceId: SPACE, map: MAP, graph: GRAPH, ...content },
});

const imageEnvelope = (content: Record<string, Json> = {}) => ({
  id: RESOURCE_A,
  title: 'Picture',
  kind: 'image',
  content: { url: 'https://example.com/a.png', ...content },
});

/** The one Resource these files decode to, or a failure carrying the errors. */
function onlyResource(files: readonly ResourceFile[]): Resource {
  const result = parseResourceFiles(files);
  if (!result.ok) {
    throw new Error(result.errors.map(({ message }) => message).join('\n'));
  }
  expect(result.resources).toHaveLength(1);
  const [decoded] = result.resources;
  if (decoded === undefined) throw new Error('no Resource decoded');
  return decoded.resource;
}

const errorsOf = (result: ParseResourceFilesResult) => (result.ok ? [] : result.errors);

const errorKinds = (files: readonly ResourceFile[]) =>
  errorsOf(parseResourceFiles(files)).map(({ kind }) => kind);

const messages = (files: readonly ResourceFile[]) =>
  errorsOf(parseResourceFiles(files)).map(({ message }) => message);

describe('parseResourceFiles reads each kind from its Resource file', () => {
  it('reads a Markdown Resource naming its text by URL, and says which file it came from', () => {
    expect(parseResourceFiles([json(markdownEnvelope())])).toEqual({
      ok: true,
      resources: [
        {
          path: `resources/${RESOURCE_A}.json`,
          resource: {
            id: RESOURCE_A,
            title: 'A',
            kind: 'markdown',
            content: { url: EMPTY_ASSET_REF },
          },
        },
      ],
    });
  });

  it('takes identity from inside the file, never from its name', () => {
    const result = parseResourceFiles([json(markdownEnvelope(), 'renamed')]);
    expect(result.ok && result.resources.map(({ path, resource }) => [path, resource.id])).toEqual([
      ['resources/renamed.json', RESOURCE_A],
    ]);
  });

  it('reads a Reference Resource, whose content is its Target (ADR 0009)', () => {
    expect(
      onlyResource([
        json({ id: RESOURCE_A, title: 'A′', kind: 'reference', content: { target: RESOURCE_B } }),
      ]),
    ).toEqual({ id: RESOURCE_A, title: 'A′', kind: 'reference', content: { target: RESOURCE_B } });
  });

  it('reads an Ur Resource, whose content is empty (ADR 0113)', () => {
    expect(
      onlyResource([json({ id: RESOURCE_A, title: 'Node', kind: 'ur', content: {} })]),
    ).toEqual({ id: RESOURCE_A, title: 'Node', kind: 'ur', content: {} });
  });

  it('reads an Image Resource with its URL and natural size (ADR 0106)', () => {
    expect(onlyResource([json(imageEnvelope({ naturalSize: { width: 4, height: 3 } }))])).toEqual({
      id: RESOURCE_A,
      title: 'Picture',
      kind: 'image',
      content: { url: 'https://example.com/a.png', naturalSize: { width: 4, height: 3 } },
    });
  });

  it('reads a Space Resource with its selection and framing (ADR 0068, ADR 0079)', () => {
    const framing = { centreX: 1, centreY: -2, zoom: 0.5 };
    expect(onlyResource([json(spaceEnvelope({ framing }))])).toEqual({
      id: RESOURCE_A,
      title: 'Inner',
      kind: 'space',
      content: { spaceId: SPACE, map: MAP, graph: GRAPH, framing },
    });
  });

  it('normalizes the Title as every Title is normalized (ADR 0083)', () => {
    const file = json({
      id: RESOURCE_A,
      title: '\r\nA  \r\n  B\t\r\n\r\n',
      kind: 'ur',
      content: {},
    });
    expect(onlyResource([file]).title).toBe('A\n  B');
  });

  it('reads several Resources in one call', () => {
    const result = parseResourceFiles([
      json(markdownEnvelope()),
      json({ id: RESOURCE_B, title: 'B', kind: 'ur', content: {} }, RESOURCE_B),
    ]);
    expect(result.ok && result.resources.map(({ resource }) => resource.id)).toEqual([
      RESOURCE_A,
      RESOURCE_B,
    ]);
  });
});

describe('parseResourceFiles refuses a file that is not a Resource file', () => {
  it('reports unparseable JSON as an error naming the file, rather than throwing', () => {
    const files = [{ path: `resources/${RESOURCE_A}.json`, text: '{ "id": ' }];
    expect(errorKinds(files)).toEqual(['invalid-json']);
    expect(messages(files)[0]).toContain(`resources/${RESOURCE_A}.json`);
  });

  it('refuses a file that declares no kind, with no Ur default (ADR 0128)', () => {
    for (const value of [
      { id: RESOURCE_A, title: 'Node', content: {} },
      { id: RESOURCE_A, title: 'Node', kind: 7, content: {} },
      [],
      'a string',
      null,
    ]) {
      const files = [json(value)];
      expect(errorKinds(files)).toEqual(['invalid-resource-file']);
      expect(messages(files)[0]).toContain('must declare its kind');
    }
  });

  it('refuses a malformed kind id, saying what a kind id is', () => {
    for (const kind of ['a.b', 'vnd.acme', 'vnd..widget', '-markdown', 'mark down', '']) {
      const files = [json({ id: RESOURCE_A, title: 'A', kind, content: {} })];
      expect(errorKinds(files)).toEqual(['invalid-resource-file']);
      expect(messages(files)[0]).toContain('is not a kind id');
    }
  });

  it('reads a well-formed kind id no plugin in this build draws, its content whole (ADR 0142)', () => {
    for (const kind of ['video', 'Markdown', 'vnd.acme.widget']) {
      const content = { frames: [{ at: 0 }], loop: true };
      const parsed = parseResourceFiles([json({ id: RESOURCE_A, title: 'A', kind, content })]);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.resources.map(({ resource }) => resource)).toEqual([
        { id: RESOURCE_A, title: 'A', kind, content },
      ]);
    }
  });

  it('refuses a Resource file of a missing kind whose envelope has a key it does not declare', () => {
    const files = [json({ id: RESOURCE_A, title: 'A', kind: 'video', content: {}, extra: 1 })];
    expect(errorKinds(files)).toEqual(['invalid-resource-file']);
  });

  it('refuses a file with no id, minting none', () => {
    const files = [json({ title: 'Node', kind: 'ur', content: {} })];
    expect(errorKinds(files)).toEqual(['invalid-resource-file']);
    expect(messages(files)[0]).toContain('id');
  });

  it('refuses an id that is not a UUID', () => {
    for (const id of ['2024', 2024, 'resource-a']) {
      expect(errorKinds([json({ id, title: 'Node', kind: 'ur', content: {} })])).toEqual([
        'invalid-resource-file',
      ]);
    }
  });

  it('refuses a Title that normalizes to nothing', () => {
    const files = [json({ id: RESOURCE_A, title: ' \n\t\n', kind: 'ur', content: {} })];
    expect(errorKinds(files)).toEqual(['invalid-resource-file']);
    expect(messages(files)[0]).toContain('title');
  });

  it('refuses a file with no content, even for a kind whose content is empty', () => {
    expect(errorKinds([json({ id: RESOURCE_A, title: 'Node', kind: 'ur' })])).toEqual([
      'invalid-resource-file',
    ]);
  });

  it('refuses a Reference Target that is not a UUID', () => {
    const files = [
      json({ id: RESOURCE_A, title: 'A′', kind: 'reference', content: { target: 'resource-b' } }),
    ];
    expect(errorKinds(files)).toEqual(['invalid-resource-file']);
    expect(messages(files)[0]).toContain('content.target');
  });
});

describe('Resource files are strict at both levels (ADR 0127)', () => {
  it('refuses an envelope key no Resource declares, naming the key and the file', () => {
    const files = [json(markdownEnvelope({ description: 'Where every graph begins' }))];
    expect(errorKinds(files)).toEqual(['invalid-resource-file']);
    expect(messages(files)[0]).toContain(`resources/${RESOURCE_A}.json`);
    expect(messages(files)[0]).toContain("'description'");
  });

  it('refuses a content key a kind sets beside the envelope rather than inside content', () => {
    const files = [
      json({ id: RESOURCE_A, title: 'A′', kind: 'reference', content: {}, target: RESOURCE_B }),
    ];
    expect(
      errorsOf(parseResourceFiles(files)).every(({ kind }) => kind === 'invalid-resource-file'),
    ).toBe(true);
    expect(messages(files).join('\n')).toContain("'target'");
  });

  it('refuses a content key the kind does not declare, naming it', () => {
    const cases: readonly [Json, string][] = [
      [markdownEnvelope({ content: { url: EMPTY_ASSET_REF, encoding: 'utf-8' } }), 'encoding'],
      [markdownEnvelope({ content: { url: EMPTY_ASSET_REF, source: '# A' } }), 'source'],
      [
        {
          id: RESOURCE_A,
          title: 'A′',
          kind: 'reference',
          content: { target: RESOURCE_B, tagret: RESOURCE_B },
        },
        'tagret',
      ],
      [{ id: RESOURCE_A, title: 'Node', kind: 'ur', content: { body: 'Prose.' } }, 'body'],
      [spaceEnvelope({ framng: { centreX: 0, centreY: 0, zoom: 1 } }), 'framng'],
      [imageEnvelope({ path: 'a.png' }), 'path'],
    ];
    for (const [value, key] of cases) {
      const fileErrors = errorsOf(parseResourceFiles([json(value)])).filter(
        ({ kind }) => kind === 'invalid-resource-file',
      );
      expect(fileErrors.map(({ path }) => path)).toContain(`resources/${RESOURCE_A}.json`);
      expect(fileErrors.map(({ message }) => message).join('\n')).toContain(`'${key}'`);
    }
  });

  it('refuses a misspelt key inside an Image Resource naturalSize, naming it', () => {
    const files = [json(imageEnvelope({ naturalSize: { width: 1, height: 2, widht: 3 } }))];
    expect(messages(files)).toHaveLength(1);
    expect(messages(files)[0]).toContain(`resources/${RESOURCE_A}.json`);
    expect(messages(files)[0]).toContain("'widht'");
  });

  it('refuses a misspelt key inside a Space Resource framing, naming it', () => {
    const files = [json(spaceEnvelope({ framing: { centreX: 0, centreY: 0, zoom: 1, zooom: 2 } }))];
    expect(messages(files)).toHaveLength(1);
    expect(messages(files)[0]).toContain(`resources/${RESOURCE_A}.json`);
    expect(messages(files)[0]).toContain("'zooom'");
  });
});

describe("a Markdown Resource's text is an asset it names (ADR 0142)", () => {
  it('refuses a sidecar locator, an inline source, or a URL outside the asset store', () => {
    for (const content of [
      { path: `${RESOURCE_A}.md`, mediaType: 'text/markdown' },
      { source: 'Body\n' },
      { url: 'https://example.com/a.md' },
      { url: '/assets/short' },
    ]) {
      const files = [json(markdownEnvelope({ content }))];
      expect(errorKinds(files), JSON.stringify(content)).toContain('invalid-resource-file');
      expect(messages(files)[0]).toContain(`resources/${RESOURCE_A}.json`);
    }
  });
});

describe('parseResourceFiles accumulates every fault', () => {
  it('reports each failing file, and gives back no Resources when any fails', () => {
    const files = [
      json(markdownEnvelope()),
      { path: 'resources/broken.json', text: 'not json' },
      json({ id: RESOURCE_B, title: 'B', content: {} }, RESOURCE_B),
    ];
    const result = parseResourceFiles(files);
    expect(result.ok).toBe(false);
    expect(errorsOf(result).map(({ kind, path }) => [kind, path])).toEqual([
      ['invalid-json', 'resources/broken.json'],
      ['invalid-resource-file', `resources/${RESOURCE_B}.json`],
    ]);
  });
});

describe('serializeResource', () => {
  it('writes a Markdown Resource as its one Resource file, naming its text by URL', () => {
    const resource: Resource = {
      id: uuid(RESOURCE_A),
      title: 'A',
      kind: 'markdown',
      content: { url: EMPTY_ASSET_REF },
    };

    expect(serializeResource(resource)).toEqual([
      {
        path: `resources/${RESOURCE_A}.json`,
        text: [
          '{',
          `  "id": "${RESOURCE_A}",`,
          '  "title": "A",',
          '  "kind": "markdown",',
          '  "content": {',
          `    "url": "${EMPTY_ASSET_REF}"`,
          '  }',
          '}',
          '',
        ].join('\n'),
      },
    ]);
  });

  it('writes a Reference Resource as one file holding its Target', () => {
    const resource: Resource = {
      id: uuid(RESOURCE_A),
      title: 'A′',
      kind: 'reference',
      content: { target: uuid(RESOURCE_B) },
    };

    expect(serializeResource(resource)).toEqual([
      {
        path: `resources/${RESOURCE_A}.json`,
        text: [
          '{',
          `  "id": "${RESOURCE_A}",`,
          '  "title": "A′",',
          '  "kind": "reference",',
          '  "content": {',
          `    "target": "${RESOURCE_B}"`,
          '  }',
          '}',
          '',
        ].join('\n'),
      },
    ]);
  });

  it('writes the envelope keys in envelope order whatever order the Resource holds them in', () => {
    const resource: Resource = {
      content: {},
      kind: 'ur',
      title: 'Node',
      id: uuid(RESOURCE_A),
    };
    const [file] = serializeResource(resource);
    expect(file?.text.match(/^ {2}"\w+":/gmu)).toEqual([
      '  "id":',
      '  "title":',
      '  "kind":',
      '  "content":',
    ]);
  });

  it('writes a Space Resource with both of its selections, which parses back whole', () => {
    const resource: Resource = {
      id: uuid('00000000-0000-4000-8000-00000000000d'),
      title: 'Nested space',
      kind: 'space',
      content: { spaceId: uuid(SPACE), map: uuid(MAP), graph: uuid(GRAPH) },
    };

    const files = serializeResource(resource);
    expect(files.map(({ path }) => path)).toEqual([
      'resources/00000000-0000-4000-8000-00000000000d.json',
    ]);
    expect(onlyResource(files)).toEqual(resource);
  });
});
