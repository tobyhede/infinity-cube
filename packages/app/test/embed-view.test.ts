import { describe, expect, it } from 'vitest';
import { uuidSchema } from '@project/core';
import { resolveEmbedView } from '../src/embed-view';
import type { SpaceResourceTarget } from '../src/space-resource-lifecycle';

const SPACE = uuidSchema.parse('00000000-0000-4000-8000-000000000020');
const FIRST_MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000022');
const FIRST_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000023');
const SECOND_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000024');
const SECOND_MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000025');
const THIRD_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000026');
const FOURTH_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000027');

const appearance = { color: '#1f77b4', headShape: 'arrow' } as const;

const mapless: SpaceResourceTarget = {
  id: SPACE,
  title: 'Architecture',
  maps: [
    {
      id: FIRST_MAP,
      title: 'One',
      graphs: [
        { id: FIRST_GRAPH, title: 'A', ...appearance },
        { id: SECOND_GRAPH, title: 'B', ...appearance },
      ],
    },
    {
      id: SECOND_MAP,
      title: 'Two',
      graphs: [
        { id: THIRD_GRAPH, title: 'C', ...appearance },
        { id: FOURTH_GRAPH, title: 'D', ...appearance },
      ],
      activeGraph: FOURTH_GRAPH,
    },
  ],
};

/** The Space, opening on `defaultMap` where one is given. */
const target = (defaultMap?: typeof FIRST_MAP): SpaceResourceTarget =>
  defaultMap === undefined ? mapless : { ...mapless, defaultMap };

describe('resolveEmbedView', () => {
  it('takes a view naming its Map and Graph as it is, with no target read', () => {
    const framing = { centreX: 1, centreY: 2, zoom: 3 };
    expect(
      resolveEmbedView(SPACE, { map: FIRST_MAP, graph: SECOND_GRAPH, framing }, undefined),
    ).toEqual({ spaceId: SPACE, map: FIRST_MAP, graph: SECOND_GRAPH, framing });
  });

  it("shows the Space's defaultMap on the Graph it opens on where no view is given", () => {
    expect(resolveEmbedView(SPACE, undefined, target(SECOND_MAP))).toEqual({
      spaceId: SPACE,
      map: SECOND_MAP,
      graph: FOURTH_GRAPH,
      framing: undefined,
    });
  });

  it('opens a Map with no authored Active Graph on its first Graph', () => {
    expect(resolveEmbedView(SPACE, undefined, target(FIRST_MAP))?.graph).toBe(FIRST_GRAPH);
  });

  it("fills a view's missing Graph with its Map's opening Graph", () => {
    expect(resolveEmbedView(SPACE, { map: SECOND_MAP }, target(FIRST_MAP))?.graph).toBe(
      FOURTH_GRAPH,
    );
  });

  it('is unresolved until the Space is read, where the view leaves anything to it', () => {
    expect(resolveEmbedView(SPACE, undefined, undefined)).toBeUndefined();
    expect(resolveEmbedView(SPACE, { map: FIRST_MAP }, undefined)).toBeUndefined();
  });

  it('is unresolved for a Space with no defaultMap, or a Map it does not have', () => {
    expect(resolveEmbedView(SPACE, undefined, target())).toBeUndefined();
    expect(
      resolveEmbedView(
        SPACE,
        { map: uuidSchema.parse('00000000-0000-4000-8000-000000000099') },
        target(FIRST_MAP),
      ),
    ).toBeUndefined();
  });
});
