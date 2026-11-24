import { createRoot } from 'react-dom/client';
import './tailwind.css';
import { StartPage } from './components/StartPage';
import { tauriStartShell, type TauriInvoke } from './components/start-shell';

// The desktop shell's Start window (`start.html`, built by
// `desktop-shell-build.config.ts`), answered by the shell through the global
// Tauri sets when `app.withGlobalTauri` is on (`tauri.conf.json`).
const tauri = (): TauriInvoke => {
  // SAFETY: the shell sets `window.__TAURI__.core` to Tauri's invoke API
  // before any page script runs (`app.withGlobalTauri`); this page is built
  // only into the shell's own frontend, so it is never served without it.
  const global = (window as Window & { readonly __TAURI__?: { readonly core: TauriInvoke } })
    .__TAURI__;
  if (global === undefined) throw new Error('The Start window is drawn only by the desktop shell.');
  return global.core;
};

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');
createRoot(rootElement).render(<StartPage shell={tauriStartShell(tauri())} />);
