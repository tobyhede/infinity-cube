import { describe, expect, it } from 'vitest';
import {
  CANVAS_KEYS,
  FULL_VIEW_KEYS,
  HELP_KEYS,
  PRESENTING_KEYS,
  type KeyBinding,
} from '../src/key-bindings';
import { shortcutOf, shortcutSections } from '../src/shortcut-sheet';

const descriptionsOf = (bindings: Readonly<Record<string, KeyBinding>>) =>
  Object.values(bindings).map(({ description }) => description);

describe('shortcutSections', () => {
  it('lists every canvas and Full View key while authoring, and the sheet’s own', () => {
    const sections = shortcutSections('authoring');

    expect(sections.map(({ title }) => title)).toEqual(['On the canvas', 'In Full View']);
    expect(
      sections.flatMap(({ shortcuts }) => shortcuts.map((entry) => entry.description)),
    ).toEqual([
      ...descriptionsOf(CANVAS_KEYS),
      ...descriptionsOf(HELP_KEYS),
      ...descriptionsOf(FULL_VIEW_KEYS),
    ]);
  });

  it('lists no Enter on the canvas, which opens no Resource', () => {
    const canvas = shortcutSections('authoring').find(({ title }) => title === 'On the canvas');
    expect(canvas?.shortcuts.filter(({ shortcut }) => shortcut.aria.includes('Enter'))).toEqual([]);
  });

  it('lists every presenting key while presenting, and the sheet’s own', () => {
    const sections = shortcutSections('presenting');

    expect(sections.map(({ title }) => title)).toEqual(['While presenting']);
    expect(
      sections.flatMap(({ shortcuts }) => shortcuts.map((entry) => entry.description)),
    ).toEqual([...descriptionsOf(PRESENTING_KEYS), ...descriptionsOf(HELP_KEYS)]);
  });
});

describe('shortcutOf', () => {
  it('announces the binding’s own aria-keyshortcuts', () => {
    expect(shortcutOf(CANVAS_KEYS.renameResource)).toEqual({
      aria: 'F2',
      presses: [['F2']],
    });
  });

  it('names the arrows and page keys as a reader reads them, each press its own', () => {
    expect(shortcutOf(PRESENTING_KEYS.advance).presses).toEqual([['→'], ['PgDn']]);
    expect(shortcutOf(FULL_VIEW_KEYS.leave).presses).toEqual([['Space'], ['Esc']]);
  });

  it('shows presses holding the same modifiers once, with their keys together', () => {
    expect(shortcutOf(CANVAS_KEYS.nudge)).toEqual({
      aria: CANVAS_KEYS.nudge.ariaKeyShortcuts,
      presses: [['Shift', '← → ↑ ↓']],
    });
  });
});
