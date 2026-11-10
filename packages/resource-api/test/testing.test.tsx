import { useEffect } from 'react';
import { act, waitFor } from '@testing-library/react';
import type { Exclusive, PluginViewProps, Surface } from '@project/resource-api/view';
import { renderPlugin } from '@project/resource-api/view/testing';

interface Seen {
  surface?: Surface<string, string>;
}

/** A view that hands the test each surface it is drawn with. */
function probe() {
  const seen: Seen = {};
  function Probe({ surface }: PluginViewProps<string, string>) {
    useEffect(() => {
      seen.surface = surface;
    });
    return null;
  }
  const surface = (): Surface<string, string> => {
    if (seen.surface === undefined) throw new Error('The probe was not drawn.');
    return seen.surface;
  };
  return { Probe, surface };
}

describe('renderPlugin’s asset grants', () => {
  it('offers store and pick only when granted', () => {
    const { Probe, surface } = probe();
    renderPlugin(Probe, { content: '', map: '' });
    expect(surface().assets.store).toBeUndefined();
    expect(surface().assets.pick).toBeUndefined();
  });

  it('records stored bytes and answers their reference, and picks the files given', async () => {
    const { Probe, surface } = probe();
    const file = new File(['picture'], 'picture.png', { type: 'image/png' });
    const rendered = renderPlugin(Probe, {
      content: '',
      map: '',
      grants: { store: true, pick: true },
      files: [file],
    });
    const bytes = new Blob(['bytes']);
    const ref = await surface().assets.store?.(bytes);
    expect(ref).toMatch(/^\/assets\/[A-Za-z0-9_-]{43}$/u);
    expect(rendered.commits.stored).toEqual([bytes]);
    expect(await surface().assets.pick?.('image/*')).toEqual([file]);
  });
});

describe('renderPlugin’s exclusive work', () => {
  it('answers busy beside running work, withdraws every other commit, and keeps own commits to the run', async () => {
    const { Probe, surface } = probe();
    const rendered = renderPlugin(Probe, {
      content: 'start',
      map: '',
      grants: { content: true, claim: true, store: true },
    });
    const plain = surface().content.commit;
    const claim = surface().claim?.();
    if (claim === undefined || plain === undefined) throw new Error('Granted, so offered.');

    let finish = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let kept: Exclusive<string, string> = {};
    let running: Promise<'done' | 'busy'> = Promise.resolve('busy');
    act(() => {
      running = claim.exclusively(async (own) => {
        kept = own;
        await held;
        return 'done' as const;
      });
    });

    expect(await claim.exclusively(() => Promise.resolve('second'))).toBe('busy');
    await waitFor(() => expect(surface().content.commit).toBeUndefined());
    expect(surface().assets.store).toBeUndefined();
    expect(await plain('elsewhere')).toHaveProperty('refused');
    await act(async () => {
      expect(await kept.content?.('own')).toBe('completed');
    });
    expect(kept.store).toBeDefined();
    expect(rendered.commits.content).toEqual(['own']);

    await act(async () => {
      finish();
      expect(await running).toBe('done');
    });
    expect(await kept.content?.('late')).toHaveProperty('refused');
    await waitFor(() => expect(surface().content.commit).toBeDefined());
    await act(async () => {
      expect(await plain('after')).toBe('completed');
    });
    expect(rendered.commits.content).toEqual(['own', 'after']);
  });
});
