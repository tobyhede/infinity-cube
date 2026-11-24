import type { JsonValue } from '@project/core';
import { describe, expect, it } from 'vitest';
import { tauriStartShell, type TauriInvoke } from '../src/start-shell';

/** An invoke that answers each command as told, recording each call. */
function invoking(answers: Record<string, () => Promise<JsonValue>>) {
  const calls: { command: string; args: Record<string, string> | undefined }[] = [];
  const tauri: TauriInvoke = {
    invoke: (command, args) => {
      calls.push({ command, args });
      const answer = answers[command];
      return answer === undefined ? Promise.resolve(null) : answer();
    },
  };
  return { shell: tauriStartShell(tauri), calls };
}

describe('the Start window’s shell over invoke', () => {
  it('reads the recent Spaces and the defaults the shell answers', async () => {
    const { shell } = invoking({
      start_window_view: () =>
        Promise.resolve({
          recents: [],
          newSpace: { location: '/home/ada/Documents', name: 'Untitled Space', separator: '/' },
        }),
    });

    expect(await shell.view()).toEqual({
      recents: [],
      newSpace: { location: '/home/ada/Documents', name: 'Untitled Space', separator: '/' },
    });
  });

  it('answers nothing for a Space written and opened, sending the name and Location', async () => {
    const { shell, calls } = invoking({ start_create_space: () => Promise.resolve(null) });

    expect(await shell.createSpace('/home/ada/Documents', 'Deck')).toBeNull();
    expect(calls).toEqual([
      { command: 'start_create_space', args: { location: '/home/ada/Documents', name: 'Deck' } },
    ]);
  });

  it('answers each refusal and failure the shell gives by its code', async () => {
    const answers: readonly JsonValue[] = [
      { of: 'name', message: 'A name is one folder name.' },
      { of: 'folder' },
      { of: 'no-permission', detail: 'Permission denied (os error 13)' },
      { of: 'read-only', detail: 'Read-only file system (os error 30)' },
      { of: 'location-gone', detail: 'Not a directory (os error 20)' },
      { of: 'disk-full', detail: 'No space left on device (os error 28)', kept: false },
      { of: 'failed', detail: 'Input/output error (os error 5)', kept: true },
      { of: 'not-opened', folder: '/home/ada/Documents/Deck', detail: 'Could not open it' },
    ];
    for (const answer of answers) {
      const { shell } = invoking({ start_create_space: () => Promise.resolve(answer) });
      expect(await shell.createSpace('/x', 'y')).toEqual(answer);
    }
  });

  it('answers an invoke the shell refused as a failure, its words the detail', async () => {
    const { shell } = invoking({
      start_create_space: () => Promise.reject(new Error('command start_create_space not allowed')),
    });

    expect(await shell.createSpace('/x', 'y')).toEqual({
      of: 'failed',
      detail: 'command start_create_space not allowed',
      kept: false,
    });
  });

  it('answers a cancelled Browse… as nothing', async () => {
    const { shell, calls } = invoking({ start_browse: () => Promise.resolve(null) });

    expect(await shell.browse('/home/ada/Documents')).toBeNull();
    expect(calls).toEqual([{ command: 'start_browse', args: { location: '/home/ada/Documents' } }]);
  });
});
