/**
 * A throwaway drawing of the desktop application's Start window (ADR 0170,
 * Storage ST-131) for design review: plain props in, callbacks out, no shell,
 * no commands. `.scratch/start-window/issues/02-build-the-start-window.md`
 * rebuilds the accepted design through `shadcn-first-ui`; nothing here is
 * production code or catalogue evidence.
 */
import { useEffect, useId, useRef, type FormEvent, type ReactNode } from 'react';
import {
  AlertIcon,
  Badge,
  Button,
  cn,
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
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  PlusIcon,
  Separator,
  SpaceIcon,
  Spinner,
} from '@project/ui';

/** Why a recent Space did not open at launch, said on its entry. */
export interface RecentSpaceProblem {
  /** `gone`: its folder is not there. `failed`: its folder is there and did not open. */
  readonly kind: 'gone' | 'failed';
  readonly reason: string;
}

export interface RecentSpace {
  readonly id: string;
  /** The Space's Title. */
  readonly title: string;
  /** The folder, as the person would recognise it (`~/Documents/…`). */
  readonly folder: string;
  readonly problem?: RecentSpaceProblem;
  /** Already open in a Space window: selecting it brings that window forward. */
  readonly open?: boolean;
}

export interface NewSpaceForm {
  readonly name: string;
  /** The folder the new Space's folder is written inside. */
  readonly location: string;
  /**
   * Why Create was refused, said beside the Name field; `null` when it was not.
   * `name`: the name cannot be a folder name, so no folder is shown.
   * `folder`: the folder `<location>/<name>` already holds files.
   */
  readonly refusal: { readonly of: 'name' | 'folder'; readonly message: string } | null;
}

export type StartWindowView =
  | { readonly screen: 'start' }
  | {
      readonly screen: 'new';
      readonly form: NewSpaceForm;
      /** Cancel closes the window rather than returning to the start screen. */
      readonly cancelCloses?: boolean;
    }
  | { readonly screen: 'opening'; readonly title: string; readonly folder: string };

export interface StartWindowProps {
  readonly view: StartWindowView;
  readonly recents: readonly RecentSpace[];
  readonly onNewSpace?: () => void;
  readonly onOpenFolder?: () => void;
  readonly onOpenRecent?: (id: string) => void;
  readonly onRemoveRecent?: (id: string) => void;
  readonly onNameChange?: (name: string) => void;
  readonly onBrowse?: () => void;
  readonly onCreate?: () => void;
  readonly onCancel?: () => void;
}

const noop = (): void => undefined;

/** The folder New Space writes: `<location>/<name>`. */
export const newSpaceFolder = (form: NewSpaceForm): string =>
  `${form.location.replace(/\/+$/u, '')}/${form.name.trim()}`;

export function StartWindow(props: StartWindowProps) {
  const { view } = props;
  return (
    <main className="flex h-full min-h-0 w-full bg-card text-card-foreground">
      {view.screen === 'start' ? <StartScreen {...props} /> : null}
      {view.screen === 'new' ? (
        <NewSpaceScreen
          form={view.form}
          cancelLabel={view.cancelCloses === true ? 'Cancel' : 'Back'}
          onNameChange={props.onNameChange ?? noop}
          onBrowse={props.onBrowse ?? noop}
          onCreate={props.onCreate ?? noop}
          onCancel={props.onCancel ?? noop}
        />
      ) : null}
      {view.screen === 'opening' ? <OpeningScreen title={view.title} folder={view.folder} /> : null}
    </main>
  );
}

