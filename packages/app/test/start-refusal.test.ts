import { describe, expect, it } from 'vitest';
import { describeNotCreated } from '../src/start-refusal';
import type { NotCreated } from '../src/start-shell';

const AT = { location: '/Users/ada/Documents', separator: '/', name: 'Untitled Space' };

describe('the Start window’s sentences for Create Space', () => {
  it('shows a name that is not one folder name on Name, in the shell’s sentence', () => {
    expect(describeNotCreated({ of: 'name', message: 'A name is one folder name.' }, AT)).toEqual({
      place: 'name',
      sentence: 'A name is one folder name.',
      detail: null,
      openFolder: null,
    });
  });

  it('shows a folder that holds files on Name, naming the Location’s last folder and the name', () => {
    expect(describeNotCreated({ of: 'folder' }, AT)).toEqual({
      place: 'name',
      sentence:
        'Documents already has a folder called Untitled Space with files in it. Choose another name.',
      detail: null,
      openFolder: null,
    });
  });

  it('shows each cause another Location fixes on Location, with the system’s words as detail', () => {
    const at = { location: '/Volumes/Archive/', separator: '/', name: 'Untitled Space 3' };
    const cases: readonly [NotCreated, string, string][] = [
      [
        { of: 'no-permission', detail: 'Permission denied (os error 13)' },
        'You don’t have permission to create folders in Archive. Choose another Location.',
        'Permission denied (os error 13)',
      ],
      [
        { of: 'read-only', detail: 'Read-only file system (os error 30)' },
        'Archive is read-only, so nothing can be created there. Choose another Location.',
        'Read-only file system (os error 30)',
      ],
      [
        { of: 'location-gone', detail: 'Not a directory (os error 20)' },
        'Archive can’t be found. It may have been moved, or its disk removed. Choose another Location.',
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
    ).toBe('C:\\ is read-only, so nothing can be created there. Choose another Location.');
  });

  it('says nothing was kept only when nothing was', () => {
    const notice = (notCreated: NotCreated) => describeNotCreated(notCreated, AT);
    expect(notice({ of: 'disk-full', detail: 'No space left', kept: false })).toEqual({
      place: 'notice',
      sentence: 'There isn’t enough space on the disk to create the Space. Nothing was kept.',
      detail: 'No space left',
      openFolder: null,
    });
    expect(notice({ of: 'disk-full', detail: 'No space left', kept: true }).sentence).toBe(
      'There isn’t enough space on the disk to create the Space. Part of it was left in the folder Untitled Space.',
    );
    expect(notice({ of: 'failed', detail: 'Input/output error', kept: false })).toEqual({
      place: 'notice',
      sentence: 'The Space couldn’t be created. Try again, or choose another name or Location.',
      detail: 'Input/output error',
      openFolder: null,
    });
    expect(notice({ of: 'failed', detail: 'Input/output error', kept: true }).sentence).toBe(
      'The Space couldn’t be created, and part of it was left in the folder Untitled Space. Choose another name or Location.',
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
      sentence: 'The Space was created but couldn’t be opened. Its folder is kept.',
      detail: 'Could not open it',
      openFolder: '/Users/ada/Documents/Untitled Space',
    });
  });
});
