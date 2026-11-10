import { describe, expect, it, vi } from 'vitest';
import { imagePlugin, type ImageContent } from '@project/plugin-image/domain';
import type { Creation } from '@project/resource-api/view';
import { hostCreation, type HostCreationHost } from '../src/kinds/plugin-views';

/** A plugin's creation as the host runs it, its types erased (ADR 0142). */

const created = vi.fn<HostCreationHost['create']>(() => Promise.resolve('completed'));

const hostOf = (): HostCreationHost & { readonly reported: string[] } => {
  const reported: string[] = [];
  return {
    reported,
    assets: { url: (ref) => ref, read: () => Promise.resolve({ refused: 'none' }) },
    create: created,
    report: (words) => reported.push(words),
  };
};

describe('a create its plugin’s schema refuses', () => {
  it('is reported to the author, as the host reports every refused create', async () => {
    const asksForBadContent: Creation<ImageContent> = {
      from: 'dock',
      run: async (host) => {
        await host.create([{ content: { url: 'figure.png' } }]);
      },
    };
    const host = hostOf();

    const erased = hostCreation(imagePlugin, asksForBadContent);
    if (erased.from !== 'dock') throw new Error('Expected a Dock creation.');
    await erased.run(host);

    expect(created).not.toHaveBeenCalled();
    expect(host.reported).toEqual(['This Resource cannot be created.']);
  });
});
