import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

/*
 * A close's question page (`ui/closing.html` and `ui/closing.js`, Storage
 * ST-122), run in jsdom as the shell's webview runs it: the page's body, the
 * script inline, and the places still closing named in the fragment as
 * `question.rs` encodes them. A folder is named by its path; a database by
 * `sqlite:` and its file's path, or `postgres:` and its identity
 * (`database.rs`, ADR 0181).
 */

const read = (file: string): string =>
  readFileSync(join(import.meta.dirname, '..', 'ui', file), 'utf8');

const page = new DOMParser().parseFromString(read('closing.html'), 'text/html');
const script = read('closing.js');

/** Show the question for `places`, answering any command it sends. */
function ask(places: readonly string[]): void {
  Object.defineProperty(window, '__TAURI__', {
    configurable: true,
    value: { core: { invoke: () => Promise.resolve(null) } },
  });
  window.history.replaceState(null, '', `#${places.map(encodeURIComponent).join(',')}`);
  document.body.innerHTML = page.body.innerHTML;
  const element = document.createElement('script');
  element.textContent = script;
  document.body.append(element);
}

const text = (id: string): string => document.getElementById(id)?.textContent ?? '';
const named = (): string[] =>
  [...document.querySelectorAll('#folders li')].map((item) => item.textContent);

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('a close’s question', () => {
  it('names a folder still writing and says its unwritten edits are lost', () => {
    ask(['/home/ada/Slides']);

    expect(named()).toEqual(['/home/ada/Slides']);
    expect(text('lead')).toContain('writing the last edits to this folder');
    expect(text('consequence')).toBe(
      'Close without saving, and the edits not yet written to it are lost.',
    );
  });

  it('names a SQLite file by its path and says a change under way may or may not be committed', () => {
    ask(['sqlite:/home/ada/cube.db']);

    expect(named()).toEqual(['the SQLite file /home/ada/cube.db']);
    expect(text('lead')).toContain('this database');
    expect(text('consequence')).toBe(
      'Close without saving, and each change still under way may or may not be committed.',
    );
  });

  it('names a PostgreSQL database by its identity', () => {
    ask(['postgres:ada@db.example:5432/slides', 'postgres:ada@db.example:5432/notes']);

    expect(named()).toEqual([
      'the PostgreSQL database ada@db.example:5432/slides',
      'the PostgreSQL database ada@db.example:5432/notes',
    ]);
    expect(text('lead')).toContain('these databases');
  });

  it('says what each kind loses when a quit names folders and databases together', () => {
    ask(['/home/ada/Slides', 'sqlite:/home/ada/cube.db']);

    expect(named()).toEqual(['/home/ada/Slides', 'the SQLite file /home/ada/cube.db']);
    expect(text('lead')).toContain('these:');
    expect(text('consequence')).toBe(
      'Close without saving, and the edits not yet written to a folder are lost, and each change still under way in a database may or may not be committed.',
    );
  });
});
