/** The Start window's New Space form (UI-111), as the person has it. */

export interface NewSpaceForm {
  readonly name: string;
  /** The folder the new Space's folder goes in. */
  readonly location: string;
  /** The platform's path separator, for naming `<location>/<name>`. */
  readonly separator: string;
  /**
   * Why Create Space was refused, shown beside Name: `name`, not one folder
   * name, so no folder is named; `folder`, `<location>/<name>` holds
   * something.
   */
  readonly refusal: { readonly of: 'name' | 'folder'; readonly message: string } | null;
  /** Why the write failed after the name and Location were accepted. */
  readonly failure: string | null;
}

/** The folder Create Space makes: `<location>/<name>`. */
export const newSpaceFolder = (form: NewSpaceForm): string =>
  form.location.endsWith(form.separator)
    ? `${form.location}${form.name}`
    : `${form.location}${form.separator}${form.name}`;
