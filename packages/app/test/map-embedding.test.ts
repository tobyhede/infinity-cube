import { describe, expect, it, vi } from 'vitest';
import { uuidSchema } from '@project/core';
import type { MapEmbedRequest } from '@project/ui';
import { createMapEmbedding } from '../src/map-embedding/map-embedding';
import { manualSchedule } from './manual-schedule';

const SPACE_RESOURCE = uuidSchema.parse('00000000-0000-4000-8000-0000000000e1');
const TARGET = uuidSchema.parse('00000000-0000-4000-8000-0000000000e2');
const TARGET_MAP = uuidSchema.parse('00000000-0000-4000-8000-0000000000e3');
const TARGET_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-0000000000e4');
const FRAMED = { centreX: 10, centreY: 20, zoom: 2 };
const NUDGED = { centreX: 30, centreY: 40, zoom: 2 };

type Commit = NonNullable<NonNullable<MapEmbedRequest['select']>['commit']>;

/** What a Space Resource's plugin asks of its Map embedding: authored in place when `claimed`. */
const ask = ({
  commit,
  claimed = false,
}: { commit?: Commit; claimed?: boolean } = {}): MapEmbedRequest => ({
  space: TARGET,
  view: { map: TARGET_MAP, graph: TARGET_GRAPH },
  select:
    commit === undefined ? undefined : { value: { map: TARGET_MAP, graph: TARGET_GRAPH }, commit },
  claim: claimed ? { release: () => undefined } : undefined,
});

const harness = () => {
  const given = vi.fn();
  const lend = vi.fn((drawing: symbol) => () => {
    given(drawing);
  });
  const select = vi.fn();
  const commit = vi.fn<Commit>(() => Promise.resolve('completed'));
  const clock = manualSchedule();
  const embedding = createMapEmbedding({
    spaces: null,
    claims: { lend },
    select,
    schedule: clock.schedule,
  });
  const drawing = Symbol('drawing');
  /** The plugin's drawing on node `node` publishes, as `CanvasMapEmbed` does. */
  const publish = (request: MapEmbedRequest | null, node = 'node') =>
    embedding.embeddings.publish(node, SPACE_RESOURCE, request, drawing);
  /** The canvas commits with these nodes drawn, each drawing its Space's target Map and Graph. */
  const drawn = (...nodeIds: string[]) =>
    embedding.drawn({
      nodeIds,
      requests: nodeIds.map((id) => ({
        parent: { id },
        spaceId: TARGET,
        mapId: TARGET_MAP,
        graphId: TARGET_GRAPH,
      })),
    });
  /** The lifetime of the embedding standing at `node`, which a rail's answer carries. */
  const lifetime = (node = 'node'): symbol => {
    const standing = embedding.embeddings.getState().get(node)?.lifetime;
    if (standing === undefined) throw new Error(`nothing is embedded at ${node}`);
    return standing;
  };
  return { embedding, lend, given, select, commit, drawing, publish, drawn, clock, lifetime };
};

describe('a Map embedding authored in place', () => {
  it('lends its Claim to the gate while authored, and returns it on Done', () => {
    const { lend, given, drawing, publish, drawn } = harness();

    publish(ask({ claimed: true }));
    drawn('node');
    expect(lend).toHaveBeenCalledWith(drawing);
    expect(given).not.toHaveBeenCalled();

    publish(ask());
    drawn('node');
    expect(given).toHaveBeenCalledWith(drawing);
  });

  it('selects its Resource on Done, which leaves it drawn', () => {
    const { select, publish, drawn } = harness();
    publish(ask({ claimed: true }));
    drawn('node');
    expect(select).not.toHaveBeenCalled();

    publish(ask());
    drawn('node');

    expect(select).toHaveBeenCalledOnce();
    expect(select).toHaveBeenCalledWith(SPACE_RESOURCE);
  });

  it('selects nothing when the Edit ended because its node went', () => {
    // A Map switch, a delete or an unplace takes the node down with the
    // embedding; selecting its Resource then would select one no longer drawn.
    const { select, given, drawing, publish, drawn } = harness();
    publish(ask({ claimed: true }));
    drawn('node', 'other');

    publish(null);
    drawn('other');

    expect(given).toHaveBeenCalledWith(drawing);
    expect(select).not.toHaveBeenCalled();
  });
});

