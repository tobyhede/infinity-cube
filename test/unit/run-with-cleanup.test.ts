import { describe, expect, it } from 'vitest';
import { runWithCleanup } from '../support/run-with-cleanup';

/**
 * How the SQLite restart proof (`test/e2e/sqlite-persistence.spec.ts`) tears
 * down: every step runs whatever failed before it, and the failure reported is
 * the first one, so a host that fails to stop neither skips the file's cleanup
 * nor hides why the proof failed.
 */

describe('running a body with cleanup', () => {
  it('runs every cleanup step in order after the body succeeds', async () => {
    const ran: string[] = [];
    await runWithCleanup(() => {
      ran.push('body');
      return Promise.resolve();
    }, [
      () => {
        ran.push('first');
        return Promise.resolve();
      },
      () => {
        ran.push('second');
        return Promise.resolve();
      },
    ]);
    expect(ran).toEqual(['body', 'first', 'second']);
  });

  it("rethrows the body's failure after every cleanup step has run, even ones that fail", async () => {
    const ran: string[] = [];
    await expect(
      runWithCleanup(
        () => Promise.reject(new Error('the drag did not land')),
        [
          () => Promise.reject(new Error('the host exited 1 on SIGINT')),
          () => {
            ran.push('cleared the file');
            return Promise.resolve();
          },
        ],
      ),
    ).rejects.toThrow('the drag did not land');
    expect(ran).toEqual(['cleared the file']);
  });

  it('throws the first failing cleanup step when the body succeeds, after running the rest', async () => {
    const ran: string[] = [];
    await expect(
      runWithCleanup(
        () => Promise.resolve(),
        [
          () => Promise.reject(new Error('the first host exited 1 on SIGINT')),
          () => Promise.reject(new Error('the second host exited 1 on SIGINT')),
          () => {
            ran.push('cleared the file');
            return Promise.resolve();
          },
        ],
      ),
    ).rejects.toThrow('the first host exited 1 on SIGINT');
    expect(ran).toEqual(['cleared the file']);
  });

  it('runs the cleanup when the body throws synchronously', async () => {
    const ran: string[] = [];
    await expect(
      runWithCleanup(() => {
        throw new Error('thrown before any await');
      }, [
        () => {
          ran.push('cleanup');
          return Promise.resolve();
        },
      ]),
    ).rejects.toThrow('thrown before any await');
    expect(ran).toEqual(['cleanup']);
  });
});
