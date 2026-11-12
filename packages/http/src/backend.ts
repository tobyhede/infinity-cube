import { assetRefHash, isAssetHash, type AssetRef, type UUID } from '@project/core';
import {
  CANONICAL_DECIMAL,
  commitOutcomeDecoder,
  decodeLoadedAggregate,
  decodeProblemDetails,
  decodeSpaceSummaries,
  decodeLoadedSpace,
  decodeStoredAssetUrl,
  encodeCommitRequest,
  ASSET_ABSENT,
  ASSET_MEDIA_TYPE_HEADER,
  ASSET_TOO_LARGE,
  MAX_ASSET_BYTES,
  normalizeMediaType,
  problemCodeForType,
  type AssetClient,
  type AssetRefusal,
  type CommitResult,
  type LoadedSpace,
  type ProblemDetails,
  type ProtocolFault,
  type SpaceBackend,
  type SpaceSummary,
} from '@project/persistence';
import { parse as parseContentType } from 'content-type';
import { hc } from 'hono/client';
import type { SpaceHttpApp } from './index';
import { hasValidUniqueMediaTypeParameters } from './media-type';

type SpaceHttpClient = ReturnType<typeof hc<SpaceHttpApp>>;

const protocolFailure = (fault: ProtocolFault): CommitResult => ({
  kind: 'permanent-failure',
  code: 'protocol',
  fault,
});

/** Media-type essence match, so a charset or other parameter doesn't fail an otherwise-valid response. */
const hasProblemDetailsMediaType = (response: Response): boolean => {
  const contentType = response.headers.get('Content-Type');
  if (contentType === null || !hasValidUniqueMediaTypeParameters(contentType)) return false;
  return parseContentType(contentType).type === 'application/problem+json';
};

export interface HttpSpaceBackendOptions {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  /** The budget for sending an asset, which may be up to `MAX_ASSET_BYTES` over the author's uplink. */
  uploadTimeoutMs?: number;
}

export class HttpSpaceBackend implements SpaceBackend {
  readonly #baseUrl: string;
  readonly #fetch: typeof globalThis.fetch;
  readonly #timeoutMs: number;
  readonly #uploadTimeoutMs: number;

  constructor(baseUrl = '/', options: HttpSpaceBackendOptions = {}) {
    this.#baseUrl = baseUrl;
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.#timeoutMs = options.timeoutMs ?? 10_000;
    // Two minutes carries a full-size asset over an uplink of about 0.7 Mbps.
    this.#uploadTimeoutMs = options.uploadTimeoutMs ?? 120_000;
  }

  /** Keep the timeout armed until the untrusted response body is decoded. */
  async #timedRequest<T>(
    request: (client: SpaceHttpClient) => Promise<Response>,
    consume: (response: Response, signal: AbortSignal) => Promise<T>,
    timeoutMs: number = this.#timeoutMs,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const client = hc<SpaceHttpApp>(this.#baseUrl, {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          this.#fetch(input, { ...init, signal: controller.signal }),
      });
      return await consume(await request(client), controller.signal);
    } catch (error) {
      if (controller.signal.aborted) throw new HttpTimeoutError();
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  listSpaces(): Promise<readonly SpaceSummary[]> {
    return this.#timedRequest(
      (client) => client.api.spaces.$get(),
      async (response) => {
        if (!response.ok) throw new Error(`Unable to list spaces: HTTP ${response.status}`);
        return decodeSpaceSummaries(await response.json());
      },
    );
  }

  loadSpace(id: UUID): Promise<LoadedSpace | undefined> {
    return this.#timedRequest(
      (client) => client.api.spaces[':id'].$get({ param: { id } }),
      async (response) => {
        if (response.status === 404) return undefined;
        if (!response.ok) throw new Error(`Unable to load space: HTTP ${response.status}`);
        return decodeLoadedSpace(await response.json());
      },
    );
  }

  loadAggregate(): ReturnType<SpaceBackend['loadAggregate']> {
    return this.#timedRequest(
      (client) => client.api.aggregate.$get(),
      async (response) => {
        if (!response.ok) throw new Error(`Unable to load aggregate: HTTP ${response.status}`);
        return decodeLoadedAggregate(await response.json());
      },
    );
  }

  /**
   * Send bytes to the host's asset store (ADR 0142) under the Blob's media
   * type, answering the asset reference they are stored at or the refusal the
   * host named. Any media type and zero bytes are admitted; bytes over the
   * size limit are answered here without sending them, because the host could
   * only refuse them after reading all of them. Throws when the host cannot be
   * reached or answers anything else.
   */
  storeAsset(bytes: Blob): Promise<AssetRef | AssetRefusal> {
    if (bytes.size > MAX_ASSET_BYTES) return Promise.resolve({ refused: ASSET_TOO_LARGE });
    const headers: Record<string, string> = bytes.type === '' ? {} : { 'Content-Type': bytes.type };
    return this.#timedRequest(
      (client) => client.assets.$post(undefined, { init: { body: bytes, headers } }),
      async (response): Promise<AssetRef | AssetRefusal> => {
        if (response.ok) return decodeStoredAssetUrl(await response.json());
        if (hasProblemDetailsMediaType(response)) {
          const code = problemCodeForType(decodeProblemDetails(await response.json()).type);
          if (code === ASSET_TOO_LARGE) return { refused: code };
        }
        throw new Error(`Unable to store an asset: HTTP ${response.status}`);
      },
      this.#uploadTimeoutMs,
    );
  }

  /**
   * Read a stored asset's bytes, typed as they were stored rather than as they
   * are served, answering `asset-absent` when the host holds none under its
   * hash. A reference whose hash is not the canonical spelling of a SHA-256
   * names bytes no store can hold, so it answers `asset-absent` without a
   * request. Throws when the host cannot be reached or answers anything else.
   */
  readAsset(ref: AssetRef): Promise<Blob | AssetRefusal> {
    const hash = assetRefHash(ref);
    if (!isAssetHash(hash)) return Promise.resolve({ refused: ASSET_ABSENT });
    return this.#timedRequest(
      (client) => client.assets[':hash'].$get({ param: { hash } }),
      async (response): Promise<Blob | AssetRefusal> => {
        if (response.status === 404) return { refused: ASSET_ABSENT };
        if (!response.ok) throw new Error(`Unable to read an asset: HTTP ${response.status}`);
        const stored = normalizeMediaType(response.headers.get(ASSET_MEDIA_TYPE_HEADER) ?? '');
        const blob = await response.blob();
        return blob.type === stored ? blob : blob.slice(0, blob.size, stored);
      },
      this.#uploadTimeoutMs,
    );
  }

  async commit(request: Parameters<SpaceBackend['commit']>[0]): Promise<CommitResult> {
    try {
      return await this.#timedRequest(
        (client) =>
          client.api.spaces.$post({
            json: encodeCommitRequest(request),
          }),
        async (response, signal): Promise<CommitResult> => {
          try {
            // The one table the route encodes through. A decoder
            // rather than a decoded outcome: a status it does not know carries
            // Problem Details, and the body below must still be readable as that.
            const decodeOutcome = commitOutcomeDecoder(response.status);
            if (decodeOutcome !== undefined) {
              return decodeOutcome(await response.json());
            }
            if (!hasProblemDetailsMediaType(response)) {
              return protocolFailure({
                kind: 'problem-media-type',
                contentType: response.headers.get('Content-Type'),
              });
            }
            const problem = decodeProblemDetails(await response.json());
            if (problem.status !== response.status) {
              return protocolFailure({
                kind: 'problem-status-mismatch',
                httpStatus: response.status,
                problemStatus: problem.status,
              });
            }
            return commitFailureForProblem(problem, response);
          } catch (error) {
            if (signal.aborted) throw error;
            return protocolFailure({ kind: 'malformed-response', cause: error });
          }
        },
      );
    } catch (error) {
      if (error instanceof HttpTimeoutError) return { kind: 'retryable-failure', code: 'timeout' };
      return { kind: 'retryable-failure', code: 'network' };
    }
  }
}