describe('the framing authored on a Map embedding', () => {
  it('shows a pan while it is drawn, and lands it through the embedding’s own commit', () => {
    const { embedding, commit, publish, drawn } = harness();
    publish(ask({ commit, claimed: true }));
    drawn('node');

    embedding.draft('node', NUDGED);
    expect(embedding.getState().drafts.get('node')).toEqual(NUDGED);
    expect(commit).not.toHaveBeenCalled();

    embedding.frame('node', NUDGED);
    expect(commit).toHaveBeenCalledWith({ map: TARGET_MAP, graph: TARGET_GRAPH, framing: NUDGED });
    expect(embedding.getState().drafts.has('node')).toBe(false);
  });

  it('lands a zoom once the wheel has been still for 160ms', () => {
    const { embedding, commit, publish, drawn, clock } = harness();
    publish(ask({ commit, claimed: true }));
    drawn('node');

    embedding.zoom('node', NUDGED);
    clock.advance(100);
    embedding.zoom('node', FRAMED);
    clock.advance(159);
    expect(commit).not.toHaveBeenCalled();
    expect(embedding.getState().drafts.get('node')).toEqual(FRAMED);

    clock.advance(1);
    expect(commit).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledWith({ map: TARGET_MAP, graph: TARGET_GRAPH, framing: FRAMED });
    expect(embedding.getState().drafts.has('node')).toBe(false);
  });

  it('drops a pending zoom without landing it when a pan takes over', () => {
    const { embedding, commit, publish, drawn, clock } = harness();
    publish(ask({ commit, claimed: true }));
    drawn('node');

    embedding.zoom('node', FRAMED);
    embedding.beginPan('node');
    clock.advance(1000);

    expect(commit).not.toHaveBeenCalled();
    expect(embedding.getState().drafts.get('node')).toEqual(FRAMED);
  });

  it('lands a pending zoom on Done, before another Claim can withdraw the commit', () => {
    const { embedding, commit, given, publish, drawn, clock } = harness();
    publish(ask({ commit, claimed: true }));
    drawn('node');
    embedding.zoom('node', FRAMED);

    const order: string[] = [];
    commit.mockImplementation(() => {
      order.push('commit');
      return Promise.resolve('completed');
    });
    given.mockImplementation(() => {
      order.push('give back');
    });

    publish(ask({ commit }));
    drawn('node');

    expect(order).toEqual(['commit', 'give back']);
    expect(commit).toHaveBeenCalledWith({ map: TARGET_MAP, graph: TARGET_GRAPH, framing: FRAMED });
    clock.advance(1000);
    expect(commit).toHaveBeenCalledOnce();
  });

  it('lands a zoom pending when the embedding is taken down on the Graph its node drew', () => {
    // The plugin passed a Map and no Graph, so the Graph is the one the
    // node drew, which the commit that takes it down no longer draws.
    const { embedding, commit, drawing, drawn } = harness();
    const noGraph: MapEmbedRequest = {
      ...ask({ commit, claimed: true }),
      view: { map: TARGET_MAP, graph: undefined },
    };
    embedding.embeddings.publish('node', SPACE_RESOURCE, noGraph, drawing);
    drawn('node', 'other');
    embedding.zoom('node', FRAMED);

    embedding.embeddings.publish('node', SPACE_RESOURCE, null, drawing);
    drawn('other');

    expect(commit).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledWith({ map: TARGET_MAP, graph: TARGET_GRAPH, framing: FRAMED });
  });

  it('drops a pending zoom rather than land it on a Map chosen since', () => {
    // The commit writes the Map and Graph with the framing, so landing it now
    // would either frame the chosen Map with the last one's framing or switch back.
    const { embedding, commit, drawing, drawn, clock } = harness();
    const OTHER_MAP = uuidSchema.parse('00000000-0000-4000-8000-0000000000e5');
    embedding.embeddings.publish('node', SPACE_RESOURCE, ask({ commit, claimed: true }), drawing);
    drawn('node');
    embedding.zoom('node', FRAMED);

    embedding.embeddings.publish(
      'node',
      SPACE_RESOURCE,
      { ...ask({ commit, claimed: true }), view: { map: OTHER_MAP, graph: TARGET_GRAPH } },
      drawing,
    );
    drawn('node');
    clock.advance(1000);

    expect(commit).not.toHaveBeenCalled();
    expect(embedding.getState().drafts.has('node')).toBe(false);
  });

  it('drops a pending zoom once another Map is chosen, though the first is chosen again', () => {
    const { embedding, commit, drawing, drawn, clock } = harness();
    const OTHER_MAP = uuidSchema.parse('00000000-0000-4000-8000-0000000000e5');
    embedding.embeddings.publish('node', SPACE_RESOURCE, ask({ commit, claimed: true }), drawing);
    drawn('node');
    embedding.zoom('node', FRAMED);

    embedding.embeddings.publish(
      'node',
      SPACE_RESOURCE,
      { ...ask({ commit, claimed: true }), view: { map: OTHER_MAP, graph: TARGET_GRAPH } },
      drawing,
    );
    embedding.embeddings.publish('node', SPACE_RESOURCE, ask({ commit, claimed: true }), drawing);
    drawn('node');
    clock.advance(1000);

    expect(commit).not.toHaveBeenCalled();
    expect(embedding.getState().drafts.has('node')).toBe(false);
  });

  it('drops a pending zoom rather than land it through a drawing that replaced its embedding', () => {
    // The replacement draws the same Map and Graph, so only the embedding it
    // was made in tells the zoom apart from one made in the replacement.
    const { embedding, commit, drawing, drawn, clock } = harness();
    embedding.embeddings.publish('node', SPACE_RESOURCE, ask({ commit, claimed: true }), drawing);
    drawn('node');
    embedding.zoom('node', FRAMED);

    embedding.embeddings.publish(
      'node',
      SPACE_RESOURCE,
      ask({ commit, claimed: true }),
      Symbol('another drawing'),
    );
    drawn('node');
    clock.advance(1000);

    expect(commit).not.toHaveBeenCalled();
    expect(embedding.getState().drafts.has('node')).toBe(false);
  });

  it('drops a pan rather than land it on a Map chosen since it began', () => {
    // The pointer is still down when the Map changes: the moves after it must
    // not draft the last Map's framing on the new one, nor the release land it.
    const { embedding, commit, drawing, drawn } = harness();
    const OTHER_MAP = uuidSchema.parse('00000000-0000-4000-8000-0000000000e5');
    embedding.embeddings.publish('node', SPACE_RESOURCE, ask({ commit, claimed: true }), drawing);
    drawn('node');
    embedding.beginPan('node');
    embedding.draft('node', FRAMED);

    embedding.embeddings.publish(
      'node',
      SPACE_RESOURCE,
      { ...ask({ commit, claimed: true }), view: { map: OTHER_MAP, graph: TARGET_GRAPH } },
      drawing,
    );
    drawn('node');
    expect(embedding.getState().drafts.has('node')).toBe(false);
    embedding.draft('node', NUDGED);
    expect(embedding.getState().drafts.has('node')).toBe(false);
    embedding.frame('node', NUDGED);

    expect(commit).not.toHaveBeenCalled();
    expect(embedding.getState().drafts.has('node')).toBe(false);
  });

  it('drops a pan rather than land it through a drawing that replaced its embedding', () => {
    const { embedding, commit, drawing, drawn } = harness();
    embedding.embeddings.publish('node', SPACE_RESOURCE, ask({ commit, claimed: true }), drawing);
    drawn('node');
    embedding.beginPan('node');
    embedding.draft('node', FRAMED);

    embedding.embeddings.publish(
      'node',
      SPACE_RESOURCE,
      ask({ commit, claimed: true }),
      Symbol('another drawing'),
    );
    drawn('node');
    embedding.draft('node', NUDGED);
    expect(embedding.getState().drafts.has('node')).toBe(false);
    embedding.frame('node', NUDGED);

    expect(commit).not.toHaveBeenCalled();
    expect(embedding.getState().drafts.has('node')).toBe(false);
  });

  it('lands a pan through the same drawing published again, and the next pan afresh', () => {
    const { embedding, commit, drawing, drawn } = harness();
    embedding.embeddings.publish('node', SPACE_RESOURCE, ask({ commit, claimed: true }), drawing);
    drawn('node');
    embedding.beginPan('node');
    embedding.draft('node', FRAMED);

    embedding.embeddings.publish('node', SPACE_RESOURCE, ask({ commit, claimed: true }), drawing);
    drawn('node');
    embedding.draft('node', NUDGED);
    embedding.frame('node', NUDGED);

    expect(commit).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledWith({ map: TARGET_MAP, graph: TARGET_GRAPH, framing: NUDGED });

    // A pan that went stale is over at its release: the next one begins under
    // the embedding standing then.
    embedding.embeddings.publish(
      'node',
      SPACE_RESOURCE,
      ask({ commit, claimed: true }),
      Symbol('another drawing'),
    );
    drawn('node');
    embedding.beginPan('node');
    embedding.draft('node', FRAMED);
    embedding.frame('node', FRAMED);

    expect(commit).toHaveBeenCalledTimes(2);
    expect(commit).toHaveBeenLastCalledWith({
      map: TARGET_MAP,
      graph: TARGET_GRAPH,
      framing: FRAMED,
    });
  });

  it('lands a pending zoom through the same drawing published again', () => {
    const { embedding, commit, drawing, drawn, clock } = harness();
    embedding.embeddings.publish('node', SPACE_RESOURCE, ask({ commit, claimed: true }), drawing);
    drawn('node');
    embedding.zoom('node', FRAMED);

    embedding.embeddings.publish('node', SPACE_RESOURCE, ask({ commit, claimed: true }), drawing);
    drawn('node');
    clock.advance(1000);

    expect(commit).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledWith({ map: TARGET_MAP, graph: TARGET_GRAPH, framing: FRAMED });
  });

  it('lands a zoom pending when the embedding is taken down, then forgets its commit', () => {
    const { embedding, commit, publish, drawn } = harness();
    publish(ask({ commit, claimed: true }));
    drawn('node', 'other');
    embedding.zoom('node', FRAMED);

    publish(null);
    drawn('other');
    expect(commit).toHaveBeenCalledOnce();

    // Once that framing has landed, the withdrawn embedding's commit is not kept.
    embedding.frame('node', NUDGED);
    expect(commit).toHaveBeenCalledOnce();
  });

  it('frames the Map and Graph this node draws where the plugin passed no Graph', () => {
    // Another node of the same Resource draws another Map; the framing
    // must keep to the one drawn here.
    const { embedding, commit } = harness();
    const OTHER_MAP = uuidSchema.parse('00000000-0000-4000-8000-0000000000e5');
    const drawing = Symbol('drawing');
    const noGraph: MapEmbedRequest = {
      ...ask({ commit }),
      view: { map: TARGET_MAP, graph: undefined },
    };
    embedding.embeddings.publish('first', SPACE_RESOURCE, noGraph, drawing);
    embedding.embeddings.publish('second', SPACE_RESOURCE, noGraph, Symbol('second'));
    embedding.drawn({
      nodeIds: ['first', 'second'],
      requests: [
        { parent: { id: 'first' }, spaceId: TARGET, mapId: OTHER_MAP, graphId: TARGET_GRAPH },
        { parent: { id: 'second' }, spaceId: TARGET, mapId: TARGET_MAP, graphId: TARGET_GRAPH },
      ],
    });

    embedding.frame('second', FRAMED);

    expect(commit).toHaveBeenCalledWith({ map: TARGET_MAP, graph: TARGET_GRAPH, framing: FRAMED });
  });

  it('lands a zoom still pending when the canvas goes, keeping its draft', () => {
    const { embedding, commit, publish, drawn } = harness();
    publish(ask({ commit, claimed: true }));
    drawn('node');
    embedding.zoom('node', FRAMED);

    embedding.dispose();

    expect(commit).toHaveBeenCalledWith({ map: TARGET_MAP, graph: TARGET_GRAPH, framing: FRAMED });
    expect(embedding.getState().drafts.get('node')).toEqual(FRAMED);
  });

  it('gives back every Claim it holds when the canvas goes', () => {
    const { embedding, given, drawing, publish, drawn } = harness();
    publish(ask({ claimed: true }));
    drawn('node');

    embedding.dispose();

    expect(given).toHaveBeenCalledWith(drawing);
  });
});

