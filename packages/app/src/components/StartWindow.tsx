import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Badge,
  DatabaseIcon,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FolderOpenIcon,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
  PlusIcon,
  Separator,
  SpaceIcon,
  SqliteFileIcon,
  StatusBusy,
} from '@project/ui';
import { newSpaceFolder, type NewSpaceForm } from './start-form';
import { describeNotCreated } from '../start-refusal';
import type { RecentSpace } from '../start-shell';

/**
 * The desktop application's Start window (Storage ST-131, UI-111), drawn
 * from what it is handed: the start screen (New Space, Open Folder…, Open
 * SQLite File…, Connect to PostgreSQL Database… and Recent Spaces), the New
 * Space form, the PostgreSQL form (ADR 0181), and the one status shown while
 * a new Space opens. `StartPage` holds its state and asks the shell.
 */

/** The PostgreSQL form: what is typed, and why the last Connect opened nothing. */
export interface PostgresForm {
  readonly url: string;
  readonly password: string;
  /** The shell's sentence, naming the database without its password. */
  readonly refusal: string | null;
  /** Connect was pressed and the shell has not answered. */
  readonly connecting: boolean;
}

export type StartScreen =
  | { readonly screen: 'start' }
  | { readonly screen: 'new'; readonly form: NewSpaceForm }
  | { readonly screen: 'postgres'; readonly form: PostgresForm }
  | { readonly screen: 'opening'; readonly title: string; readonly folder: string };

export interface StartWindowProps {
  readonly view: StartScreen;
  readonly recents: readonly RecentSpace[];
  readonly onNewSpace: () => void;
  readonly onOpenFolder: () => void;
  readonly onOpenSqliteFile: () => void;
  /** Connect to PostgreSQL Database…: shows the PostgreSQL form. */
  readonly onShowPostgres: () => void;
  readonly onPostgresChange: (next: Pick<PostgresForm, 'url' | 'password'>) => void;
  readonly onConnect: () => void;
  readonly onOpenRecent: (recent: RecentSpace) => void;
  /** Remove is offered only when the shell keeps a history to remove from. */
  readonly onRemoveRecent?: ((recent: RecentSpace) => void) | undefined;
  readonly onNameChange: (name: string) => void;
  readonly onBrowse: () => void;
  /** Open Folder… on a Space written and not opened: its folder. */
  readonly onOpenCreated: (folder: string) => void;
  readonly onCreate: () => void;
  readonly onCancel: () => void;
}

export function StartWindow(props: StartWindowProps) {
  const { view } = props;
  return (
    <main className="flex h-full min-h-screen w-full bg-card text-card-foreground">
      {view.screen === 'start' ? <StartScreenView {...props} /> : null}
      {view.screen === 'new' ? (
        <NewSpaceScreen
          form={view.form}
          onNameChange={props.onNameChange}
          onBrowse={props.onBrowse}
          onOpenCreated={props.onOpenCreated}
          onCreate={props.onCreate}
          onCancel={props.onCancel}
        />
      ) : null}
      {view.screen === 'postgres' ? (
        <PostgresScreen
          form={view.form}
          onChange={props.onPostgresChange}
          onConnect={props.onConnect}
          onCancel={props.onCancel}
        />
      ) : null}
      {view.screen === 'opening' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 p-8 text-center">
          <StatusBusy label={`Opening ${view.title}…`} className="p-0" />
          <p className="text-chrome-xs break-all text-muted-foreground">{view.folder}</p>
        </div>
      ) : null}
    </main>
  );
}

