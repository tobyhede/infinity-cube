import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { uuidSchema, type ResourceDocument } from '@project/core';
import type { AssetRef } from '@project/resource-api/domain';
import type { Assets } from '@project/resource-api/view';
import { markdownPlugin } from '@project/plugin-markdown/domain';
import { PluginAssetsProvider, PluginResource, type PluginResourceProps } from '@project/ui';
import { pluginSurfaceOperations, type PluginHost } from '../src/plugin-host/plugin-commits';
import { createPluginGate } from '../src/plugin-host/plugin-gate';
import type { AuthoringResult, DrawnCompletion } from '../src/space-authoring';

const RESOURCE = uuidSchema.parse('00000000-0000-4000-8000-0000000000b1');
const TEXT: AssetRef = `/assets/${'A'.repeat(43)}`;
const DOCUMENT: ResourceDocument = { title: 'Notes', kind: 'markdown', content: { url: TEXT } };

const ASSETS: Assets = {
  url: (ref) => ref,
  read: () => Promise.resolve(new Blob(['# Notes\n\nShared text.'], { type: 'text/markdown' })),
};

/**
 * Two drawings of one Markdown Resource on one Map, as two Space Resources
 * showing that Map draw it: one Map entry, one gate, and each drawing's
 * operations built by the canvas's own `pluginSurfaceOperations` whenever the
 * gate publishes.
 */
function TwoDrawings({ onComplete }: { readonly onComplete: (c: DrawnCompletion) => void }) {
  const [open, setOpen] = useState(true);
  const host = useMemo((): PluginHost => {
    const gate = createPluginGate();
    return {
      gate,
      get claims() {
        return gate.getState();
      },
      replacementEpoch: () => 0,
      complete: (completion): AuthoringResult => {
        onComplete(completion);
        if (completion.kind === 'changed-map-content')
          setOpen(markdownPlugin.mapContent.schema.parse(completion.content).open);
        return { kind: 'completed' };
      },
      report: () => undefined,
      document: () => DOCUMENT,
      assets: { store: () => Promise.resolve(TEXT) },
    };
  }, [onComplete]);
  const chain = useSyncExternalStore(host.gate.subscribe, host.gate.getState);
  // Rebuilt whenever the gate publishes, as the canvas's decoration is.
  const { operations } = useMemo(
    () => ({
      chain,
      operations: pluginSurfaceOperations(
        'markdown',
        RESOURCE,
        { authorOnCanvas: true, editable: true },
        host,
      ),
    }),
    [host, chain],
  );
  const drawing: PluginResourceProps = {
    resourceId: RESOURCE,
    kind: 'markdown',
    title: { title: 'Notes', readOnly: false, onReturnFocus: () => undefined },
    content: { url: TEXT },
    mapContent: { open },
    outline: 'rectangle',
    state: 'selected',
    graphColor: '#ffc53d',
    readOnly: false,
    operations,
  };
  return (
    <PluginAssetsProvider value={ASSETS}>
      <PluginResource {...drawing} />
      <PluginResource {...drawing} />
    </PluginAssetsProvider>
  );
}

describe('two drawings of one Markdown Resource on the canvas', () => {
  it('keeps one drawing’s draft up: the other offers no Close, and commits nothing', async () => {
    const completed = vi.fn();
    render(<TwoDrawings onComplete={completed} />);
    const [first, second] = await screen.findAllByRole('article');
    if (first === undefined || second === undefined) throw new Error('Two drawings were drawn.');
    const otherClose = within(second).getByRole('button', { name: 'Close Resource Notes' });
    expect(otherClose).toBeEnabled();
    fireEvent.click(await within(first).findByRole('button', { name: 'Edit Resource Notes' }));
    expect(first.querySelector('[data-editing="true"]')).not.toBeNull();
    // A press on a Close kept from before the Claim reaches no commit either.
    fireEvent.click(otherClose);
    await act(() => Promise.resolve());
    expect(within(second).queryByRole('button', { name: 'Close Resource Notes' })).toBeNull();
    expect(completed).not.toHaveBeenCalled();
    expect(first.querySelector('[data-editing="true"]')).not.toBeNull();
  });
});
