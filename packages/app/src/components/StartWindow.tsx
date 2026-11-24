import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Badge,
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
  StatusBusy,
} from '@project/ui';
import { newSpaceFolder, type NewSpaceForm } from './start-form';
import { describeNotCreated } from '../start-refusal';
import type { RecentSpace } from '../start-shell';

/**
 * The desktop application's Start window (Storage ST-131, UI-111), drawn
 * from what it is handed: the start screen (New Space, Open Folder… and
 * Recent Spaces), the New Space form, and the one status shown while a new
 * Space opens. `StartPage` holds its state and asks the shell.
 */

export type StartScreen =
  | { readonly screen: 'start' }
  | { readonly screen: 'new'; readonly form: NewSpaceForm }
  | { readonly screen: 'opening'; readonly title: string; readonly folder: string };

export interface StartWindowProps {
  readonly view: StartScreen;
  readonly recents: readonly RecentSpace[];
  readonly onNewSpace: () => void;
  readonly onOpenFolder: () => void;
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
  const words = form.notCreated === null ? null : describeNotCreated(form.notCreated, form);
  const onName = words?.place === 'name' ? words : null;
  const onLocation = words?.place === 'location' ? words : null;
  const notice = words?.place === 'notice' ? words : null;
  const openFolder = notice?.openFolder ?? null;

  useEffect(() => {
    nameInput.current?.focus();
    nameInput.current?.select();
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onCreate();
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
          Give it a name and choose where to keep it. You can rename it later.
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
              <InputGroupButton
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
              {form.notCreated?.of === 'name' ? (
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
                  variant="ghost"
                  size="compact"
                  className={IN_LINE}
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
        <Button type="submit" variant="default">
          Create Space
        </Button>
      </div>
    </form>
  );
}

/**
 * A command set in a sentence's line, after it: a ghost button with no box of
 * its own, in the sentence's colour and underlined, as the approved design
 * draws Details and Open Folder…, so a failure takes no row more than its
 * sentence and Create Space stays in view at the window's size.
 */
const IN_LINE =
  'ml-1.5 h-auto p-0 align-baseline text-inherit underline underline-offset-2 hover:border-transparent hover:bg-transparent hover:text-inherit hover:decoration-2 aria-expanded:bg-transparent aria-expanded:text-inherit';

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
        <CollapsibleTrigger render={<Button variant="ghost" size="compact" className={IN_LINE} />}>
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
