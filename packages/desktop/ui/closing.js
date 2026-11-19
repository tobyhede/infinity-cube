// A close's question (Storage ST-122). The shell names each folder still
// writing in the address's fragment, each percent-encoded and separated by
// commas, and names them anew by changing the fragment. `answer_closing` is
// the only command the shell lets this window invoke
// (capabilities/closing.json).

/** @param {string} id */
function element(id) {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`closing.html has no #${id}`);
  return found;
}

function show() {
  const folders = location.hash
    .slice(1)
    .split(',')
    .filter((folder) => folder !== '')
    .map((folder) => decodeURIComponent(folder));
  const one = folders.length === 1;
  element('lead').textContent = one
    ? 'InfinityCube has not yet finished writing the last edits to this folder:'
    : 'InfinityCube has not yet finished writing the last edits to these folders:';
  element('folders').replaceChildren(
    ...folders.map((folder) => {
      const item = document.createElement('li');
      item.textContent = folder;
      return item;
    }),
  );
  element('consequence').textContent = one
    ? 'Close without saving, and the edits not yet written to it are lost.'
    : 'Close without saving, and the edits not yet written to them are lost.';
}

/** @param {'keep-waiting' | 'close-without-saving'} choice */
function answer(choice) {
  void window.__TAURI__.core.invoke('answer_closing', { choice });
}

window.addEventListener('hashchange', show);
show();
element('keep-waiting').addEventListener('click', () => answer('keep-waiting'));
element('close-without-saving').addEventListener('click', () => answer('close-without-saving'));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') answer('keep-waiting');
});
// Waiting is the answer that loses nothing, so it has the caret.
element('keep-waiting').focus();
