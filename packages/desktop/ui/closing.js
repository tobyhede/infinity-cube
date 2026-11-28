// A close's question (Storage ST-122). The shell names each folder still
// writing, and each database still answering a change (ADR 0181), in the
// address's fragment, each percent-encoded and separated by commas, and names
// them anew by changing the fragment. `answer_closing` is
// the only command the shell lets this window invoke
// (capabilities/closing.json).

/** @param {string} id */
function element(id) {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`closing.html has no #${id}`);
  return found;
}

/**
 * How the question names a place: a folder by its path; a database, which
 * the shell names `sqlite:` and its file's path or `postgres:` and its
 * identity (ADR 0181), by its kind and that.
 * @param {string} place
 */
function placeNamed(place) {
  if (place.startsWith('sqlite:')) return `the SQLite file ${place.slice('sqlite:'.length)}`;
  if (place.startsWith('postgres:')) {
    return `the PostgreSQL database ${place.slice('postgres:'.length)}`;
  }
  return place;
}

/** @param {string} place */
function isDatabase(place) {
  return place.startsWith('sqlite:') || place.startsWith('postgres:');
}

/**
 * What the question says before the places, and what closing without saving
 * costs: a folder loses the edits not yet written to it; a database's
 * changes are committed before they are answered, so one still under way
 * may or may not land (ADR 0181).
 * @param {readonly string[]} places
 */
function words(places) {
  const one = places.length === 1;
  const databases = places.filter(isDatabase).length;
  if (databases === 0) {
    return {
      lead: one
        ? 'InfinityCube has not yet finished writing the last edits to this folder:'
        : 'InfinityCube has not yet finished writing the last edits to these folders:',
      consequence: one
        ? 'Close without saving, and the edits not yet written to it are lost.'
        : 'Close without saving, and the edits not yet written to them are lost.',
    };
  }
  if (databases === places.length) {
    return {
      lead: one
        ? 'InfinityCube has not yet finished the last changes to this database:'
        : 'InfinityCube has not yet finished the last changes to these databases:',
      consequence:
        'Close without saving, and each change still under way may or may not be committed.',
    };
  }
  return {
    lead: 'InfinityCube has not yet finished saving the last edits to these:',
    consequence:
      'Close without saving, and the edits not yet written to a folder are lost, and each change still under way in a database may or may not be committed.',
  };
}

function show() {
  const places = location.hash
    .slice(1)
    .split(',')
    .filter((place) => place !== '')
    .map((place) => decodeURIComponent(place));
  const { lead, consequence } = words(places);
  element('lead').textContent = lead;
  element('folders').replaceChildren(
    ...places.map((place) => {
      const item = document.createElement('li');
      item.textContent = placeNamed(place);
      return item;
    }),
  );
  element('consequence').textContent = consequence;
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
