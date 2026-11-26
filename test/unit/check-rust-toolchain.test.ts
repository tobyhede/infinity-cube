import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  STALE_AT,
  judgeAgreement,
  judgeStaleness,
  minorGap,
  parseRelease,
  readStableVersion,
  readToolchainChannel,
  readCargoRustVersion,
} from '../../scripts/check-rust-toolchain';

const toolchainFile = (channel: string) =>
  `[toolchain]\nchannel = "${channel}"\ncomponents = ["rustfmt", "clippy"]\nprofile = "minimal"\n`;

const cargoFile = (rustVersion: string) =>
  [
    '[package]',
    'name = "intake"',
    '',
    '[workspace.package]',
    'version = "0.1.0-preview.1"',
    'edition = "2024"',
    `rust-version = "${rustVersion}"`,
    'publish = false',
    '',
  ].join('\n');

const stableChannel = (version: string) =>
  [
    'date = "2026-11-12"',
    'version = "9.9.9"',
    '',
    '[pkg.cargo]',
    'version = "0.101.0 (3acc79c0c 2026-11-05)"',
    '',
    '[pkg.rust]',
    `version = "${version} (0ef1bc386 2026-11-09)"`,
    'git_commit_hash = "0ef1bc386059596dada8fb65b50425aab2ea637a"',
    '',
  ].join('\n');

describe('reading the pins', () => {
  it('reads the channel from the toolchain file', () => {
    expect(readToolchainChannel(toolchainFile('1.100.0'))).toBe('1.100.0');
  });

  it('reads rust-version from the inherited package table only', () => {
    const text = `[package]\nrust-version = "1.80"\n\n${cargoFile('1.100')}`;
    expect(readCargoRustVersion(text)).toBe('1.100');
  });

  it('ends a table at an array-of-tables header or a header with a comment', () => {
    const afterComment =
      '[workspace.package]\nedition = "2024"\n[package.metadata.x] # note\nrust-version = "1.80"\n';
    const afterArray = '[workspace.package]\nedition = "2024"\n[[bin]]\nrust-version = "1.80"\n';
    expect(readCargoRustVersion(afterComment)).toBeNull();
    expect(readCargoRustVersion(afterArray)).toBeNull();
    expect(readCargoRustVersion('[workspace.package] # shared\nrust-version = "1.100"\n')).toBe(
      '1.100',
    );
  });

  it('reads a literal string as well as a basic one', () => {
    expect(readToolchainChannel("[toolchain]\nchannel = '1.100.0'\n")).toBe('1.100.0');
  });

  it('reads nothing when the value is missing', () => {
    expect(readToolchainChannel('[toolchain]\nprofile = "minimal"\n')).toBeNull();
    expect(readCargoRustVersion('[workspace.package]\nedition = "2024"\n')).toBeNull();
  });

  it("reads the stable release from [pkg.rust], not another package's version", () => {
    expect(readStableVersion(stableChannel('1.100.0'))).toBe('1.100.0');
  });

  it('reads nothing from a stable channel file with no [pkg.rust]', () => {
    expect(readStableVersion('[pkg.cargo]\nversion = "0.101.0"\n')).toBeNull();
  });

  it('parses an exact release and a major.minor one, and refuses anything else', () => {
    expect(parseRelease('1.100.0')).toEqual({ major: 1, minor: 100, patch: 0 });
    expect(parseRelease('1.100')).toEqual({ major: 1, minor: 100, patch: null });
    for (const text of ['stable', '1', '1.100.0-beta.1', 'v1.100.0', '1.x', '']) {
      expect(parseRelease(text), text).toBeNull();
    }
  });
});

