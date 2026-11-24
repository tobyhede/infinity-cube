import type { NewSpaceDefaults, NotCreated } from '../start-shell';

/** The Start window's New Space form (UI-111), as the person has it. */

export type NewSpaceForm = Readonly<NewSpaceDefaults> & {
  /**
   * Why the last Create Space wrote or opened nothing, shown where it can be
   * fixed (`describeNotCreated`), until the name changes or Browse… chooses
   * a Location.
   */
  readonly notCreated: NotCreated | null;
};

/** The folder Create Space makes: `<location>/<name>`. */
export const newSpaceFolder = (form: NewSpaceDefaults): string =>
  form.location.endsWith(form.separator)
    ? `${form.location}${form.name}`
    : `${form.location}${form.separator}${form.name}`;
