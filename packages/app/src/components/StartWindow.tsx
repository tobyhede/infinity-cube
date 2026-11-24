import { useEffect, useId, useRef, type FormEvent } from 'react';
import {
  AlertIcon,
  Badge,
  Button,
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
  StatusFailure,
} from '@project/ui';
import { newSpaceFolder, type NewSpaceForm } from './start-form';
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
  onCreate,
  onCancel,
}: {
  form: NewSpaceForm;
  onNameChange: (name: string) => void;
  onBrowse: () => void;
  onCreate: () => void;
  onCancel: () => void;
}) {
  const headingId = useId();
  const nameId = useId();
  const nameErrorId = useId();
  const locationId = useId();
  const folderId = useId();
  const nameInput = useRef<HTMLInputElement>(null);
  const refused = form.refusal !== null;

  useEffect(() => {
    nameInput.current?.focus();
    nameInput.current?.select();
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onCreate();
  };

  return (
    <form
      aria-labelledby={headingId}
      noValidate
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel();
      }}
      className="mx-auto flex w-full max-w-md flex-col justify-center gap-6 p-8"
    >
      <div className="flex flex-col gap-1">
        <h1 id={headingId} className="text-chrome-sm font-semibold text-foreground">
          New Space
        </h1>
        <p className="text-chrome-xs text-muted-foreground">
          Give it a name and choose where to keep it. You can rename it later.
        </p>
      </div>
      {form.failure === null ? null : (
        <StatusFailure
          title="The Space could not be created"
          description="Nothing was opened. Try again, choose another name or Location, or cancel."
          detail={form.failure}
          detailLabel="Why the Space could not be created"
          className="p-0"
          boundedDetail
        />
      )}
      <FieldGroup>
        <Field data-invalid={refused}>
          <FieldLabel htmlFor={nameId}>Name</FieldLabel>
          <Input
            ref={nameInput}
            id={nameId}
            value={form.name}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={refused}
            aria-describedby={refused ? `${nameErrorId} ${folderId}` : folderId}
            onChange={(event) => onNameChange(event.target.value)}
          />
          {refused ? <FieldError id={nameErrorId}>{form.refusal.message}</FieldError> : null}
        </Field>
        <Field>
          <FieldLabel htmlFor={locationId}>Location</FieldLabel>
          <InputGroup>
            <InputGroupInput id={locationId} value={form.location} readOnly />
            <InputGroupAddon align="inline-end">
              <InputGroupButton variant="secondary" onClick={onBrowse}>
                Browse…
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          <FieldDescription id={folderId}>
            {form.refusal?.of === 'name' ? (
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
        </Field>
      </FieldGroup>
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
