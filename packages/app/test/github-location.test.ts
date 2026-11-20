import { describe, expect, it } from 'vitest';
import {
  formatGitHubLocation,
  formatGivenGitHubLocation,
  parseGitHubLocation,
} from '../src/mount/github-location';

describe('parseGitHubLocation', () => {
  it('reads owner, repository, ref and path', () => {
    expect(parseGitHubLocation('github:tobyhede/infinity-cube@main/spaces/pgdu')).toEqual({
      ok: true,
      location: { owner: 'tobyhede', repo: 'infinity-cube', ref: 'main', path: 'spaces/pgdu' },
    });
  });

  it('leaves a missing ref and path to their defaults', () => {
    expect(parseGitHubLocation('github:tobyhede/infinity-cube')).toEqual({
      ok: true,
      location: { owner: 'tobyhede', repo: 'infinity-cube', ref: undefined, path: '' },
    });
    expect(parseGitHubLocation('github:tobyhede/infinity-cube@v1.0')).toEqual({
      ok: true,
      location: { owner: 'tobyhede', repo: 'infinity-cube', ref: 'v1.0', path: '' },
    });
    expect(parseGitHubLocation('github:tobyhede/infinity-cube/spaces')).toEqual({
      ok: true,
      location: { owner: 'tobyhede', repo: 'infinity-cube', ref: undefined, path: 'spaces' },
    });
  });

  it('ends a ref at the next slash, so a slashed branch is addressed by SHA or tag', () => {
    expect(parseGitHubLocation('github:o/r@feature/x/space')).toEqual({
      ok: true,
      location: { owner: 'o', repo: 'r', ref: 'feature', path: 'x/space' },
    });
  });

  it('keeps an @ inside a ref, splitting the repository at the first', () => {
    expect(parseGitHubLocation('github:o/r@release@beta/space')).toEqual({
      ok: true,
      location: { owner: 'o', repo: 'r', ref: 'release@beta', path: 'space' },
    });
  });

  it.each([
    ['', 'no scheme'],
    ['tobyhede/infinity-cube', 'no scheme'],
    ['gitlab:tobyhede/infinity-cube', 'another scheme'],
    ['github:', 'no owner'],
    ['github:tobyhede', 'no repository'],
    ['github:tobyhede/', 'an empty repository'],
    ['github:/infinity-cube', 'an empty owner'],
    ['github:toby_hede/infinity-cube', 'an owner GitHub cannot name'],
    ['github:tobyhede/..', 'a dot repository'],
    ['github:tobyhede/infinity-cube@', 'an empty ref'],
    ['github:tobyhede/infinity-cube@main/', 'an empty path segment'],
    ['github:tobyhede/infinity-cube@main/spaces//pgdu', 'an empty path segment'],
    ['github:tobyhede/infinity-cube@main/../secrets', 'a parent segment'],
    ['github:tobyhede/infinity-cube@main/./spaces', 'a current-directory segment'],
    ['github:tobyhede/infinity-cube@ma in', 'whitespace in the ref'],
    ['github:o/r@@', 'a ref that is exactly @'],
    ['github:o/r@a@{1}', 'a ref containing @{'],
  ])('refuses %j (%s)', (input) => {
    const parsed = parseGitHubLocation(input);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.failure).toMatchObject({ kind: 'malformed-location', input });
  });
});

describe('formatGitHubLocation', () => {
  it('writes a resolved location back in the syntax it is parsed from', () => {
    const sha = 'a'.repeat(40);
    expect(formatGitHubLocation({ owner: 'o', repo: 'r', sha, path: 'spaces/pgdu' })).toBe(
      `github:o/r@${sha}/spaces/pgdu`,
    );
    expect(formatGitHubLocation({ owner: 'o', repo: 'r', sha, path: '' })).toBe(
      `github:o/r@${sha}`,
    );
  });
});

describe('formatGivenGitHubLocation', () => {
  it('writes a location as given, round-tripping through the parser', () => {
    for (const input of [
      'github:o/r',
      'github:o/r@main',
      'github:o/r/spaces/pgdu',
      'github:o/r@release@beta/spaces',
    ]) {
      const parsed = parseGitHubLocation(input);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(formatGivenGitHubLocation(parsed.location)).toBe(input);
    }
  });
});