function StartScreen({
  recents,
  onNewSpace = noop,
  onOpenFolder = noop,
  onOpenRecent = noop,
  onRemoveRecent = noop,
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
          <h1 className="text-lg font-semibold tracking-tight text-foreground">InfinityCube</h1>
          <p className="text-chrome-sm text-muted-foreground">
            Make a new Space, or open one you already have.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button variant="default" className="justify-start gap-2" onClick={onNewSpace}>
            <PlusIcon />
            New Space
          </Button>
          <Button variant="secondary" className="justify-start" onClick={onOpenFolder}>
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
          <ul className="-mx-2 flex min-h-0 flex-col overflow-y-auto">
            {recents.map((recent) => (
              <li key={recent.id}>
                {recent.problem === undefined ? (
                  <RecentEntry recent={recent} onOpen={() => onOpenRecent(recent.id)} />
                ) : (
                  <ProblemEntry
                    recent={recent}
                    problem={recent.problem}
                    onRetry={() => onOpenRecent(recent.id)}
                    onRemove={() => onRemoveRecent(recent.id)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function RecentEntry({ recent, onOpen }: { recent: RecentSpace; onOpen: () => void }) {
  const isOpen = recent.open === true;
  return (
    <Button
      variant="ghost"
      className="w-full flex-col items-start gap-0.5 px-2 py-2 text-left whitespace-normal"
      aria-label={isOpen ? `${recent.title}, already open. Show its window` : undefined}
      onClick={onOpen}
    >
      <span className="flex w-full min-w-0 items-center gap-2">
        <span className="truncate font-medium text-foreground">{recent.title}</span>
        {isOpen ? (
          <Badge variant="secondary" aria-hidden="true">
            Open
          </Badge>
        ) : null}
      </span>
      <span className="w-full truncate text-chrome-xs text-muted-foreground">{recent.folder}</span>
    </Button>
  );
}

function ProblemEntry({
  recent,
  problem,
  onRetry,
  onRemove,
}: {
  recent: RecentSpace;
  problem: RecentSpaceProblem;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const reasonId = useId();
  return (
    <div className="flex items-start gap-3 border border-transparent px-2 py-2">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-chrome-sm">
        <span className="truncate font-medium text-muted-foreground">{recent.title}</span>
        <span className="truncate text-chrome-xs text-muted-foreground">{recent.folder}</span>
        <span
          id={reasonId}
          className="mt-1 flex items-start gap-1.5 text-chrome-xs text-destructive [&_svg]:mt-px [&_svg]:size-3.5 [&_svg]:shrink-0"
        >
          <AlertIcon />
          {problem.reason}
        </span>
      </div>
      <div className="flex shrink-0 gap-1">
        {problem.kind === 'failed' ? (
          <Button
            variant="ghost"
            size="compact"
            aria-label={`Try opening ${recent.title} again`}
            aria-describedby={reasonId}
            onClick={onRetry}
          >
            Try again
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="compact"
          aria-label={`Remove ${recent.title} from recent Spaces`}
          aria-describedby={reasonId}
          onClick={onRemove}
        >
          Remove
        </Button>
      </div>
    </div>
  );
}

function NewSpaceScreen({
  form,
  cancelLabel,
  onNameChange,
  onBrowse,
  onCreate,
  onCancel,
}: {
  form: NewSpaceForm;
  cancelLabel: string;
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
        <h1 id={headingId} className="text-lg font-semibold tracking-tight text-foreground">
          New Space
        </h1>
        <p className="text-chrome-sm text-muted-foreground">
          Give it a name and choose where to keep it. You can rename it later.
        </p>
      </div>
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
          {cancelLabel}
        </Button>
        <Button type="submit" variant="default">
          Create Space
        </Button>
      </div>
    </form>
  );
}

function OpeningScreen({ title, folder }: { title: string; folder: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <Spinner className="size-6 text-muted-foreground" aria-hidden="true" role={undefined} />
      <p role="status" className="text-chrome-sm font-medium text-foreground">
        Opening {title}…
      </p>
      <p className="text-chrome-xs text-muted-foreground">{folder}</p>
    </div>
  );
}

/**
 * Illustration only: a window's frame, so the review can show the Start window
 * beside a Space window. The real frames are the platform's.
 */
export function WindowFrame({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden border border-border bg-card shadow-xl',
        className,
      )}
    >
      <div className="flex h-8 shrink-0 items-center justify-center border-b border-border bg-secondary text-chrome-xs text-muted-foreground">
        {title}
      </div>
      <div className="flex min-h-0 flex-1">{children}</div>
    </div>
  );
}
