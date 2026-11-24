import { useCallback, useEffect, useRef, useState } from 'react';
import { StatusFailure } from '@project/ui';
import { StartWindow, type StartScreen } from './StartWindow';
import { newSpaceFolder, type NewSpaceForm } from './start-form';
import type { NewSpaceDefaults, RecentSpace, StartShell } from '../start-shell';

/**
 * The desktop shell's Start window page (`start.html`, Storage ST-131): it
 * asks the shell for the recent Spaces and New Space's defaults, and hands
 * it New Space, Open Folder…, Browse…, a recent Space, and Cancel on a form
 * File › New Space… opened.
 *
 * The shell asks for the form with the fragment `#new-space`: at load (a
 * window opened by File › New Space…, whose Cancel closes it), or later by
 * setting it (File › New Space… while the start screen shows).
 */

/** The fragment that asks for the New Space form. */
export const NEW_SPACE_FRAGMENT = '#new-space';

const formFrom = (defaults: NewSpaceDefaults): NewSpaceForm => ({
  ...defaults,
  notCreated: null,
});

const asksForForm = (): boolean => window.location.hash === NEW_SPACE_FRAGMENT;

/** Forget the fragment, so the shell setting it again is a change the page hears. */
const forgetFragment = (): void => {
  if (window.location.hash !== '') {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
};

type Loaded =
  | { readonly state: 'loading' }
  | { readonly state: 'failed'; readonly reason: string }
  | { readonly state: 'ready'; readonly recents: readonly RecentSpace[] };

export function StartPage({ shell }: { readonly shell: StartShell }) {
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [view, setView] = useState<StartScreen>({ screen: 'start' });
  // A form the window opened on closes the window on Cancel; one reached
  // from the start screen returns to it.
  const cancelCloses = useRef(asksForForm());
  // Whether the person has typed a name, which Browse… then keeps.
  const nameTyped = useRef(false);
  // The latest request for the form. A newer request, Cancel and Create
  // Space each move it on, so an answer to an earlier one draws no form.
  const formRequest = useRef(0);
  const forgetFormRequests = (): void => {
    formRequest.current += 1;
  };

  /** Ask the shell what to draw, and draw the form with its defaults when `form`. */
  const load = useCallback(
    async (form: boolean): Promise<void> => {
      formRequest.current += 1;
      const request = formRequest.current;
      try {
        const answer = await shell.view();
        setLoaded({ state: 'ready', recents: answer.recents });
        if (form && request === formRequest.current) {
          nameTyped.current = false;
          setView({ screen: 'new', form: formFrom(answer.newSpace) });
        }
      } catch (error) {
        // A request for the form that Cancel, Create Space or a newer request
        // has passed over fails as quietly as it would have answered.
        if (form && request !== formRequest.current) return;
        setLoaded({ state: 'failed', reason: String(error) });
      }
    },
    [shell],
  );
  const showForm = useCallback(() => void load(true), [load]);

  useEffect(() => {
    void load(cancelCloses.current);
  }, [load]);

  // What the hash listener reads, kept current after each render.
  const shown = useRef(view);
  useEffect(() => {
    shown.current = view;
  }, [view]);

  useEffect(() => {
    const heard = (): void => {
      if (asksForForm() && shown.current.screen === 'start') showForm();
    };
    window.addEventListener('hashchange', heard);
    return () => window.removeEventListener('hashchange', heard);
  }, [showForm]);

  if (loaded.state === 'loading') return null;
  if (loaded.state === 'failed') {
    return (
      <main className="flex min-h-screen bg-card">
        <StatusFailure
          title="The Start window couldn’t load"
          detail={loaded.reason}
          detailLabel="Why the Start window could not load"
          className="w-full"
        />
      </main>
    );
  }

  const form = view.screen === 'new' ? view.form : null;
  const editForm = (next: Partial<NewSpaceForm>): void => {
    if (form !== null) setView({ screen: 'new', form: { ...form, ...next } });
  };

  const cancel = (): void => {
    forgetFormRequests();
    if (cancelCloses.current) {
      shell.close();
      return;
    }
    forgetFragment();
    setView({ screen: 'start' });
  };

  const browse = (): void => {
    if (form === null) return;
    shell.browse(form.location).then(
      (chosen) => {
        if (chosen === null) return;
        setView((current) =>
          current.screen === 'new'
            ? {
                screen: 'new',
                form: {
                  ...current.form,
                  location: chosen.location,
                  separator: chosen.separator,
                  name: nameTyped.current ? current.form.name : chosen.name,
                  notCreated: null,
                },
              }
            : current,
        );
      },
      // An invoke the shell refused chose no Location: the form stays as it is.
      () => undefined,
    );
  };

  const create = (): void => {
    if (form === null) return;
    forgetFormRequests();
    setView({ screen: 'opening', title: form.name, folder: newSpaceFolder(form) });
    void shell.createSpace(form.location, form.name).then((notCreated) => {
      if (notCreated === null) return;
      setView({ screen: 'new', form: { ...form, notCreated } });
    });
  };

  return (
    <StartWindow
      view={view}
      recents={loaded.recents}
      onNewSpace={showForm}
      onOpenFolder={() => shell.openFolder()}
      onOpenRecent={(recent) => shell.openRecent(recent.folder)}
      onNameChange={(name) => {
        nameTyped.current = true;
        editForm({ name, notCreated: null });
      }}
      onBrowse={browse}
      onOpenCreated={(folder) => shell.openRecent(folder)}
      onCreate={create}
      onCancel={cancel}
    />
  );
}
