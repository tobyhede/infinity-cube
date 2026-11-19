import type { SpaceSnapshot } from '@project/core';
import type { IntakeLocation, SpaceAggregateError, SpaceError } from '@project/graph';

/**
 * Every kind of refusal Importing an Aggregate directory or deciding a commit
 * can answer, named from the intake's own error types, never from message text
 * (ADR 0156). The closed list `conformance/intake/README.md` writes down;
 * `test/unit/intake-conformance.test.ts` holds the two to each other.
 *
 * The directory reader's kinds come first: it reports its own refusals in
 * these words. Then each kind of `SpaceError` (the single-Space intake), and
 * each kind of `SpaceAggregateError` but `invalid-space-snapshot`, which is not
 * a fault of its own but a carrier for the Space's `SpaceError`s.
 */
export const INTAKE_REFUSAL_KINDS = [
  'aggregate-file-missing',
  'unreadable',
  'symbolic-link',
  'space-directory-name',
  'space-id-mismatch',
  'asset-refused',
  'asset-file-name',
  'duplicate-asset',
  'invalid-json',
  'invalid-shape',
  'invalid-resource-file',
  'unsupported-version',
  'retired-space-graphs',
  'duplicate-resource-id',
  'duplicate-graph-id',
  'duplicate-map-id',
  'map-member-missing-resource',
  'map-active-graph-missing',
  'map-active-graph-outside-map',
  'graph-edge-missing-resource',
  'graph-edge-resource-outside-map',
  'unresolved-default-map',
  'duplicate-graph-edge',
  'reference-targets-self',
  'reference-target-missing',
  'reference-target-not-targetable',
  'space-reference-cycle',
  'map-content-invalid',
  'duplicate-space-id',
  'meta-space-missing',
  'space-reference-missing',
  'ordinary-space-unreferenced',
  'space-resource-map-missing',
  'space-resource-graph-missing',
  'space-resource-graph-outside-map',
] as const;

export type IntakeRefusalKind = (typeof INTAKE_REFUSAL_KINDS)[number];

/*
 * Compile-time proof the list names every kind either intake answers: a kind
 * added to `SpaceError` or `SpaceAggregateError` without a place here fails to
 * typecheck rather than reaching a refusal no list holds.
 */
type Unlisted = Exclude<
  SpaceError['kind'] | Exclude<SpaceAggregateError['kind'], 'invalid-space-snapshot'>,
  IntakeRefusalKind
>;
const everyIntakeKindListed: [Unlisted] extends [never] ? true : Unlisted = true;
void everyIntakeKindListed;

/**
 * One refusal of an Aggregate directory or a commit, where it is, in the terms
 * of {@link IntakeLocation} but with `file` relative to the Aggregate directory
 * (`aggregate.json`, `<space id>/space.json`, `<space id>/resources/<id>.json`,
 * `assets/<name>`), `/` between segments. A directory-level fault names the
 * directory, and the Aggregate directory itself is `.`.
 */
export interface IntakeRefusal extends IntakeLocation {
  readonly kind: IntakeRefusalKind;
}

/**
 * `refusal` with its file moved under `directory`, a path relative to the
 * Aggregate directory. Under `.`, the Aggregate directory itself, it stays as it is.
 */
export const within = (directory: string, refusal: IntakeRefusal): IntakeRefusal =>
  directory === '.' ? refusal : { ...refusal, file: `${directory}/${refusal.file}` };

/**
 * A single-Space intake refusal, located inside the Space directory `directory`.
 *
 * Only a refusal intake made is located here, and its type carries `at`; one
 * decoded off the HTTP wire is a `WireSpaceError`, which has none.
 */
export const spaceErrorRefusal = (directory: string, error: SpaceError): IntakeRefusal =>
  within(directory, { kind: error.kind, ...error.at });

/** The Resource file of `resourceId` in the Space directory of `spaceId`. */
const resourceFile = (spaceId: string, resourceId: string): IntakeRefusal['file'] =>
  `${spaceId}/resources/${resourceId}.json`;

/**
 * Where each aggregate refusal is, by the rules `conformance/intake/README.md`
 * writes down. `spaces` are the snapshots intake was handed, in order, which
 * an `invalid-space-snapshot`'s index is resolved against; an index none of
 * them has means `spaces` are not what intake was handed, and throws.
 */
export const locateAggregateRefusal = (
  errors: readonly SpaceAggregateError[],
  spaces: readonly SpaceSnapshot[],
): readonly IntakeRefusal[] =>
  errors.flatMap((error): readonly IntakeRefusal[] => {
    switch (error.kind) {
      case 'invalid-space-snapshot': {
        const space = spaces[error.snapshotIndex];
        if (space === undefined) {
          throw new Error(`No Space intake was handed is at index ${error.snapshotIndex}`);
        }
        return error.errors.map((nested) => spaceErrorRefusal(space.id, nested));
      }
      case 'duplicate-space-id':
        return [{ kind: error.kind, file: `${error.spaceId}/space.json`, id: error.spaceId }];
      case 'duplicate-resource-id':
        // Every Space after the first claiming it, in the order intake read them.
        return error.spaceIds.slice(1).map((spaceId) => ({
          kind: error.kind,
          file: resourceFile(spaceId, error.resourceId),
          id: error.resourceId,
        }));
      case 'meta-space-missing':
        return [{ kind: error.kind, file: 'aggregate.json', field: 'metaSpaceId' }];
      case 'ordinary-space-unreferenced':
        return [{ kind: error.kind, file: `${error.spaceId}/space.json`, id: error.spaceId }];
      case 'space-reference-missing':
      case 'space-reference-cycle':
      case 'space-resource-map-missing':
      case 'space-resource-graph-missing':
      case 'space-resource-graph-outside-map':
        return [
          {
            kind: error.kind,
            file: resourceFile(error.spaceId, error.resourceId),
            id: error.resourceId,
          },
        ];
    }
  });
