// The home window's one control. `open_aggregate` is the only command the shell
// lets this window invoke (capabilities/home.json); Space windows invoke none.
document.getElementById('open')?.addEventListener('click', () => {
  void window.__TAURI__.core.invoke('open_aggregate');
});