describe('judgeAgreement', () => {
  it('passes when the channel and rust-version name the same release', () => {
    const verdict = judgeAgreement({
      toolchain: toolchainFile('1.100.0'),
      cargo: cargoFile('1.100'),
    });
    expect(verdict.ok).toBe(true);
  });

  it('passes whatever the channel says for the patch', () => {
    const verdict = judgeAgreement({
      toolchain: toolchainFile('1.100.2'),
      cargo: cargoFile('1.100'),
    });
    expect(verdict.ok).toBe(true);
  });

  it('fails a channel ahead of or behind rust-version, naming both values and their files', () => {
    for (const [channel, rustVersion] of [
      ['1.101.0', '1.100'],
      ['1.97.0', '1.100'],
    ] as const) {
      const verdict = judgeAgreement({
        toolchain: toolchainFile(channel),
        cargo: cargoFile(rustVersion),
      });
      expect(verdict.ok).toBe(false);
      expect(verdict.message).toContain(`rust-toolchain.toml names ${channel}`);
      expect(verdict.message).toContain(`Cargo.toml names rust-version ${rustVersion}`);
    }
  });

  it('fails a channel that is not an exact release, naming the toolchain file', () => {
    const verdict = judgeAgreement({
      toolchain: toolchainFile('stable'),
      cargo: cargoFile('1.100'),
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.message).toContain('rust-toolchain.toml');
    expect(verdict.message).toContain('"stable"');
  });

  it('fails a rust-version carrying a patch, naming Cargo.toml', () => {
    const verdict = judgeAgreement({
      toolchain: toolchainFile('1.100.0'),
      cargo: cargoFile('1.100.0'),
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.message).toContain('Cargo.toml');
  });

  it('fails when either value is missing, naming the file it is missing from', () => {
    const noChannel = judgeAgreement({
      toolchain: '[toolchain]\n',
      cargo: cargoFile('1.100'),
    });
    expect(noChannel.ok).toBe(false);
    expect(noChannel.message).toContain('rust-toolchain.toml');

    const noRustVersion = judgeAgreement({
      toolchain: toolchainFile('1.100.0'),
      cargo: '[workspace.package]\n',
    });
    expect(noRustVersion.ok).toBe(false);
    expect(noRustVersion.message).toContain('Cargo.toml');
  });

  it("holds the repository's own pins in step", () => {
    const read = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    const verdict = judgeAgreement({
      toolchain: read('rust-toolchain.toml'),
      cargo: read('Cargo.toml'),
    });
    expect(verdict.message).toMatch(/^The Rust pins agree/);
    expect(verdict.ok).toBe(true);
  });
});

describe('judgeStaleness', () => {
  it('passes a pin equal to stable', () => {
    expect(
      judgeStaleness({
        toolchain: toolchainFile('1.100.0'),
        stableChannel: stableChannel('1.100.0'),
      }).ok,
    ).toBe(true);
  });

  it('passes a pin one minor release behind, saying ADR 0179 allows it', () => {
    const verdict = judgeStaleness({
      toolchain: toolchainFile('1.99.0'),
      stableChannel: stableChannel('1.100.1'),
    });
    expect(verdict.ok).toBe(true);
    expect(verdict.message).toBe(
      'The Rust pin 1.99.0 is 1 minor release behind stable 1.100.1, which ADR 0179 allows.',
    );
  });

  it('fails a pin two or more minor releases behind, naming both versions, the gap and the bump steps', () => {
    const verdict = judgeStaleness({
      toolchain: toolchainFile('1.97.0'),
      stableChannel: stableChannel('1.100.0'),
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.message).toContain('1.97.0');
    expect(verdict.message).toContain('1.100.0');
    expect(verdict.message).toContain('3 minor releases behind');
    expect(verdict.message).toContain('docs/agents/build-tooling.md');
  });

  it('passes a pin ahead of stable, as during a release, and says it is ahead rather than current', () => {
    const verdict = judgeStaleness({
      toolchain: toolchainFile('1.101.0'),
      stableChannel: stableChannel('1.100.0'),
    });
    expect(verdict.ok).toBe(true);
    expect(verdict.message).toBe(
      'The Rust pin 1.101.0 is ahead of the stable channel file, which names 1.100.0.',
    );
  });

  it('fails a stable channel file it cannot read, never passing it as up to date', () => {
    const verdict = judgeStaleness({
      toolchain: toolchainFile('1.100.0'),
      stableChannel: '<html>gateway error</html>',
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.message).toContain('stable channel file');
  });

  it('fails a pin it cannot read', () => {
    const verdict = judgeStaleness({
      toolchain: toolchainFile('stable'),
      stableChannel: stableChannel('1.100.0'),
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.message).toContain('rust-toolchain.toml');
  });
});

describe('minorGap', () => {
  const release = fc.record({
    major: fc.integer({ min: 1, max: 3 }),
    minor: fc.integer({ min: 0, max: 300 }),
    patch: fc.integer({ min: 0, max: 9 }),
  });

  it('changes sign when its arguments swap', () => {
    fc.assert(
      fc.property(release, release, (pinned, stable) => {
        expect(minorGap(pinned, stable) + 0).toBe(-minorGap(stable, pinned) + 0);
      }),
    );
  });

  it('is zero exactly when major and minor are equal, whatever the patch', () => {
    fc.assert(
      fc.property(release, release, (pinned, stable) => {
        const same = pinned.major === stable.major && pinned.minor === stable.minor;
        expect(minorGap(pinned, stable) === 0).toBe(same);
      }),
    );
  });

  it('counts the minor releases between two releases of one major', () => {
    fc.assert(
      fc.property(release, fc.integer({ min: 0, max: 50 }), (pinned, ahead) => {
        expect(minorGap(pinned, { ...pinned, minor: pinned.minor + ahead })).toBe(ahead);
      }),
    );
  });

  it('puts the pass/fail boundary at exactly STALE_AT', () => {
    expect(STALE_AT).toBe(2);
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 200 }),
        fc.integer({ min: -5, max: 10 }),
        (minor, gap) => {
          fc.pre(minor + gap >= 0);
          const verdict = judgeStaleness({
            toolchain: toolchainFile(`1.${minor}.0`),
            stableChannel: stableChannel(`1.${minor + gap}.0`),
          });
          expect(verdict.ok).toBe(gap < STALE_AT);
        },
      ),
    );
  });

  it('names a newer major as major releases behind, not as a count of minor releases', () => {
    const verdict = judgeStaleness({
      toolchain: toolchainFile('1.200.0'),
      stableChannel: stableChannel('2.0.0'),
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.message).toContain(
      'The Rust pin 1.200.0 is 1 major release behind stable 2.0.0',
    );
  });

  it('treats a newer major as stale and an older one as ahead', () => {
    expect(
      minorGap({ major: 1, minor: 200, patch: 0 }, { major: 2, minor: 0, patch: 0 }),
    ).toBeGreaterThanOrEqual(STALE_AT);
    expect(
      minorGap({ major: 2, minor: 0, patch: 0 }, { major: 1, minor: 200, patch: 0 }),
    ).toBeLessThan(0);
  });
});
