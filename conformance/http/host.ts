/**
 * What the HTTP conformance suite drives: a host it can send a `Request` to and
 * read a `Response` from. Every case is written against this and nothing else,
 * so the same case runs over loopback HTTP against a host process
 * (`host-process.ts`) and in process against a `Request -> Response` function,
 * such as the desktop sidecar's handler or a scheme handler.
 */

/** One request and its answer, with nothing in between that a case can see. */
export type Exchange = (request: Request) => Promise<Response>;

export interface ConformanceHost {
  /**
   * The origin a case addresses its requests to, such as
   * `http://127.0.0.1:5123`. A case builds every URL from it.
   */
  readonly origin: string;
  /** Answers a request addressed under {@link origin}, past any lock the host keeps. */
  readonly exchange: Exchange;
}

/**
 * How the host's application is built, as far as the fallback cases can know.
 * `stand-in` is the suite's own small build (`fixture.ts` `standInBuild`),
 * handed to the host, so a case can name its files and their bytes; `embedded`
 * is a build the host carries itself, so only the shell's transport is
 * checked, not which files it serves.
 */
export type BuiltApplication = 'stand-in' | 'embedded';

/** A request to `pathname` under the host's origin. */
export const requestTo = (host: ConformanceHost, pathname: string, init?: RequestInit): Request =>
  new Request(new URL(pathname, host.origin), init);

/** Send a request to `pathname` and answer the response. */
export const send = (
  host: ConformanceHost,
  pathname: string,
  init?: RequestInit,
): Promise<Response> => host.exchange(requestTo(host, pathname, init));
