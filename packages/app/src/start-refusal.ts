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

/** The sentence for `notCreated`, worded from the attempt that met it, and where it shows. */
export function describeNotCreated(
  notCreated: NotCreated,
  attempt: CreateSpaceAttempt,
): StartRefusalWords {
  const location = lastFolder(attempt.location, attempt.separator);
  switch (notCreated.of) {
    case 'name':
      return onName(notCreated.message);
    case 'folder':
      return onName(
        `${location} already has a folder called ${attempt.name} with files in it. Choose another name.`,
      );
    case 'no-permission':
      return onLocation(
        `You don’t have permission to create folders in ${location}. Choose another Location.`,
        notCreated.detail,
      );
    case 'read-only':
      return onLocation(
        `${location} is read-only, so nothing can be created there. Choose another Location.`,
        notCreated.detail,
      );
    case 'location-gone':
      return onLocation(
        `${location} can’t be found. It may have been moved, or its disk removed. Choose another Location.`,
        notCreated.detail,
      );
    case 'disk-full':
      return notice(
        notCreated.kept
          ? `There isn’t enough space on the disk to create the Space. Part of it was left in the folder ${attempt.name}.`
          : 'There isn’t enough space on the disk to create the Space. Nothing was kept.',
        notCreated.detail,
      );
    case 'failed':
      return notice(
        notCreated.kept
          ? `The Space couldn’t be created, and part of it was left in the folder ${attempt.name}. Choose another name or Location.`
          : 'The Space couldn’t be created. Try again, or choose another name or Location.',
        notCreated.detail,
      );
    case 'not-opened':
      return {
        place: 'notice',
        sentence: 'The Space was created but couldn’t be opened. Its folder is kept.',
        detail: notCreated.detail,
        openFolder: notCreated.folder,
      };
  }
}
