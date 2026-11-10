import { describe, expect, it } from 'vitest';
import { titleName, uuidSchema } from '@project/core';
import { loadSpace, type ResourceFile } from '@project/graph';
import fixtureJson from '../fixture/00000000-0000-4000-8000-000000000040/space.json';
import presentationJson from '../fixture/00000000-0000-4000-8000-000000000060/space.json';
import deepDiveJson from '../fixture/00000000-0000-4000-8000-000000000070/space.json';
import notesJson from '../fixture/00000000-0000-4000-8000-000000000080/space.json';
import exampleJson from '../example/space.json';

const MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000050');
const SPARE_MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000068');
const DEEP_DIVE_MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000071');
const NOTES_MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000081');

/**
 * The Spaces on disk, loaded exactly as authored.
 *
 * A space is a directory, not a file (ADR 0020): the space file holds
 * structure, and every Resource is a Resource file under `resources/`. A
 * Markdown Resource's text is an asset its content names (ADR 0142), held in
 * the aggregate's `assets/`. So this reads every Resource file, as intake
 * would be handed them, and is the regression test that the Resource files are
 * still authored correctly: a malformed Resource file, or a Markdown Resource
 * whose text has no file, fails here.
 *
 * The tracked fixture is a complete aggregate: Meta is the Map fixture, and
 * the ordinary Spaces hang off it. `example/` is dormant and nothing else would
 * notice it breaking.
 */

const spaceDirs = import.meta.glob<string>(
  ['../fixture/*/resources/*.json', '../example/resources/*.json'],
  { query: '?raw', import: 'default', eager: true },
);

/** Every Markdown text the two aggregates hold, keyed by path. */
const texts = import.meta.glob<string>(['../fixture/assets/*.md', '../example/assets/*.md'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** The text an asset reference names in the aggregate `dir` belongs to. */
const textOf = (dir: string, url: string): string | undefined =>
  texts[`../${dir.split('/')[0]}/assets/${url.slice('/assets/'.length)}.md`];

/** The resource files of one space directory, keyed the way the plugin serves them. */
function resourceFiles(dir: string): ResourceFile[] {
  return Object.entries(spaceDirs)
    .filter(([path]) => path.startsWith(`../${dir}/`))
    .map(([path, text]) => ({ path, text }));
}

describe.each([
  [
    'fixture/00000000-0000-4000-8000-000000000040',
    fixtureJson,
    {
      resources: 13,
      maps: 3,
      graphs: 5,
      unreached: { 'Collection 1': ['T'], 'Collection 2': [], 'Linked Spaces': [] },
      defaultMap: MAP_ID,
    },
  ],
  [
    'fixture/00000000-0000-4000-8000-000000000060',
    presentationJson,
    {
      resources: 5,
      maps: 2,
      graphs: 2,
      unreached: { Overview: ['Authoring notes', 'Deep dive'], Spare: [] },
      defaultMap: SPARE_MAP,
    },
  ],
  [
    'fixture/00000000-0000-4000-8000-000000000070',
    deepDiveJson,
    {
      resources: 4,
      maps: 1,
      graphs: 1,
      unreached: { 'Deep dive': [] },
      defaultMap: DEEP_DIVE_MAP,
    },
  ],
  [
    'fixture/00000000-0000-4000-8000-000000000080',
    notesJson,
    {
      resources: 2,
      maps: 1,
      graphs: 1,
      unreached: { Notes: [] },
      defaultMap: NOTES_MAP,
    },
  ],
  [
    'example',
    exampleJson,
    {
      resources: 7,
      maps: 1,
      graphs: 3,
      unreached: { Walkthroughs: [] },
      defaultMap: undefined,
    },
  ],
])('%s/', (name, json, expected) => {
  it('loads as a version 1 Space whose Maps own every Graph, and opens in Flow', () => {
    const result = loadSpace(json, resourceFiles(name));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.errors.map((e) => e.message).join('\n'));
    expect(result.space.maps).toHaveLength(expected.maps);
    // `space.graphs` is the flatten across those Maps, never a stored
    // collection beside them (ADR 0040).
    expect(result.space.graphs).toHaveLength(expected.graphs);
    expect(result.space.defaultMap).toBe(expected.defaultMap);
  });

  it('makes every Edge endpoint a member, and names the members no Edge reaches', () => {
    const result = loadSpace(json, resourceFiles(name));
    if (!result.ok) throw new Error(result.errors.map((e) => e.message).join('\n'));

    // Membership *is* the position map (ADR 0040), and `loadSpace` has already
    // refused an Edge endpoint that is not a member. What it cannot refuse is a
    // member no Edge reaches — which is both a legitimate authored state (Add
    // Resource and the Resources list each leave one) and what a Resource stranded in a
    // Map it does not belong to looks like. So the strays are named, by Resource
    // and by the Map holding them, rather than counted: a count cannot tell a
    // Resource that became connected apart from a different Resource stranded in the
    // same fixture edit, and lets the two regressions through together. The
    // fixture Meta Space strands exactly `T`, whose three-line Title draws the
    // ladder wherever the fixture is loaded (ADR 0083), and Presentation
    // strands the two Space Resources that sit off its Graph.
    const nameById = new Map<string, string>(
      result.space.resources.map((resource) => [resource.id, titleName(resource.title)]),
    );
    const unreached = Object.fromEntries(
      result.space.maps.map((m): readonly [string, readonly string[]] => {
        const endpoints = m.graphs.flatMap((graph) =>
          graph.edges.flatMap((edge) => [edge.from, edge.to]),
        );
        for (const endpoint of endpoints) expect(m.positions[endpoint]).toBeDefined();
        const connected = new Set<string>(endpoints);
        return [
          m.title,
          Object.keys(m.positions)
            .filter((resource) => !connected.has(resource))
            .map((resource) => nameById.get(resource) ?? resource)
            .sort(),
        ];
      }),
    );

    // Keyed by Map title, so two Maps sharing one would fold together and
    // take a stray in the second with them.
    expect(Object.keys(unreached)).toHaveLength(expected.maps);
    expect(unreached).toEqual(expected.unreached);

    // Every Resource is in exactly one Map, so nothing is left over and nothing
    // is in both.
    const memberships = result.space.maps.flatMap((m) => Object.keys(m.positions));
    expect(memberships).toHaveLength(expected.resources);
    expect(new Set(memberships).size).toBe(expected.resources);
  });

  it('finds every resource with kind-appropriate content', () => {
    const result = loadSpace(json, resourceFiles(name));
    if (!result.ok) throw new Error(result.errors.map((e) => e.message).join('\n'));
    expect(result.space.resources).toHaveLength(expected.resources);
    // Every Markdown Resource names a text its aggregate holds, and none is empty.
    for (const resource of result.space.resources) {
      if (resource.kind !== 'markdown') continue;
      expect(textOf(name, resource.content.url)?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });
});
