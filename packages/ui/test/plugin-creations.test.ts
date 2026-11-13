import { describe, expect, it, vi } from 'vitest';
import { imagePlugin, type ImageContent } from '@project/plugin-image/domain';
import type { Creation } from '@project/resource-api/view';
import {
  hostCreation,
  NotCreatableContent,
  type HostCreationHost,
  type HostNew,
} from '../src/plugin-catalog';

/** A plugin's creation as the host runs it, its types erased (ADR 0142). */

const hostOf = () => {
  const reported: string[] = [];
  const asked: (readonly HostNew[])[] = [];
  const host: HostCreationHost = {
    assets: { url: (ref) => ref, read: () => Promise.resolve({ refused: 'none' }) },
    create: (items) => {
      asked.push(items);
      return Promise.resolve('completed');
    },
    report: (words) => reported.push(words),
  };
  return { host, reported, asked };
};

const dockRun = (creation: Creation<ImageContent>) => {
  const erased = hostCreation(imagePlugin, creation);
  if (erased.from !== 'dock') throw new Error('Expected a Dock creation.');
  return erased.run;
};

describe('a create its plugin’s schema refuses', () => {
  it('reaches the host as an item it may not create, which the host decides after its own checks', async () => {
    const { host, reported, asked } = hostOf();

    await dockRun({
      from: 'dock',
      run: async (creation) => {
        await creation.create([{ content: { url: 'figure.png' } }]);
      },
    })(host);

    expect(asked).toEqual([[{ notCreatable: true }]]);
    expect(reported).toEqual([]);
  });

  it('refuses a content function’s answer as not creatable, not as a break', async () => {
    const { host, asked } = hostOf();

    await dockRun({
      from: 'dock',
      run: async (creation) => {
        await creation.create([{ newSpace: true, contentFor: () => ({ url: 'figure.png' }) }]);
      },
    })(host);

    const [item] = asked[0] ?? [];
    if (item === undefined || !('contentFor' in item)) {
      throw new Error('Expected a content function.');
    }
    expect(() => item.contentFor({ spaceId: 's', map: 'm', graph: 'g' })).toThrow(
      NotCreatableContent,
    );
  });
});

describe('a create its plugin’s schema accepts', () => {
  it('reaches the host as JSON content', async () => {
    const run = vi.fn<HostCreationHost['create']>(() => Promise.resolve('completed'));
    const { host } = hostOf();

    await dockRun({
      from: 'dock',
      run: async (creation) => {
        await creation.create([{ content: { url: 'https://example.com/a.png' } }]);
      },
    })({ ...host, create: run });

    expect(run).toHaveBeenCalledWith([
      { title: undefined, content: { url: 'https://example.com/a.png' } },
    ]);
  });
});