function StartScreenView({
  recents,
  onNewSpace,
  onOpenFolder,
  onOpenSqliteFile,
  onShowPostgres,
  onOpenRecent,
  onRemoveRecent,
}: StartWindowProps) {
  const recentsHeadingId = useId();
  const hintId = useId();
  return (
    <>
      <aside className="flex w-64 shrink-0 flex-col gap-6 bg-secondary p-6">
        <div className="flex flex-col gap-2">
          <span aria-hidden="true" className="text-muted-foreground">
            <SpaceIcon size={28} />
          </span>
          <h1 className="text-chrome-sm font-semibold text-foreground">InfinityCube</h1>
          <p className="text-chrome-xs text-muted-foreground">
            Make a new Space, or open one you already have.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button variant="default" className="justify-start gap-2" onClick={onNewSpace}>
            <PlusIcon />
            New Space
          </Button>
          <Button variant="secondary" className="justify-start gap-2" onClick={onOpenFolder}>
            <FolderOpenIcon />
            Open Folder…
          </Button>
          <Button variant="secondary" className="justify-start gap-2" onClick={onOpenSqliteFile}>
            <SqliteFileIcon />
            Open SQLite File…
          </Button>
          <Button variant="secondary" className="justify-start gap-2" onClick={onShowPostgres}>
            <DatabaseIcon />
            Connect to PostgreSQL Database…
          </Button>
        </div>
      </aside>
      <section
        aria-labelledby={recentsHeadingId}
        className="flex min-w-0 flex-1 flex-col gap-3 p-6"
      >
        <div className="flex items-baseline justify-between gap-4">
          <h2 id={recentsHeadingId} className="text-chrome-sm font-semibold text-foreground">
            Recent Spaces
          </h2>
          {recents.length > 0 ? (
            <p id={hintId} className="text-chrome-xs text-muted-foreground">
              Select a Space to open it
            </p>
          ) : null}
        </div>
        {recents.length === 0 ? (
          <Empty className="border border-border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SpaceIcon size={16} />
              </EmptyMedia>
              <EmptyTitle>No recent Spaces yet</EmptyTitle>
              <EmptyDescription>
                Spaces you make or open will be listed here, so you can come back to them.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ItemGroup aria-describedby={hintId} className="-mx-2 min-h-0 overflow-y-auto">
            {recents.map((recent) => (
              <div role="listitem" key={recent.folder}>
                {recent.problem === undefined ? (
                  <RecentEntry recent={recent} onOpen={() => onOpenRecent(recent)} />
                ) : (
                  <ProblemEntry
                    recent={recent}
                    problem={recent.problem}
                    onRetry={() => onOpenRecent(recent)}
                    onRemove={
                      onRemoveRecent === undefined ? undefined : () => onRemoveRecent(recent)
                    }
                  />
                )}
              </div>
            ))}
          </ItemGroup>
        )}
      </section>
    </>
  );
}

function RecentEntry({ recent, onOpen }: { recent: RecentSpace; onOpen: () => void }) {
  const isOpen = recent.open === true;
  return (
    <Item
      size="xs"
      className="w-full"
      render={<button type="button" />}
      aria-label={isOpen ? `${recent.title}, already open. Show its window` : undefined}
      onClick={onOpen}
    >
      <ItemContent className="gap-0.5">
        <ItemTitle className="text-foreground">
          <span className="truncate">{recent.title}</span>
          {isOpen ? (
            <Badge variant="secondary" aria-hidden="true">
              Open
            </Badge>
          ) : null}
        </ItemTitle>
        <ItemDescription className="truncate">{recent.folder}</ItemDescription>
      </ItemContent>
    </Item>
  );
}

function ProblemEntry({
  recent,
  problem,
  onRetry,
  onRemove,
}: {
  recent: RecentSpace;
  problem: NonNullable<RecentSpace['problem']>;
  onRetry: () => void;
  onRemove: (() => void) | undefined;
}) {
  const reasonId = useId();
  return (
    <Item size="xs" className="w-full items-start">
      <ItemMedia className="text-destructive">
        <AlertIcon />
      </ItemMedia>
      <ItemContent className="gap-0.5">
        <ItemTitle className="text-muted-foreground">
          <span className="truncate">{recent.title}</span>
        </ItemTitle>
        <ItemDescription className="truncate">{recent.folder}</ItemDescription>
        <ItemDescription id={reasonId} className="text-destructive">
          {problem.reason}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        {problem.kind === 'failed' ? (
          <Button
            variant="ghost"
            size="compact"
            aria-label={`Try again to open ${recent.title}`}
            aria-describedby={reasonId}
            onClick={onRetry}
          >
            Try again
          </Button>
        ) : null}
        {onRemove === undefined ? null : (
          <Button
            variant="ghost"
            size="compact"
            aria-label={`Remove ${recent.title} from recent Spaces`}
            aria-describedby={reasonId}
            onClick={onRemove}
          >
            Remove
          </Button>
        )}
      </ItemActions>
    </Item>
  );
}

