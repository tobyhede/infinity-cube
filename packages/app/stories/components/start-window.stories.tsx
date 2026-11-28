import type { ReactNode } from 'react';
import type { Story } from '@ladle/react';
import { StartPage } from '#components/StartPage';
import { StartWindow } from '#components/StartWindow';
import type { NotCreated } from '#src/start-shell';
import { storyStartShell } from '../support/start-shell-fixture';

/**
 * The desktop application's Start window (Storage ST-131, UI-111): the page
 * the shell builds as `start.html`, drawn here with a stand-in for the
 * shell's invoke commands (`support/start-shell-fixture.ts`). The window is
 * the page, so each story fills its own frame at about the size the shell
 * opens it.
 */
export default { title: 'Components/Start Window' };

const Window = ({ children }: { children: ReactNode }) => (
  <div className="h-[520px] w-[720px] overflow-hidden border border-border">{children}</div>
);

/**
 * A launch with nothing to open and nothing kept: New Space the default
 * button, Open Folder…, Open SQLite File… and Connect to PostgreSQL
 * Database… beside it, and Recent's empty state. New Space opens the form on
 * Documents; a name with `/` is refused beside it, and the name `Disk full`
 * stands in for a write that fails. The PostgreSQL form refuses a URL naming
 * the database `unmigrated` as the shell refuses one it cannot read.
 */
export const FirstLaunch: Story = () => (
  <Window>
    <StartPage shell={storyStartShell([])} />
  </Window>
);
FirstLaunch.meta = { iframed: true };

const noop = (): void => undefined;

/**
 * The New Space form after a Create Space the shell answered with
 * `notCreated`, at the window's size: each cause shows where it can be fixed
 * (UI-111), the system's words behind a closed Details.
 */
const Refused = ({
  name = 'Untitled Space 3',
  location = '/Users/ada/Documents',
  notCreated,
}: {
  name?: string;
  location?: string;
  notCreated: NotCreated;
}) => (
  <Window>
    <StartWindow
      view={{ screen: 'new', form: { name, location, separator: '/', notCreated } }}
      recents={[]}
      onNewSpace={noop}
      onOpenFolder={noop}
      onOpenSqliteFile={noop}
      onShowPostgres={noop}
      onPostgresChange={noop}
      onConnect={noop}
      onOpenRecent={noop}
      onNameChange={noop}
      onBrowse={noop}
      onOpenCreated={noop}
      onCreate={noop}
      onCancel={noop}
    />
  </Window>
);

/** 1 · A name that is not one folder name, on Name. */
export const NameNotAFolderName: Story = () => (
  <Refused name="Q3/Q4 review" notCreated={{ of: 'name', rule: 'not-a-folder-name' }} />
);

/** 2 · A folder by that name already holds files, on Name. */
export const NameFolderHoldsFiles: Story = () => (
  <Refused name="Untitled Space" notCreated={{ of: 'folder' }} />
);

/** 3 · No permission to create folders in the Location, on Location. */
export const LocationNoPermission: Story = () => (
  <Refused
    notCreated={{
      of: 'no-permission',
      detail: 'the directory could not be listed: Permission denied (os error 13)',
    }}
  />
);

/** 4 · The Location's disk is read-only, on Location. */
export const LocationReadOnly: Story = () => (
  <Refused
    location="/Volumes/Archive"
    notCreated={{
      of: 'read-only',
      detail: '/Volumes/Archive/Untitled Space 3: Read-only file system (os error 30)',
    }}
  />
);

/** 5 · The Location is gone, on Location. */
export const LocationGone: Story = () => (
  <Refused
    location="/Volumes/USB Stick/Slides"
    notCreated={{
      of: 'location-gone',
      detail: '/Volumes/USB Stick/Slides/Untitled Space 3: Not a directory (os error 20)',
    }}
  />
);

/** 6 · The disk is full, as a notice above the buttons. */
export const DiskFull: Story = () => (
  <Refused
    notCreated={{
      of: 'disk-full',
      detail: '/Users/ada/Documents/Untitled Space 3: No space left on device (os error 28)',
      kept: false,
    }}
  />
);

/** 7 · Created but not opened, as a notice offering Open Folder…. */
export const CreatedNotOpened: Story = () => (
  <Refused
    notCreated={{
      of: 'not-opened',
      folder: '/Users/ada/Documents/Untitled Space 3',
      detail: 'Could not open /Users/ada/Documents/Untitled Space 3: the window could not be built',
    }}
  />
);

/** 8 · Anything else, as a notice. */
export const AnythingElse: Story = () => (
  <Refused
    notCreated={{
      of: 'failed',
      detail: '/Users/ada/Documents/Untitled Space 3: Input/output error (os error 5)',
      kept: false,
    }}
  />
);
