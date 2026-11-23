import { useState, type ReactNode } from 'react';
import type { Story } from '@ladle/react';
import {
  StartWindow,
  WindowFrame,
  newSpaceFolder,
  type NewSpaceForm,
  type RecentSpace,
  type StartWindowView,
} from './StartWindowPrototype';

/**
 * The desktop application's Start window (ADR 0171), staged for design review
 * by `.scratch/start-window/issues/01-design-the-start-window.md`. Each story
 * fills the frame at the size the shell would open the window; nothing here is
 * production code or a parity claim.
 */
export default { title: 'Review/Start Window' };

const DOCUMENTS = '~/Documents';

const DEFAULT_FORM: NewSpaceForm = { name: 'Untitled Space', location: DOCUMENTS, refusal: null };

const RECENTS: readonly RecentSpace[] = [
  { id: 'q3', title: 'Quarterly review', folder: '~/Documents/Quarterly review' },
  { id: 'arch', title: 'Platform architecture', folder: '~/Projects/platform/decks/architecture' },
  { id: 'onboard', title: 'Onboarding walkthrough', folder: '~/Documents/Onboarding walkthrough' },
  { id: 'notes', title: 'Meeting notes', folder: '~/Desktop/Meeting notes' },
];

const WITH_PROBLEMS: readonly RecentSpace[] = [
  {
    id: 'gone',
    title: 'Conference keynote',
    folder: '~/Desktop/Conference keynote',
    problem: {
      kind: 'gone',
      reason: 'This folder is no longer there. It may have been moved, renamed or deleted.',
    },
  },
  {
    id: 'failed',
    title: 'Design system tour',
    folder: '~/Projects/design-system-tour',
    problem: {
      kind: 'failed',
      reason: 'This Space didn’t open because one of its files couldn’t be read.',
    },
  },
  ...RECENTS.slice(0, 2),
];

/** The window the shell opens, filling the story's frame. */
const Window = ({ children }: { children: ReactNode }) => (
  <div className="h-screen w-screen overflow-hidden">{children}</div>
);

/** First launch: nothing recent, New Space the obvious action, Open Folder… beside it. */
export const FirstLaunch: Story = () => (
  <Window>
    <StartWindow view={{ screen: 'start' }} recents={[]} />
  </Window>
);
FirstLaunch.meta = { iframed: true };

/**
 * Recent Spaces: the Spaces opened, most recent first, at most ten, each its
 * Title and folder and opened by selecting it.
 */
export const WithRecentSpaces: Story = () => (
  <Window>
    <StartWindow view={{ screen: 'start' }} recents={RECENTS} />
  </Window>
);
WithRecentSpaces.meta = { iframed: true };

/**
 * A recent Space that is already open in a window is marked Open, and
 * selecting it brings that window forward rather than opening it again.
 */
export const WithASpaceAlreadyOpen: Story = () => (
  <Window>
    <StartWindow
      view={{ screen: 'start' }}
      recents={RECENTS.map((recent, index) => (index === 0 ? { ...recent, open: true } : recent))}
    />
  </Window>
);
WithASpaceAlreadyOpen.meta = { iframed: true };

/** A recent Space whose folder is gone, and one that did not open, each with its reason and Remove. */
export const RecentSpacesThatDidNotOpen: Story = () => (
  <Window>
    <StartWindow view={{ screen: 'start' }} recents={WITH_PROBLEMS} />
  </Window>
);
RecentSpacesThatDidNotOpen.meta = { iframed: true };

/** New Space: the defaults as they are, and the folder Create will write. */
export const NewSpaceFormDefaults: Story = () => (
  <Window>
    <StartWindow view={{ screen: 'new', form: DEFAULT_FORM }} recents={RECENTS} />
  </Window>
);
NewSpaceFormDefaults.meta = { iframed: true };

/**
 * New Space when ~/Documents/Untitled Space already exists: the default name
 * is the first free one, "Untitled Space 2", then "3", and so on.
 */
export const NewSpaceFormUntitledTaken: Story = () => (
  <Window>
    <StartWindow
      view={{ screen: 'new', form: { ...DEFAULT_FORM, name: 'Untitled Space 2' } }}
      recents={RECENTS}
    />
  </Window>
);
NewSpaceFormUntitledTaken.meta = { iframed: true };

/** New Space refused: the folder already holds files, said beside the field; nothing is written. */
export const NewSpaceFolderNotEmpty: Story = () => (
  <Window>
    <StartWindow
      view={{
        screen: 'new',
        form: {
          name: 'Meeting notes',
          location: '~/Desktop',
          refusal: {
            of: 'folder',
            message:
              'There are already files in ~/Desktop/Meeting notes. Choose another name or location.',
          },
        },
      }}
      recents={RECENTS}
    />
  </Window>
);
NewSpaceFolderNotEmpty.meta = { iframed: true };

/** New Space refused: a name that cannot be a folder name, said beside the field. */
export const NewSpaceInvalidName: Story = () => (
  <Window>
    <StartWindow
      view={{
        screen: 'new',
        form: {
          name: 'Q3/Q4 review',
          location: DOCUMENTS,
          refusal: { of: 'name', message: 'A name can’t contain / or \\. Try a dash instead.' },
        },
      }}
      recents={RECENTS}
    />
  </Window>
);
NewSpaceInvalidName.meta = { iframed: true };

/**
 * File › New Space… while a Space is open: the Start window opens beside the
 * Space window, straight on the form, and Cancel closes it. The frames are
 * illustration; the real ones are the platform's.
 */
