/**
 * Holds the Rust toolchain pin to ADR 0179.
 *
 * The release is written twice: exactly as `rust-toolchain.toml`'s channel, which
 * rustup, cargo and every CI job that builds Rust read, and as `major.minor` in
 * the workspace `rust-version`, which every crate inherits. Two checks share this
 * module:
 *
 * - **Agreement** (offline, `pnpm toolchain:rust:check`, and a unit test in
 *   `verify`): the two name the same `major.minor`.
 * - **Staleness** (online, `pnpm toolchain:rust:stale`, run weekly by
 *   `.github/workflows/rust-toolchain.yml`): the pin is fewer than `STALE_AT`
 *   minor releases behind the stable release Rust's stable channel file names.
 *
 * Each file is read by a fixed pattern rather than a TOML parser, which no
 * dependency of this repository provides. A pattern that matches nothing is a
 * failure, never a pass, so a reshaped file cannot read as up to date.
 */
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const TOOLCHAIN_FILE = 'rust-toolchain.toml';
export const CARGO_FILE = 'Cargo.toml';
export const STABLE_CHANNEL_URL = 'https://static.rust-lang.org/dist/channel-rust-stable.toml';
const BUMP_STEPS = 'docs/agents/build-tooling.md (Rust toolchain)';

/** How many minor releases behind stable the pin may fall before the staleness check fails. */
export const STALE_AT = 2;

/** A Rust release: `1.100.0` exactly, or `1.100` with no patch. */
export interface Release {
  readonly major: number;
  readonly minor: number;
  readonly patch: number | null;
}

export type Verdict =
  | { readonly ok: true; readonly message: string }
  | { readonly ok: false; readonly message: string };

const pass = (message: string): Verdict => ({ ok: true, message });
const fail = (message: string): Verdict => ({ ok: false, message });

export const parseRelease = (text: string): Release | null => {
  const match = /^(\d+)\.(\d+)(?:\.(\d+))?$/.exec(text);
  if (match?.[1] === undefined || match[2] === undefined) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: match[3] === undefined ? null : Number(match[3]),
  };
};

const format = (release: Release): string =>
  release.patch === null
    ? `${release.major}.${release.minor}`
    : `${release.major}.${release.minor}.${release.patch}`;

/**
 * The string value of `key` inside `[table]`, or null. The table runs from its
 * header to the next header, so a same-named key in another table is not read.
 */
const readTableValue = (text: string, table: string, key: string): string | null => {
  let inTable = false;
  for (const line of text.split('\n')) {
    // `[table]` or `[[array]]`, either followed by a comment: each ends the table before it.
    const header = /^\s*\[\[?([^\]]+)\]\]?\s*(?:#.*)?$/.exec(line);
    if (header?.[1] !== undefined) {
      inTable = header[1].trim() === table;
      continue;
    }
    if (!inTable) continue;
    const entry = new RegExp(`^\\s*${key.replace(/[.-]/g, '\\$&')}\\s*=\\s*"([^"]*)"`).exec(line);
    if (entry?.[1] !== undefined) return entry[1];
  }
  return null;
};

export const readToolchainChannel = (toolchain: string): string | null =>
  readTableValue(toolchain, 'toolchain', 'channel');

export const readCargoRustVersion = (cargo: string): string | null =>
  readTableValue(cargo, 'workspace.package', 'rust-version');

/** The release `[pkg.rust]` names, without the commit and date that follow it. */
export const readStableVersion = (stableChannel: string): string | null => {
  const version = readTableValue(stableChannel, 'pkg.rust', 'version');
  return version === null ? null : (/^\S+/.exec(version)?.[0] ?? null);
};

/**
 * How many minor releases `stable` is ahead of `pinned`; negative when behind.
 * A newer major counts as a million minors, so it is always stale; Rust has no
 * second major, and a guess at how many minors one would span would be invented.
 */
export const minorGap = (pinned: Release, stable: Release): number =>
  (stable.major - pinned.major) * 1_000_000 + (stable.minor - pinned.minor);

/** `1.100.0`, with its patch, or null. */
const exactRelease = (text: string): Release | null =>
  /^\d+\.\d+\.\d+$/.test(text) ? parseRelease(text) : null;

/** `1.100`, with no patch, or null. */
const minorRelease = (text: string): Release | null =>
  /^\d+\.\d+$/.test(text) ? parseRelease(text) : null;

type PinReading =
  | { readonly ok: true; readonly release: Release }
  | { readonly ok: false; readonly verdict: Verdict };