function NewSpaceScreen({
  form,
  onNameChange,
  onBrowse,
  onOpenCreated,
  onCreate,
  onCancel,
}: {
  form: NewSpaceForm;
  onNameChange: (name: string) => void;
  onBrowse: () => void;
  onOpenCreated: (folder: string) => void;
  onCreate: () => void;
  onCancel: () => void;
}) {
  const headingId = useId();
  const nameId = useId();
  const nameErrorId = useId();
  const locationId = useId();
  const locationErrorId = useId();
  const folderId = useId();
  const nameInput = useRef<HTMLInputElement>(null);
  const browseButton = useRef<HTMLButtonElement>(null);
  const words = form.notCreated === null ? null : describeNotCreated(form.notCreated, form);
  const onName = words?.place === 'name' ? words : null;
  const onLocation = words?.place === 'location' ? words : null;
  const notice = words?.place === 'notice' ? words : null;
  const openFolder = notice?.openFolder ?? null;

  // Focus goes where the next keystroke makes the fix: Browse… for a cause
  // on Location, otherwise the name, selected. A reason cleared by editing
  // moves nothing, so a draft being typed keeps its caret.
  const causeOnLocation = onLocation !== null;
  const focused = useRef(false);
  useEffect(() => {
    if (focused.current && form.notCreated === null) return;
    focused.current = true;
    if (causeOnLocation) {
      browseButton.current?.focus();
      return;
    }
    nameInput.current?.focus();
    nameInput.current?.select();
  }, [form.notCreated, causeOnLocation]);

  // While a cause shows on Location, Browse… is the default button and its
  // click asks for a Location; the submit it also makes creates nothing.
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (onLocation === null) onCreate();
  };

  const nameDescribedBy = [
    onName === null ? null : nameErrorId,
    onLocation === null ? folderId : null,
  ]
    .filter((id) => id !== null)
    .join(' ');

  return (
    <form
      aria-labelledby={headingId}
      noValidate
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel();
      }}
      className="m-auto flex w-full max-w-md flex-col gap-5 px-8 py-6"
    >
      <div className="flex flex-col gap-1">
        <h1 id={headingId} className="text-chrome-sm font-semibold text-foreground">
          New Space
        </h1>
        <p className="text-chrome-xs text-muted-foreground">
          Name your Space and choose where to keep it. You can rename it later.
        </p>
      </div>
      <FieldGroup>
        <Field data-invalid={onName !== null}>
          <FieldLabel htmlFor={nameId}>Name</FieldLabel>
          <Input
            ref={nameInput}
            id={nameId}
            value={form.name}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={onName !== null}
            aria-describedby={nameDescribedBy === '' ? undefined : nameDescribedBy}
            onChange={(event) => onNameChange(event.target.value)}
          />
          {onName === null ? null : <FieldError id={nameErrorId}>{onName.sentence}</FieldError>}
        </Field>
        <Field data-invalid={onLocation !== null}>
          <FieldLabel htmlFor={locationId}>Location</FieldLabel>
          <InputGroup>
            <InputGroupInput
              id={locationId}
              value={form.location}
              readOnly
              aria-invalid={onLocation !== null}
              aria-describedby={onLocation === null ? folderId : locationErrorId}
            />
            <InputGroupAddon align="inline-end">
              {/* The fix for a cause on Location, so it is the button to press. */}
              {/* Enter submits the form through its default button, its first
                  submit button, which Browse… is while a cause shows here. */}
              <InputGroupButton
                ref={browseButton}
                type={onLocation === null ? 'button' : 'submit'}
                variant={onLocation === null ? 'secondary' : 'default'}
                aria-describedby={onLocation === null ? undefined : locationErrorId}
                onClick={onBrowse}
              >
                Browse…
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          {onLocation === null ? (
            <FieldDescription id={folderId}>
              {onName !== null ? (
                'Choose a name to see the folder it creates.'
              ) : (
                <>
                  Creates the folder{' '}
                  <span className="font-medium break-all text-foreground">
                    {newSpaceFolder(form)}
                  </span>
                </>
              )}
            </FieldDescription>
          ) : (
            <WithDetails detail={onLocation.detail}>
              <FieldError id={locationErrorId} className="inline">
                {onLocation.sentence}
              </FieldError>
            </WithDetails>
          )}
        </Field>
      </FieldGroup>
      {notice === null ? null : (
        <Alert variant="destructive">
          <AlertIcon />
          <WithDetails
            detail={notice.detail}
            action={
              openFolder === null ? null : (
                <Button
                  variant="link"
                  size="compact"
                  className="ml-1.5"
                  onClick={() => onOpenCreated(openFolder)}
                >
                  Open Folder…
                </Button>
              )
            }
          >
            <AlertDescription className="inline">{notice.sentence}</AlertDescription>
          </WithDetails>
        </Alert>
      )}
      <Separator />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type={onLocation === null ? 'submit' : 'button'}
          variant={onLocation === null ? 'default' : 'secondary'}
          onClick={onLocation === null ? undefined : onCreate}
        >
          Create Space
        </Button>
      </div>
    </form>
  );
}

