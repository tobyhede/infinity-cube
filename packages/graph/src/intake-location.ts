/**
 * Where a refusal is, in the terms an author holding the Space directory acts
 * on (ADR 0156): the two runtimes' intakes must agree on this and on the
 * refusal's kind, never on its message.
 *
 * Absent from a refusal decoded off the HTTP wire, which carries kind, ids and
 * message but not this; every refusal intake itself makes carries one. The
 * rules are written out in `conformance/intake/README.md`.
 */
export interface IntakeLocation {
  /**
   * The file, by path relative to the Space directory: `space.json`, or a
   * Resource's `resources/<id>.json`; a fault in a stored snapshot's
   * `resources` itself names the `resources` directory. `loadSpace`'s Resource
   * file faults name the path the caller gave the file under.
   */
  readonly file: string;
  /**
   * The id of the entity holding the fault — a Map, a Graph, a Resource or the
   * Space — or the id repeated, for a repeated id. Absent for a shape fault,
   * whose `field` is a path from the file's root.
   */
  readonly id?: string;
  /**
   * The field at fault: a path relative to the entity `id` names, or to the
   * file when there is no `id`, as Zod reports it, joined with `.`.
   */
  readonly field?: string;
  /** An Edge, which has no id, is named by its endpoints within the Graph `id` names. */
  readonly edge?: { readonly from: string; readonly to: string };
}

/** A Zod issue path as the `field` of a location. Absent at the root. */
export const fieldOf = (path: readonly PropertyKey[]): string | undefined =>
  path.length === 0 ? undefined : path.map(String).join('.');

/** A location, leaving out a field that is absent rather than writing it as `undefined`. */
export const located = (file: string, field: string | undefined): IntakeLocation =>
  field === undefined ? { file } : { file, field };
