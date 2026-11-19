import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { RunCommand } from '../../src/cli/arguments';
import { decodeRunCommand, encodeRunCommand } from '../../src/cli/run-launcher';
import { describeRunRefusal } from '../../src/cli/run-refusal';

describe('a run refusal', () => {
  it('names init, with the directory as one shell word, for a missing or empty directory', () => {
    expect(describeRunRefusal({ kind: 'empty' }, '/spaces/rust asycn')).toBe(
      "/spaces/rust asycn holds no aggregate: it is missing or empty. To create one there: pnpm cube init '/spaces/rust asycn'\n",
    );
  });

  it('lists what made the directory unreadable', () => {
    expect(
      describeRunRefusal(
        { kind: 'unreadable', diagnostics: ['first', 'second'], refusals: [] },
        '/space',
      ),
    ).toBe('/space is not an Aggregate directory:\nfirst\nsecond\n');
  });

  it('lists what aggregate intake refused', () => {
    expect(
      describeRunRefusal(
        { kind: 'aggregate-refused', diagnostics: ['refused'], refusals: [] },
        '/space',
      ),
    ).toBe('Aggregate validation failed:\nrefused\n');
  });
});

describe('the command the launcher hands the run process', () => {
  it('decodes to the command it was encoded from', () => {
    fc.assert(
      fc.property(
        fc.record({
          directory: fc.string({ minLength: 1 }),
          port: fc.option(fc.integer({ min: 1, max: 65_535 }), { nil: undefined }),
          open: fc.boolean(),
        }),
        (fields) => {
          const command: RunCommand = { verb: 'run', ...fields };
          expect(decodeRunCommand(encodeRunCommand(command))).toEqual(command);
        },
      ),
    );
  });

  it.each([
    [[]],
    [['/space', '']],
    [['/space', '', 'open', 'extra']],
    [['/space', '41.5', 'open']],
    [['/space', '-1', 'open']],
    [['/space', '', 'yes']],
  ])('refuses %j', (args) => {
    expect(decodeRunCommand(args)).toBeUndefined();
  });
});
