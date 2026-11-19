import { createHash } from 'node:crypto';
import { uuidSchema, type UUID } from '@project/core';
import { productDestinationPath } from '@project/http';
import {
  decodeLoadedSpace,
  decodeProblemDetails,
  encodeCommitRequest,
  problemCatalogue,
  type InfinityCubeProblemCode,
  type LoadedSpace,
  type ProblemError,
  type SpaceChange,
} from '@project/persistence';
import { expect } from 'vitest';
import { META_SPACE_ID } from './fixture';
import { send, type ConformanceHost } from './host';

/**
 * What the cases share: how a response is read and judged, and the requests
 * more than one case sends. Each expectation names the source of truth it is
 * checked against; the wire is what those modules decide, and a host in any
 * language is held to it.
 */

export const META = uuidSchema.parse(META_SPACE_ID);

/** The product address of a Space: `productDestinationPath` (`packages/http/src/product-destination.ts`). */
export const spaceAddress = (spaceId: UUID): string =>
  productDestinationPath({ kind: 'space', spaceId });

/** The unpadded base64url SHA-256 of the bytes: an asset's hash (`packages/persistence/src/assets.ts`). */
export const assetHash = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('base64url');

/**
 * A Problem Details answer under `code`, as `problemCatalogue`
 * (`packages/persistence/src/http-protocol.ts`) states it: its status, its
 * `application/problem+json` type, and a body naming the code's type, title and
 * status with a non-empty detail, and, when `errors` is given, exactly those
 * errors.
 */
export const expectProblem = async (
  response: Response,
  code: InfinityCubeProblemCode,
  errors?: readonly ProblemError[],
): Promise<void> => {
  const entry = problemCatalogue[code];
  expect(response.status).toBe(entry.status);
  expect(response.headers.get('content-type')).toBe('application/problem+json');
  const body = decodeProblemDetails(await response.json());
  expect(body).toMatchObject({ type: entry.type, title: entry.title, status: entry.status });
  expect(body.detail).not.toBe('');
  if (errors !== undefined) expect(body.errors).toEqual(errors);
};

/** The transport policy every API answer carries (`applyTransportPolicy`, `packages/http/src/index.ts`). */
export const expectApiPolicy = (response: Response): void => {
  expect(response.headers.get('cache-control')).toBe('no-store');
};

export const expectJson = (response: Response): void => {
  expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
};

/** A product address's refusal, read as HTML when the request accepts it (`packages/aggregate/src/space-host.ts`). */
export const expectHtmlProblem = async (response: Response, status: number): Promise<void> => {
  expect(response.status).toBe(status);
  expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
  expect(await response.text()).toMatch(/^<!doctype html>/);
};

export const loadSpace = async (host: ConformanceHost, spaceId: UUID): Promise<LoadedSpace> => {
  const response = await send(host, `/api/spaces/${spaceId}`);
  expect(response.status).toBe(200);
  return decodeLoadedSpace(await response.json());
};

/** The change renaming a loaded Space. */
export const renameChange = (loaded: LoadedSpace, title: string): SpaceChange => ({
  kind: 'update',
  spaceId: loaded.snapshot.id,
  snapshot: { ...loaded.snapshot, document: { ...loaded.snapshot.document, title } },
  expectedRevision: loaded.revision,
});

/** The JSON text of a commit renaming a loaded Space, as the browser sends it. */
export const renameCommitText = (loaded: LoadedSpace, title: string): string =>
  JSON.stringify(encodeCommitRequest({ changes: [renameChange(loaded, title)] }));

export const postCommit = (
  host: ConformanceHost,
  body: string | Uint8Array<ArrayBuffer>,
  contentType = 'application/json',
): Promise<Response> =>
  send(host, '/api/spaces', { method: 'POST', headers: { 'content-type': contentType }, body });

/** Rename a Space through the API, as one Edit, and expect it committed. */
export const renameSpace = async (
  host: ConformanceHost,
  spaceId: UUID,
  title: string,
): Promise<void> => {
  const response = await postCommit(host, renameCommitText(await loadSpace(host, spaceId), title));
  expect(response.status).toBe(200);
};