/** The exact release the toolchain file pins, or the failure saying why it cannot be read. */
const readPin = (toolchain: string): PinReading => {
  const channel = readToolchainChannel(toolchain);
  if (channel === null) {
    return { ok: false, verdict: fail(`${TOOLCHAIN_FILE} names no channel under [toolchain].`) };
  }
  const release = exactRelease(channel);
  if (release === null) {
    return {
      ok: false,
      verdict: fail(
        `${TOOLCHAIN_FILE} names channel "${channel}", which is not an exact release such as 1.100.0.`,
      ),
    };
  }
  return { ok: true, release };
};

export const judgeAgreement = (files: {
  readonly toolchain: string;
  readonly cargo: string;
}): Verdict => {
  const reading = readPin(files.toolchain);
  if (!reading.ok) return reading.verdict;
  const pin = reading.release;

  const rustVersion = readCargoRustVersion(files.cargo);
  if (rustVersion === null)
    return fail(`${CARGO_FILE} names no rust-version under [workspace.package].`);
  const declared = minorRelease(rustVersion);
  if (declared === null) {
    return fail(
      `${CARGO_FILE} names rust-version "${rustVersion}", which is not a major.minor such as 1.100.`,
    );
  }

  if (minorGap(pin, declared) !== 0) {
    return fail(
      `The Rust pins disagree: ${TOOLCHAIN_FILE} names ${format(pin)} but ${CARGO_FILE} names rust-version ${rustVersion}. ` +
        `A bump changes both in one change (ADR 0179; ${BUMP_STEPS}).`,
    );
  }
  return pass(
    `The Rust pins agree: ${TOOLCHAIN_FILE} names ${format(pin)} and ${CARGO_FILE} rust-version ${rustVersion}.`,
  );
};

export const judgeStaleness = (inputs: {
  readonly toolchain: string;
  readonly stableChannel: string;
}): Verdict => {
  const reading = readPin(inputs.toolchain);
  if (!reading.ok) return reading.verdict;
  const pin = reading.release;

  const stableText = readStableVersion(inputs.stableChannel);
  const stable = stableText === null ? null : parseRelease(stableText);
  if (stable === null) {
    return fail(
      `Could not read the stable release from Rust's stable channel file (${STABLE_CHANNEL_URL}).`,
    );
  }

  const gap = minorGap(pin, stable);
  if (gap >= STALE_AT) {
    return fail(
      `The Rust pin ${format(pin)} is ${gap} minor releases behind stable ${format(stable)}; ` +
        `ADR 0179 allows ${STALE_AT - 1}. Bump ${TOOLCHAIN_FILE} to ${format(stable)} and ${CARGO_FILE} rust-version to ` +
        `${stable.major}.${stable.minor}, and fix the lints it raises, as ${BUMP_STEPS} sets out.`,
    );
  }
  const position =
    gap === 0
      ? 'current'
      : gap < 0
        ? `${-gap} minor release${gap === -1 ? '' : 's'} ahead of stable, which rustup cannot install until it is published`
        : `${gap} minor release behind, within the ${STALE_AT - 1} ADR 0179 allows`;
  return pass(`The Rust pin ${format(pin)} is ${position} (stable is ${format(stable)}).`);
};

const report = (verdict: Verdict): void => {
  if (verdict.ok) console.log(verdict.message);
  else {
    console.error(verdict.message);
    process.exitCode = 1;
  }
};

const entryPoint = process.argv[1];
// `realpathSync`, as in check-typescript-toolchain.ts: under a symlinked
// checkout `resolve` alone leaves the two unequal and the body is skipped,
// which would exit 0 having checked nothing.
if (entryPoint !== undefined && import.meta.url === pathToFileURL(realpathSync(entryPoint)).href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const toolchain = readFileSync(resolve(root, TOOLCHAIN_FILE), 'utf8');
  const mode = process.argv[2];
  if (mode === '--stale') {
    try {
      // A stalled connection would otherwise hang until the job's own timeout,
      // which cancels the step without this script's message.
      const response = await fetch(STABLE_CHANNEL_URL, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) report(fail(`Fetching ${STABLE_CHANNEL_URL} answered ${response.status}.`));
      else report(judgeStaleness({ toolchain, stableChannel: await response.text() }));
    } catch (error) {
      report(
        fail(
          `Could not fetch ${STABLE_CHANNEL_URL}: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  } else if (mode === undefined) {
    report(judgeAgreement({ toolchain, cargo: readFileSync(resolve(root, CARGO_FILE), 'utf8') }));
  } else {
    report(
      fail(
        `Unknown argument ${mode}; pass nothing to check agreement or --stale to check staleness.`,
      ),
    );
  }
}