export const NewSpaceWhileSpacesAreOpen: Story = () => (
  <div className="relative h-screen w-screen overflow-hidden bg-muted">
    <WindowFrame title="Quarterly review" className="absolute top-6 left-6 h-[560px] w-[860px]">
      <div className="flex-1 bg-background">
        <div className="flex gap-6 p-10">
          {['Agenda', 'Revenue by region', 'Next quarter'].map((title) => (
            <div
              key={title}
              className="flex h-[96px] w-[170px] items-end border border-border bg-card p-3 text-chrome-sm font-medium text-foreground"
            >
              {title}
            </div>
          ))}
        </div>
      </div>
    </WindowFrame>
    <WindowFrame
      title="New Space"
      className="absolute top-[150px] left-[330px] h-[552px] w-[720px]"
    >
      <StartWindow
        view={{ screen: 'new', form: DEFAULT_FORM, cancelCloses: true }}
        recents={RECENTS}
      />
    </WindowFrame>
  </div>
);
NewSpaceWhileSpacesAreOpen.meta = { iframed: true };

/** Pressed Create: the Space is being written and its window is opening. */
export const OpeningTheNewSpace: Story = () => (
  <Window>
    <StartWindow
      view={{ screen: 'opening', title: 'Untitled Space', folder: '~/Documents/Untitled Space' }}
      recents={[]}
    />
  </Window>
);
OpeningTheNewSpace.meta = { iframed: true };

/** Folders the prototype treats as already holding files. */
const NOT_EMPTY = new Set(['~/Desktop/Meeting notes', '~/Documents/Quarterly review']);
const LOCATIONS = [DOCUMENTS, '~/Desktop', '~/Projects/decks'];

/** Names the platforms refuse as a folder name (Windows' device names). */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/iu;

/**
 * Why a name cannot be a folder name, said beside Name. The real rule is the
 * platform's; this stands in for it in review.
 */
const nameRefusal = (raw: string): string | null => {
  const name = raw.trim();
  if (name === '') return 'Enter a name for the Space.';
  if (name === '.' || name === '..') return 'A name can’t be just . or ..';
  if (/[/\\]/u.test(name)) return 'A name can’t contain / or \\. Try a dash instead.';
  if (/[<>:"|?*]/u.test(name)) return 'A name can’t contain < > : " | ? or *.';
  if (RESERVED.test(name) || /[. ]$/u.test(name))
    return 'This name can’t be used for a folder. Try another name.';
  return null;
};

const refusalFor = (form: NewSpaceForm, taken: ReadonlySet<string>): NewSpaceForm['refusal'] => {
  const message = nameRefusal(form.name);
  if (message !== null) return { of: 'name', message };
  const folder = newSpaceFolder(form);
  if (taken.has(folder))
    return {
      of: 'folder',
      message: `There are already files in ${folder}. Choose another name or location.`,
    };
  return null;
};

/** The default name: "Untitled Space", or the first of "Untitled Space 2", "3", … not taken. */
const firstFreeName = (location: string, taken: ReadonlySet<string>): string => {
  for (let n = 1; ; n += 1) {
    const name = n === 1 ? 'Untitled Space' : `Untitled Space ${n}`;
    if (!taken.has(newSpaceFolder({ name, location, refusal: null }))) return name;
  }
};

/**
 * Clickable: first launch → New Space → Create, ending on the opening state.
 * Browse… steps through a few locations in place of the platform's chooser;
 * "Meeting notes" on the Desktop, or "Quarterly review" in Documents, is refused.
 */
export const ClickThrough: Story = () => {
  const [view, setView] = useState<StartWindowView>({ screen: 'start' });
  const [recents, setRecents] = useState<readonly RecentSpace[]>([]);
  const form = view.screen === 'new' ? view.form : DEFAULT_FORM;
  const editForm = (next: Partial<NewSpaceForm>): void =>
    setView({ screen: 'new', form: { ...form, refusal: null, ...next } });
  return (
    <Window>
      <StartWindow
        view={view}
        recents={recents}
        onNewSpace={() => {
          const taken = new Set([...NOT_EMPTY, ...recents.map((recent) => recent.folder)]);
          setView({
            screen: 'new',
            form: { ...DEFAULT_FORM, name: firstFreeName(DOCUMENTS, taken) },
          });
        }}
        onOpenFolder={() =>
          setView({
            screen: 'opening',
            title: 'Quarterly review',
            folder: '~/Documents/Quarterly review',
          })
        }
        onOpenRecent={(id) => {
          const recent = recents.find((entry) => entry.id === id);
          if (recent !== undefined)
            setView({ screen: 'opening', title: recent.title, folder: recent.folder });
        }}
        onRemoveRecent={(id) => setRecents(recents.filter((entry) => entry.id !== id))}
        onNameChange={(name) => editForm({ name })}
        onBrowse={() =>
          editForm({
            location:
              LOCATIONS[(LOCATIONS.indexOf(form.location) + 1) % LOCATIONS.length] ?? DOCUMENTS,
          })
        }
        onCancel={() => setView({ screen: 'start' })}
        onCreate={() => {
          const refusal = refusalFor(
            form,
            new Set([...NOT_EMPTY, ...recents.map((recent) => recent.folder)]),
          );
          if (refusal !== null) {
            setView({ screen: 'new', form: { ...form, refusal } });
            return;
          }
          const title = form.name.trim();
          const folder = newSpaceFolder(form);
          setRecents([{ id: folder, title, folder }, ...recents]);
          setView({ screen: 'opening', title, folder });
        }}
      />
    </Window>
  );
};
ClickThrough.meta = { iframed: true };
