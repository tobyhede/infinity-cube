import { describe, expect, it } from 'vitest';
import {
  PLUGIN_KINDS,
  contentTarget,
  isKindId,
  isMissingKindId,
  isPluginKind,
  mapContentProblem,
  newEmptyResourceDocument,
  newResourceDocument,
  resolveContent,
  startsEmpty,
  UNRESOLVED_CONTENT,
  resourceReferences,
  type ResourceDocument,
} from '../src/plugin-modules';
import { uuidSchema } from '../src/schema';
import { EMPTY_ASSET_REF } from '../src/assets';

describe('the build’s plugins, read as kinds', () => {
  it.each(['markdown', 'space', 'image', 'ur', 'reference'])('reads the %s plugin', (kind) => {
    expect(isPluginKind(kind)).toBe(true);
  });

  it.each(['chart', 'vnd.example.chart', 'Markdown', ''])(
    'reads no plugin for %j, which none in the list draws',
    (kind) => {
      expect(isPluginKind(kind)).toBe(false);
    },
  );

  it('lets a Resource whose kind no plugin draws keep whatever Map content is stored', () => {
    const missing = 'vnd.example.chart';
    if (!isMissingKindId(missing)) throw new Error('A plugin in this build draws the kind');
    expect(mapContentProblem(missing, { zoom: 2, open: true })).toBeUndefined();
    expect(mapContentProblem('ur', { open: true })).toBeDefined();
  });
});

const TARGET = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const SPACE = uuidSchema.parse('00000000-0000-4000-8000-000000000002');

/** Content of every kind: what each kind starts with, and one of each that references something. */
const REPRESENTATIVE: readonly ResourceDocument[] = [
  ...PLUGIN_KINDS.flatMap((kind) => newResourceDocument(kind, 'New') ?? []),
  { title: 'Figure', kind: 'image', content: { url: 'https://example.com/a.png' } },
  { title: 'Recap', kind: 'reference', content: { target: TARGET } },
  { title: 'Inner', kind: 'space', content: { spaceId: SPACE, map: SPACE, graph: SPACE } },
];

describe("a kind's content Target", () => {
  it('has content of every listed kind to read', () => {
    expect(new Set(REPRESENTATIVE.map(({ kind }) => kind))).toEqual(new Set(PLUGIN_KINDS));
  });

  /** Resolution reads the Target intake has resolved as a Resource reference, and no other. */
  it.each(REPRESENTATIVE)('is one of the Resources its content references: $kind $title', (doc) => {
    const target = contentTarget(doc);
    if (target !== undefined) expect(resourceReferences(doc)).toContain(target);
  });

  it('is read for the Reference kind', () => {
    expect(REPRESENTATIVE.map((doc) => contentTarget(doc))).toContain(TARGET);
  });
});

describe('where resolved content came from', () => {
  const OWN = REPRESENTATIVE.filter((doc) => contentTarget(doc) === undefined);
  const NOTES = { kind: 'markdown', content: { url: EMPTY_ASSET_REF } } as const;
  const RECAP = { kind: 'reference', content: { target: TARGET } } as const;

  it.each(OWN)('is the Resource itself when its kind names no Target: $kind $title', (doc) => {
    expect(resolveContent(doc, () => undefined).via).toBe('self');
  });

  it('is the Target when its kind names one', () => {
    expect(resolveContent(RECAP, () => NOTES)).toEqual({
      kind: 'markdown',
      content: NOTES.content,
      via: 'target',
    });
  });

  it('is the Target when the Target cannot be reached, and names no kind', () => {
    expect(resolveContent(RECAP, () => undefined)).toEqual(UNRESOLVED_CONTENT);
    expect(resolveContent(RECAP, () => RECAP)).toEqual(UNRESOLVED_CONTENT);
    expect(UNRESOLVED_CONTENT).toEqual({ kind: 'unresolved', via: 'target' });
  });

  it('is the Resource itself for every Resource that shows its own content', () => {
    for (const doc of OWN)
      expect(resolveContent(doc, () => undefined)).toHaveProperty('via', 'self');
  });
});

describe('a kind id', () => {
  it.each(['markdown', 'chart', 'a', '3d', 'x-ray', 'vnd.owner.name', 'vnd.a-b.c-1'])(
    'accepts %j',
    (id) => {
      expect(isKindId(id)).toBe(true);
    },
  );

  it.each([
    '',
    'a.b',
    'vnd.a',
    'vnd.a.b.c',
    'vnd..b',
    'a/b',
    '-a',
    'vnd.-a.b',
    'vnd.a.-b',
    'a b',
    'a_b',
    'café',
  ])('refuses %j', (id) => {
    expect(isKindId(id)).toBe(false);
  });
});

describe('the kinds a Resource may be created empty as', () => {
  it('are the plugins that declare new content, in list order', () => {
    expect(PLUGIN_KINDS.filter(startsEmpty)).toEqual(['markdown', 'ur']);
  });

  it('start a Resource created with no kind chosen as the first of them in list order', () => {
    expect(newEmptyResourceDocument('New').kind).toBe(PLUGIN_KINDS.filter(startsEmpty)[0]);
  });

  it('do not include a kind whose plugin declares no new content', () => {
    expect(newResourceDocument('reference', 'New')).toBeUndefined();
    expect(newResourceDocument('chart', 'New')).toBeUndefined();
  });
});