/**
 * The form naming a PostgreSQL database (ADR 0181): its URL, and a separate
 * Password field for one the URL leaves out. Connect hands both to the shell,
 * which keeps neither; while it connects one status shows, and why it opened
 * nothing comes back as a notice above the buttons with the fields kept.
 */
function PostgresScreen({
  form,
  onChange,
  onConnect,
  onCancel,
}: {
  form: PostgresForm;
  onChange: (next: Pick<PostgresForm, 'url' | 'password'>) => void;
  onConnect: () => void;
  onCancel: () => void;
}) {
  const headingId = useId();
  const urlId = useId();
  const passwordId = useId();
  const passwordHelpId = useId();
  const urlInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    urlInput.current?.focus();
  }, []);
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!form.connecting) onConnect();
  };
  return (
    <form
      aria-labelledby={headingId}
      noValidate
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel();
      }}
      className="m-auto flex w-full max-w-md flex-col gap-5 px-8 py-6"
    >
      <div className="flex flex-col gap-1">
        <h1 id={headingId} className="text-chrome-sm font-semibold text-foreground">
          Connect to a PostgreSQL Database
        </h1>
        <p className="text-chrome-xs text-muted-foreground">
          Open a Space kept in a PostgreSQL database that has been migrated for InfinityCube.
        </p>
      </div>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={urlId}>URL</FieldLabel>
          <Input
            ref={urlInput}
            id={urlId}
            value={form.url}
            placeholder="postgres://user@host:5432/database"
            autoComplete="off"
            spellCheck={false}
            readOnly={form.connecting}
            onChange={(event) => onChange({ url: event.target.value, password: form.password })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={passwordId}>Password</FieldLabel>
          <Input
            id={passwordId}
            type="password"
            value={form.password}
            autoComplete="off"
            readOnly={form.connecting}
            aria-describedby={passwordHelpId}
            onChange={(event) => onChange({ url: form.url, password: event.target.value })}
          />
          <FieldDescription id={passwordHelpId}>
            InfinityCube keeps the URL without its password. Leave Password empty to use PGPASSWORD
            or your password file.
          </FieldDescription>
        </Field>
      </FieldGroup>
      {form.refusal === null ? null : (
        <Alert variant="destructive">
          <AlertIcon />
          <AlertDescription className="break-all">{form.refusal}</AlertDescription>
        </Alert>
      )}
      {form.connecting ? (
        <StatusBusy label="Connecting to the PostgreSQL database…" className="p-0" />
      ) : null}
      <Separator />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        {/* Not disabled while connecting, so focus stays in the form and
            Escape still answers; a second submit is ignored. */}
        <Button type="submit" variant="default">
          Connect
        </Button>
      </div>
    </form>
  );
}

/**
 * A sentence, set inline, with the system's words behind a Details toggle
 * after it, closed until pressed (UI-111), and any `action` before the
 * toggle; with no detail, the sentence alone.
 */
function WithDetails({
  detail,
  action,
  children,
}: {
  detail: string | null;
  action?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (detail === null) return children;
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex min-w-0 flex-col gap-1.5">
      <div className="text-sm">
        {children}
        {action}
        <CollapsibleTrigger render={<Button variant="link" size="compact" className="ml-1.5" />}>
          {open ? 'Hide details' : 'Details'}
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <pre
          role="region"
          tabIndex={0}
          aria-label="What the system said"
          className="max-h-20 overflow-auto rounded-md bg-muted px-2 py-1 font-mono text-chrome-xs break-all whitespace-pre-wrap text-muted-foreground"
        >
          {detail}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}