/**
 * The asset store over HTTP, as a surface reaches it (ADR 0142): reads and
 * stores go through `backend`, and `url` says where an asset is drawn from —
 * as authored by default, because a host serves its own assets; a mount draws
 * from object URLs over its in-page store's bytes. Reading never fetches the
 * URL `url` answers, so a mount reads bytes from its store, not from an object
 * URL.
 */
export const httpAssetClient = (
  backend: Pick<HttpSpaceBackend, 'readAsset' | 'storeAsset'>,
  url: (ref: AssetRef) => string = (ref) => ref,
): AssetClient => ({
  url,
  read: (ref) => backend.readAsset(ref),
  store: (bytes) => backend.storeAsset(bytes),
});

class HttpTimeoutError extends Error {
  constructor() {
    super('Request timed out');
  }
}

const retryAfterMilliseconds = (response: Response): number | undefined => {
  const value = response.headers.get('Retry-After');
  if (value === null || !CANONICAL_DECIMAL.test(value)) return undefined;
  const seconds = BigInt(value);
  if (seconds > BigInt(Number.MAX_SAFE_INTEGER) / 1000n) return undefined;
  return Number(seconds) * 1000;
};

const commitFailureForProblem = (problem: ProblemDetails, response: Response): CommitResult => {
  const code = problemCodeForType(problem.type);
  switch (code) {
    case 'request-timeout':
      return { kind: 'retryable-failure', code: 'timeout' };
    case 'rate-limited': {
      const retryAfterMs = retryAfterMilliseconds(response);
      const result: CommitResult = { kind: 'retryable-failure', code: 'rate-limited' };
      if (retryAfterMs !== undefined) result.retryAfterMs = retryAfterMs;
      return result;
    }
    case 'persistence-unavailable':
    case 'internal-error': {
      const retryAfterMs = retryAfterMilliseconds(response);
      const result: CommitResult = { kind: 'retryable-failure', code: 'unavailable' };
      if (retryAfterMs !== undefined) result.retryAfterMs = retryAfterMs;
      return result;
    }
    case 'unauthorized':
    case 'forbidden':
      return { kind: 'permanent-failure', code: 'forbidden' };
    case 'invalid-request':
    case 'invalid-snapshot':
      // A 422 carrying `invalid-snapshot` cannot reach this exhaustive mapping:
      // commit's outcome decoder rejects a problem whose code mismatches its status.
      return { kind: 'permanent-failure', code: 'invalid-commit' };
    case 'payload-too-large':
      return { kind: 'permanent-failure', code: 'payload-too-large' };
    case 'not-found':
    case 'invalid-space-id':
    case 'unsupported-media-type':
    case 'method-not-allowed':
    case 'invalid-asset-hash':
    case 'asset-too-large':
      return protocolFailure({ kind: 'unexpected-problem', problemCode: code });
  }
};
