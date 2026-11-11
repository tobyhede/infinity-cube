import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { EMPTY_ASSET, type Answer } from '@project/resource-api/domain';
import { markdownPlugin } from '@project/plugin-markdown/domain';
import {
  PluginResource,
  PresentedPluginResource,
  type PluginHostClaim,
  type PluginResourceProps,
} from '../src';
import { textAsset, WithTexts } from './markdown-texts';

/**
 * The Markdown plugin drawn by the application's own hosts (ADR 0142): on the
 * Map with the Map content an entry resolves to, and on the Stage with the
 * value `withoutMap` gives, since the Stage has no Map.
 */
const onTheMap = (overrides: Partial<PluginResourceProps>): PluginResourceProps => ({
  resourceId: 'notes',
  kind: 'markdown',
  title: { title: 'Notes', readOnly: false, onReturnFocus: () => undefined },
  content: markdownPlugin.newContent,
  mapContent: markdownPlugin.mapContent.default,
  outline: 'rectangle',
  state: 'rest',
  graphColor: '#ffc53d',
  readOnly: false,
  operations: { kind: 'markdown' },
  ...overrides,
});

describe('a Markdown Resource drawn by the application', () => {
  it.each([
    { map: 'an authored Map', readOnly: false },
    { map: 'a read-only Map', readOnly: true },
  ])('is Closed when fresh, on $map', async ({ readOnly }) => {
    render(
      <WithTexts>
        <PluginResource
          {...onTheMap({
            readOnly,
            title: { title: 'Notes', readOnly, onReturnFocus: () => undefined },
            operations: readOnly
              ? { kind: 'markdown' }
              : { kind: 'markdown', commitMap: () => Promise.resolve('completed') },
          })}
        />
      </WithTexts>,
    );
    expect(markdownPlugin.newContent).toEqual({ url: EMPTY_ASSET });
    expect(await screen.findByRole('heading', { name: 'Notes' })).toBeVisible();
    expect(document.querySelector('.markdown-resource-body__rendered')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close Resource Notes' })).toBeNull();
  });

  it('draws its text in full on the Stage', async () => {
    render(
      <WithTexts>
        <PresentedPluginResource
          resourceId="notes"
          kind="markdown"
          title="Notes"
          content={{ url: textAsset('# Notes\n\nThe whole text, on the Stage.') }}
        />
      </WithTexts>,
    );
    expect(await screen.findByText('The whole text, on the Stage.')).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('measures its text for Opening once its images have loaded', async () => {
    const complete = vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(false);
    try {
      const commitMap = vi.fn(() => Promise.resolve<Answer>('completed'));
      render(
        <WithTexts>
          <PluginResource
            {...onTheMap({
              state: 'selected',
              content: { url: textAsset('# Notes\n\n![Chart](https://example.com/chart.png)') },
              operations: { kind: 'markdown', commitMap },
            })}
          />
        </WithTexts>,
      );
      fireEvent.click(await screen.findByRole('button', { name: 'Open Resource Notes' }));
      const image = await waitFor(() => {
        const drawn = document.querySelector('[aria-hidden="true"] img');
        if (drawn === null) throw new Error('The text was not drawn to be measured.');
        return drawn;
      });
      await act(() => Promise.resolve());
      expect(commitMap).not.toHaveBeenCalled();
      fireEvent.load(image);
      await waitFor(() => expect(commitMap).toHaveBeenCalledTimes(1));
    } finally {
      complete.mockRestore();
    }
  });

  it('keeps no band clear for a rail on the Stage, which draws none', async () => {
    render(
      <WithTexts>
        <PresentedPluginResource
          resourceId="notes"
          kind="markdown"
          title="Notes"
          content={{ url: textAsset('Text on the Stage.') }}
        />
      </WithTexts>,
    );
    await screen.findByText('Text on the Stage.');
    const header = screen.getByRole('heading', { name: 'Notes' }).parentElement;
    expect(header?.style.paddingTop).toBe('0px');
  });

  it('keeps a draft up while another drawing of its Resource would Close it', async () => {
    const commitMap = vi.fn();
    /**
     * Two drawings of one Resource on one Map, as two Space Resources showing
     * that Map draw it: one Map content, and one Claim between them.
     */
    function TwoDrawings() {
      const [open, setOpen] = useState(true);
      const [holder, setHolder] = useState<symbol | null>(null);
      const operations: PluginResourceProps['operations'] = {
        kind: 'markdown',
        commitContent: () => Promise.resolve<Answer>('completed'),
        commitStore: () => Promise.resolve(textAsset('stored')),
        commitMap: (next) => {
          commitMap(next);
          setOpen(markdownPlugin.mapContent.schema.parse(next).open);
          return Promise.resolve<Answer>('completed');
        },
        claim: (drawing): PluginHostClaim | undefined => {
          if (holder !== null && holder !== drawing) return undefined;
          setHolder(drawing);
          const end = () => setHolder(null);
          return {
            release: () => {
              end();
              return true;
            },
            exclusively: () => Promise.resolve('busy'),
            unmount: end,
          };
        },
        claimHolder: (drawing) =>
          holder === null ? 'none' : holder === drawing ? 'this-drawing' : 'another-drawing',
      };
      const drawing = { state: 'selected', mapContent: { open }, operations } as const;
      const content = { url: textAsset('# Notes\n\nShared text.') };
      return (
        <>
          <PluginResource {...onTheMap({ ...drawing, content })} />
          <PluginResource {...onTheMap({ ...drawing, content })} />
        </>
      );
    }
    render(
      <WithTexts>
        <TwoDrawings />
      </WithTexts>,
    );
    const [first, second] = await screen.findAllByRole('article');
    if (first === undefined || second === undefined) throw new Error('Two drawings were drawn.');
    expect(within(second).getByRole('button', { name: 'Close Resource Notes' })).toBeEnabled();
    fireEvent.click(await within(first).findByRole('button', { name: 'Edit Resource Notes' }));
    const editing = () => first.querySelector('[data-editing="true"]');
    expect(editing()).not.toBeNull();
    // The other drawing offers nothing that could Close the Resource under the draft.
    expect(within(second).queryByRole('button', { name: 'Close Resource Notes' })).toBeNull();
    await act(() => Promise.resolve());
    expect(commitMap).not.toHaveBeenCalled();
    expect(editing()).not.toBeNull();
  });
});
