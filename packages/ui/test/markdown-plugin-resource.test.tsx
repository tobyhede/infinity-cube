import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EMPTY_ASSET } from '@project/resource-api/domain';
import { markdownPlugin } from '@project/plugin-markdown/domain';
import { PluginResource, PresentedPluginResource, type PluginResourceProps } from '../src';
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
});
