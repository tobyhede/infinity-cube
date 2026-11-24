import type { NotCreated } from './start-shell';

/**
 * Every sentence the Start window's New Space form shows about a Create
 * Space that wrote or opened nothing (UI-89, UI-111), keyed by the shell's
 * stable code (`NotCreated::to_page` in `start.rs`), and where each shows:
 * on Name, on Location, or as a notice above the form's buttons. The
 * system's own words are the detail, shown only behind Details, and only
 * where a system error caused it.
 *
 * The Start window is a page of its own (`start.html`) with codes of its
 * own, so its sentences live here rather than in `authoring-refusal.ts`,
 * which words a Space's refusals and would bring the Space application into
 * this page.
 */

/** Where a sentence shows: the field that fixes it, or a notice. */
export type StartRefusalPlace = 'name' | 'location' | 'notice';

export interface StartRefusalWords {
  readonly place: StartRefusalPlace;
  readonly sentence: string;
  /** The system's words, behind Details; `null` where no system error caused it. */
  readonly detail: string | null;
  /** The folder Open Folder… opens: a Space written and not opened. */
  readonly openFolder: string | null;
}

/** What the form sent when Create Space was pressed. */
export interface CreateSpaceAttempt {
  readonly location: string;
  readonly separator: string;
  readonly name: string;
}

/**
 * The Location's last folder, as a person names it: `Documents` for
 * `/Users/ada/Documents`. A root names itself whole: `/`, or `C:\`, whose one
 * segment is the drive rather than a folder.
 */
const lastFolder = (location: string, separator: string): string => {
  const folders = location.split(separator).filter((folder) => folder !== '');
  const last = folders.at(-1);
  const underRoot = folders.length > 1 || location.startsWith(separator);
  return underRoot && last !== undefined ? last : location;
};

const onName = (sentence: string): StartRefusalWords => ({
  place: 'name',
  sentence,
  detail: null,
  openFolder: null,
});

const onLocation = (sentence: string, detail: string): StartRefusalWords => ({
  place: 'location',
  sentence,
  detail,
  openFolder: null,
});

const notice = (sentence: string, detail: string): StartRefusalWords => ({
  place: 'notice',
  sentence,
  detail,
  openFolder: null,
});

/**
 * The sentence for a name that is not one folder name, by the case the name
 * meets: empty, only dots, or holding a separator (`new_space_folder`'s
 * `NotAFolderName`).
 */
function notAFolderName(name: string): string {
  if (name === '') return 'Give your Space a name.';
  if (name === '.' || name === '..') return 'A name can’t be only dots. Add a word.';
  const separator = name.includes('/') ? '/' : '\\';
  return `A name can’t hold “${separator}”, because it separates folders. Try a dash instead.`;
}

/** The sentence for a name the shell refused by one of its rules, on Name. */
function nameSentence(
  refused: Extract<NotCreated, { of: 'name' }>,
  location: string,
  name: string,
): string {
  switch (refused.rule) {
    case 'not-a-folder-name':
      return notAFolderName(name);
    case 'forbidden-character':
      return `A name can’t hold “${refused.character}” on Windows. Remove it, or try a dash instead.`;
    case 'reserved':
      return `Windows keeps “${name}” for a device. Add a word to it, or choose another name.`;
    case 'trailing-dot-or-space':
      return 'A name can’t end in a dot or a space on Windows. Remove it.';
    case 'taken-by-a-file':
      return `${location} already has a file called “${name}”. Choose another name.`;
  }
}

/** The sentence for `notCreated`, worded from the attempt that met it, and where it shows. */
export function describeNotCreated(
  notCreated: NotCreated,
  attempt: CreateSpaceAttempt,
): StartRefusalWords {
  const location = lastFolder(attempt.location, attempt.separator);
  switch (notCreated.of) {
    case 'name':
      return onName(nameSentence(notCreated, location, attempt.name));
    case 'folder':
      return onName(
        `${location} already has a folder called “${attempt.name}” with files in it. Choose another name.`,
      );
    case 'no-permission':
      return onLocation(
        `You can’t create folders in ${location}. Choose another location.`,
        notCreated.detail,
      );
    case 'read-only':
      return onLocation(`${location} is read-only. Choose another location.`, notCreated.detail);
    case 'location-gone':
      return onLocation(
        `${location} can’t be found. It may have been moved, or its disk removed. Choose another location.`,
        notCreated.detail,
      );
    case 'disk-full':
      return notice(
        notCreated.kept
          ? `The disk is full, so the Space wasn’t finished. Part of it is in the folder “${attempt.name}”. Free up some space and choose another name.`
          : 'The disk is full, so the Space wasn’t created. Free up some space and try again.',
        notCreated.detail,
      );
    case 'failed':
      return notice(
        notCreated.kept
          ? `The Space couldn’t be finished. Part of it is in the folder “${attempt.name}”. Choose another name or location.`
          : 'The Space couldn’t be created. Try again, or choose another name or location.',
        notCreated.detail,
      );
    case 'not-opened':
      return {
        place: 'notice',
        sentence: 'The Space was created but couldn’t be opened.',
        detail: notCreated.detail,
        openFolder: notCreated.folder,
      };
  }
}
