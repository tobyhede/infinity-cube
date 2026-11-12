import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { spaceSelection, uuidSchema } from '@project/core';
import type { OpenSpace } from '../src/open-spaces';
import { useResourcePlacement } from '../src/resource-placement';
import { MAP_ID, derivationSpace, openDerivationSpace } from './app-derivation-fixtures';

/**
 * A Space Resource placed from the Resources list's Space row: the list keeps
 * the reader, so the press neither moves the caret nor publishes a notice.
 */

const AT = { x: 30, y: 40 };

const place = (opened: OpenSpace) => {
  const resolved = derivationSpace().lookup.map(MAP_ID);
  if (resolved === undefined) throw new Error('The fixture has no drawn Map.');
  return renderHook(() =>
    useResourcePlacement(opened, {
      map: resolved.map,
      presenting: false,
      replacementEpoch: 0,
      reportBreak: () => undefined,
    }),
  );
};

const spaceResources = (opened: OpenSpace) =>
  opened.session.getState().working.resources.filter(({ document }) => document.kind === 'space');

describe('a Space Resource from the Resources list', () => {
  it('names the Space it shows, and leaves the caret in the list', async () => {
    const opened = openDerivationSpace();
    const { result } = place(opened);
    await act(async () => {
      result.current.createFromDock('space');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const [first] = spaceResources(opened);
    const shown = first === undefined ? undefined : spaceSelection(first.document);
    if (shown === undefined) throw new Error('No Space was made.');
    act(() => opened.app.continuation.take());

    let answer: string | null = 'unanswered';
    await act(async () => {
      answer = await result.current.addSpaceResourceFor(
        { id: uuidSchema.parse(shown.spaceId), title: 'Space 1' },
        AT,
      );
    });

    expect(answer).toBeNull();
    expect(spaceResources(opened).map(({ document }) => document.title)).toEqual([
      'Space 1',
      'Space 1',
    ]);
    expect(opened.app.continuation.getState().pending).toBeNull();
    expect(opened.app.commandOutcomes.getState().notices.size).toBe(0);
  });
});
