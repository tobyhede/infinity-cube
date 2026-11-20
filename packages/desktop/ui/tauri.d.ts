// What the shell's windows read of the global Tauri exposes
// (`app.withGlobalTauri` in `src-tauri/tauri.conf.json`).
interface Window {
  readonly __TAURI__: {
    readonly core: {
      // `open_aggregate`, the home window's one command, answers nothing.
      invoke(command: 'open_aggregate'): Promise<null>;
      // `answer_closing`, a close's question window's one command, answers nothing.
      invoke(
        command: 'answer_closing',
        args: { readonly choice: 'keep-waiting' | 'close-without-saving' },
      ): Promise<null>;
    };
  };
}
