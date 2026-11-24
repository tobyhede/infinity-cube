import type { NotCreated } from '../start-shell';

/** The Start window's New Space form (UI-111), as the person has it. */

export interface NewSpaceForm {
  readonly name: string;
  /** The folder the new Space's folder goes in. */
  readonly location: string;
  /** The platform's path separator, for naming `<location>/<name>`. */
  readonly separator: string;
  /**
   * Why the last Create Space wrote or opened nothing, shown where it can be
   * fixed (`describeNotCreated`), until the name changes or Browse… chooses
   * a Location.
   */
  readonly notCreated: NotCreated | null;
}

/** The folder Create Space makes: `<location>/<name>`. */
export const newSpaceFolder = (form: NewSpaceForm): string =>
  form.location.endsWith(form.separator)
    ? `${form.location}${form.name}`
    : `${form.location}${form.separator}${form.name}`;
