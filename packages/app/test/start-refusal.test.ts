import type { JsonValue } from '@project/core';
import { describe, expect, it } from 'vitest';
import { describeNotCreated } from '../src/start-refusal';
import { tauriStartShell, type NotCreated } from '../src/start-shell';

const AT = { location: '/Users/ada/Documents', separator: '/', name: 'Untitled Space' };

/** `answer` as the page reads it from the shell's Create Space. */
async function fromShell(answer: JsonValue): Promise<NotCreated> {
  const read = await tauriStartShell({ invoke: () => Promise.resolve(answer) }).createSpace(
    AT.location,
    AT.name,
  );
  if (read === null) throw new Error('the shell answered that the Space opened');
  return read;
}

describe('the Start window’s sentences for Create Space', () => {
  it('shows a file holding the name on Name, naming the Location’s last folder and the name', () => {
    expect(describeNotCreated({ of: 'name', rule: 'taken-by-a-file' }, AT)).toEqual({
      place: 'name',
      sentence: 'Documents already has a file called “Untitled Space”. Choose another name.',
      detail: null,
      openFolder: null,
    });
  });

  it('words a name that is not one folder name by the case the name meets, on Name', async () => {
    const refused = await fromShell({ of: 'name', rule: 'not-a-folder-name' });
    const cases: readonly [string, string][] = [
      ['', 'Give your Space a name.'],
      ['.', 'A name can’t be only dots. Add a word.'],
      ['..', 'A name can’t be only dots. Add a word.'],
      ['Q3/Q4 review', 'A name can’t hold “/”, because it separates folders. Try a dash instead.'],
      [
        'Q3\\Q4 review',
        'A name can’t hold “\\”, because it separates folders. Try a dash instead.',
      ],
    ];
    for (const [name, sentence] of cases) {
      expect(describeNotCreated(refused, { ...AT, name })).toEqual({
        place: 'name',
        sentence,
        detail: null,
        openFolder: null,
      });
    }
  });

  it('words each Windows name rule on Name, quoting what was typed, then what to do', async () => {
    const windows: readonly JsonValue[] = [
      { of: 'name', rule: 'forbidden-character', character: ':' },
      { of: 'name', rule: 'reserved' },
      { of: 'name', rule: 'trailing-dot-or-space' },
    ];
    const sentences = new Set<string>();
    for (const answer of windows) {
      const words = describeNotCreated(await fromShell(answer), AT);
      expect(words.place).toBe('name');
      expect(words.detail).toBeNull();
      // A reason, then what to do: a sentence of its own after it.
      expect(words.sentence).toMatch(/\. \p{Lu}[^.]*\.$/u);
      sentences.add(words.sentence);
    }
    expect(sentences.size).toBe(windows.length);
    expect(
      describeNotCreated(
        await fromShell({ of: 'name', rule: 'forbidden-character', character: ':' }),
        AT,
      ).sentence,
    ).toBe('A name can’t hold “:” on Windows. Remove it, or try a dash instead.');
    expect(
      describeNotCreated(await fromShell({ of: 'name', rule: 'reserved' }), { ...AT, name: 'CON' })
        .sentence,
    ).toBe('Windows keeps “CON” for a device. Add a word to it, or choose another name.');
  });

  it('shows a folder that holds files on Name, naming the Location’s last folder and the name', () => {
    expect(describeNotCreated({ of: 'folder' }, AT)).toEqual({
      place: 'name',
      sentence:
        'Documents already has a folder called “Untitled Space” with files in it. Choose another name.',
      detail: null,
      openFolder: null,
    });
  });

  it('shows each cause another Location fixes on Location, with the system’s words as detail', () => {
    const at = { location: '/Volumes/Archive/', separator: '/', name: 'Untitled Space 3' };
    const cases: readonly [NotCreated, string, string][] = [
      [
        { of: 'no-permission', detail: 'Permission denied (os error 13)' },
        'You can’t create folders in Archive. Choose another location.',
        'Permission denied (os error 13)',
      ],
      [
        { of: 'read-only', detail: 'Read-only file system (os error 30)' },
        'Archive is read-only. Choose another location.',
        'Read-only file system (os error 30)',
      ],
      [
        { of: 'location-gone', detail: 'Not a directory (os error 20)' },
        'Archive can’t be found. It may have been moved, or its disk removed. Choose another location.',
        'Not a directory (os error 20)',
      ],
    ];
    for (const [notCreated, sentence, detail] of cases) {
      expect(describeNotCreated(notCreated, at)).toEqual({
        place: 'location',
        sentence,
        detail,
        openFolder: null,
      });
    }
  });

  it('names a Location with no last folder in full', () => {
    expect(
      describeNotCreated(
        { of: 'read-only', detail: 'd' },
        { location: 'C:\\', separator: '\\', name: 'Deck' },
      ).sentence,
    ).toBe('C:\\ is read-only. Choose another location.');
  });

  it('says part of the Space is left in its folder only when it is, and what to do either way', () => {
    const notice = (notCreated: NotCreated) => describeNotCreated(notCreated, AT);
    expect(notice({ of: 'disk-full', detail: 'No space left', kept: false })).toEqual({
      place: 'notice',
      sentence: 'The disk is full, so the Space wasn’t created. Free up some space and try again.',
      detail: 'No space left',
      openFolder: null,
    });
    expect(notice({ of: 'disk-full', detail: 'No space left', kept: true }).sentence).toBe(
      'The disk is full, so the Space wasn’t finished. Part of it is in the folder “Untitled Space”. Free up some space and choose another name.',
    );
    expect(notice({ of: 'failed', detail: 'Input/output error', kept: false })).toEqual({
      place: 'notice',
      sentence: 'The Space couldn’t be created. Try again, or choose another name or location.',
      detail: 'Input/output error',
      openFolder: null,
    });
    expect(notice({ of: 'failed', detail: 'Input/output error', kept: true }).sentence).toBe(
      'The Space couldn’t be finished. Part of it is in the folder “Untitled Space”. Choose another name or location.',
    );
  });

  it('offers to open the folder of a Space written and not opened', () => {
    expect(
      describeNotCreated(
        {
          of: 'not-opened',
          folder: '/Users/ada/Documents/Untitled Space',
          detail: 'Could not open it',
        },
        AT,
      ),
    ).toEqual({
      place: 'notice',
      sentence: 'The Space was created but couldn’t be opened.',
      detail: 'Could not open it',
      openFolder: '/Users/ada/Documents/Untitled Space',
    });
  });
});
