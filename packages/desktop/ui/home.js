// The home window's one control. `open_talk` is the only command the shell
// lets this window invoke (capabilities/home.json); talk windows invoke none.
document.getElementById('open')?.addEventListener('click', () => {
  void window.__TAURI__.core.invoke('open_talk');
});