describe('the embeddings a Map embedding follows', () => {
  it('draws from what the plugins published, in its own state', () => {
    const { embedding, publish } = harness();
    publish(ask());

    expect(embedding.getState().embeds).toBe(embedding.embeddings.getState());
  });

  it('drops a framing draft when its embedding goes', () => {
    // Drawn at the next Open of the Resource, it would frame that Open with
    // a pan the author never finished.
    const { embedding, commit, publish, drawn } = harness();
    publish(ask({ commit, claimed: true }));
    drawn('node');
    embedding.draft('node', FRAMED);

    publish(null);

    expect(embedding.getState().drafts.has('node')).toBe(false);
  });

  it('drops a framing draft when another drawing replaces its embedding', () => {
    const { embedding, commit, drawing, drawn } = harness();
    embedding.embeddings.publish('node', SPACE_RESOURCE, ask({ commit, claimed: true }), drawing);
    drawn('node');
    embedding.draft('node', FRAMED);

    embedding.embeddings.publish(
      'node',
      SPACE_RESOURCE,
      ask({ commit, claimed: true }),
      Symbol('another drawing'),
    );

    expect(embedding.getState().drafts.has('node')).toBe(false);
  });

  it('keeps a framing draft while the same drawing publishes again', () => {
    const { embedding, commit, drawing, drawn } = harness();
    embedding.embeddings.publish('node', SPACE_RESOURCE, ask({ commit, claimed: true }), drawing);
    drawn('node');
    embedding.draft('node', FRAMED);

    embedding.embeddings.publish('node', SPACE_RESOURCE, ask({ commit }), drawing);

    expect(embedding.getState().drafts.get('node')).toBe(FRAMED);
  });

  it('follows what the plugins publish only while the canvas draws', () => {
    const { embedding, publish, drawn } = harness();
    embedding.dispose();

    publish(ask({ claimed: true }));
    expect(embedding.getState().editing.has('node')).toBe(false);

    drawn('node');
    expect(embedding.getState().editing.has('node')).toBe(true);
  });
});

