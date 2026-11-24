import { useState } from 'react';
import { Button } from '@project/ui';

/**
 * The Start window's page, a throwaway for the spike in
 * `.scratch/start-window/issues/05-serve-the-start-windows-react-page.md`:
 * one `@project/ui` Button invoking the one command the Start window's
 * capability allows (`packages/desktop/src-tauri/capabilities/start.json`).
 * Ticket 02 replaces it with the Start window ST-131 states.
 */

/** What the page reads of the global Tauri exposes (`app.withGlobalTauri`). */
interface TauriGlobal {
  readonly core: {
    invoke(command: 'start_window_ping'): Promise<string>;
  };
}

const tauri = (): TauriGlobal | undefined =>
  (window as Window & { readonly __TAURI__?: TauriGlobal }).__TAURI__;

export function StartPage() {
  const [reply, setReply] = useState('Not asked yet.');
  const ping = () => {
    const global = tauri();
    if (global === undefined) {
      setReply('No Tauri here: this page is served outside the shell.');
      return;
    }
    global.core.invoke('start_window_ping').then(
      (answer) => setReply(`The shell answered: ${answer}`),
      (error: unknown) => setReply(`The shell refused: ${String(error)}`),
    );
  };
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-base font-semibold">InfinityCube Start window (spike)</h1>
      <Button onClick={ping}>Ping the shell</Button>
      <p role="status">{reply}</p>
    </main>
  );
}
