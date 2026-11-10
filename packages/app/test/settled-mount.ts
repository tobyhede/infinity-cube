import type { ReactElement } from 'react';
import { act, queries, render, type RenderResult } from '@testing-library/react';
import { TestAssets } from './markdown-texts';

/**
 * Render, and let the mount finish before answering.
 *
 * A canvas mount is not finished when `render` returns. Base UI's slider thumb
 * — the canvas's zoom control, drawn with `thumbAlignment="edge"` — measures
 * itself on a microtask its mount layout effect queues, and writes the result
 * into slider state. `render` flushes synchronously, so that microtask lands
 * after the render's `act` has closed, as an update no test boundary owns.
 * Rendering inside an asynchronous `act` holds the boundary open until the
 * mount's queued work has run. The unowned-update guard `vitest.setup.ts`
 * installs is what holds this: a canvas test that mounts with a bare `render`
 * fails on the slider's report.
 *
 * It draws inside the test asset store, so a Markdown Resource reads its text.
 */
export const mountSettled = async (ui: ReactElement): Promise<RenderResult> => {
  let view: RenderResult | undefined;
  await act(async () => {
    view = render(ui, { wrapper: TestAssets, queries });
    await Promise.resolve();
  });
  if (view === undefined) throw new Error('render answered nothing');
  return view;
};