describe('what the canvas says about a Map embedding', () => {
  it('keeps a notice and rail editing while the embedding stands', () => {
    const { embedding, publish, lifetime } = harness();
    publish(ask());

    embedding.setNotice('node', 'Link copied.', lifetime());
    embedding.setRailEditing('node', true);

    expect(embedding.getState().notices.get('node')).toBe('Link copied.');
    expect(embedding.getState().railEditing.has('node')).toBe(true);
    embedding.setNotice('node', null, lifetime());
    embedding.setRailEditing('node', false);
    expect(embedding.getState().notices.has('node')).toBe(false);
    expect(embedding.getState().railEditing.has('node')).toBe(false);
  });

  it('drops both when the embedding goes, whatever took it down', () => {
    // The canvas, the plugin's own Map content commit, another author's Edit
    // or a replacement: each withdraws the embedding, and an Open again starts afresh.
    const { embedding, publish, lifetime } = harness();
    publish(ask());
    embedding.setNotice('node', 'Link copied.', lifetime());
    embedding.setRailEditing('node', true);

    publish(null);

    expect(embedding.getState().notices.has('node')).toBe(false);
    expect(embedding.getState().railEditing.has('node')).toBe(false);
    publish(ask());
    expect(embedding.getState().notices.has('node')).toBe(false);
  });

  it('says nothing for an answer that lands after its embedding has gone', () => {
    const { embedding, publish, lifetime } = harness();
    publish(ask());
    const asked = lifetime();
    publish(null);

    embedding.setNotice('node', 'This choice is no longer offered.', asked);

    expect(embedding.getState().notices.has('node')).toBe(false);
  });

  it('says nothing for an answer to a choice made in an embedding since Closed and Opened again', () => {
    // A Closed Space Resource stays drawn, so Open again publishes with the
    // same drawing; the answer is still about the embedding that was Closed.
    const { embedding, publish, lifetime } = harness();
    publish(ask());
    const asked = lifetime();
    publish(null);
    publish(ask());
    embedding.setNotice('node', 'Now.', lifetime());

    embedding.setNotice('node', 'This choice is no longer offered.', asked);
    expect(embedding.getState().notices.get('node')).toBe('Now.');
    embedding.setNotice('node', null, asked);
    expect(embedding.getState().notices.get('node')).toBe('Now.');
  });

  it('answers a choice while the embedding it was made in stands', () => {
    const { embedding, publish, lifetime } = harness();
    publish(ask());
    const asked = lifetime();
    publish(ask({ claimed: true }));

    embedding.setNotice('node', 'Refused.', asked);

    expect(embedding.getState().notices.get('node')).toBe('Refused.');
  });

  it('drops a notice and rail editing when another drawing embeds there, withdrawn or not', () => {
    const { embedding, publish, lifetime } = harness();
    publish(ask());
    embedding.setNotice('node', 'Link copied.', lifetime());
    embedding.setRailEditing('node', true);

    embedding.embeddings.publish('node', SPACE_RESOURCE, ask(), Symbol('another drawing'));

    expect(embedding.getState().notices.has('node')).toBe(false);
    expect(embedding.getState().railEditing.has('node')).toBe(false);
  });

  it('keeps no rail editing for a node that embeds nothing', () => {
    // A rail reporting in the commit that withdrew its embedding would
    // otherwise hold the canvas's chrome back while nothing is edited.
    const { embedding } = harness();

    embedding.setRailEditing('node', true);

    expect(embedding.getState().railEditing.has('node')).toBe(false);
  });

  it('keeps another node’s notice when one embedding goes', () => {
    const { embedding, publish, lifetime } = harness();
    publish(ask(), 'first');
    publish(ask(), 'second');
    embedding.setNotice('first', 'One.', lifetime('first'));
    embedding.setNotice('second', 'Two.', lifetime('second'));

    publish(null, 'first');

    expect(embedding.getState().notices).toEqual(new Map([['second', 'Two.']]));
  });
});
