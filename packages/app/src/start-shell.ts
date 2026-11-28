import type { JsonValue } from '@project/core';
import { z } from 'zod';

/**
 * What the Start window's page asks of the desktop shell (Storage ST-131),
 * and the shell's own implementation over the invoke commands its window
 * alone may call (`packages/desktop/src-tauri/src/start.rs`,
 * `capabilities/start.json`). The page is drawn against this interface, so a
 * test or a story answers in the shell's place.
 */

const newSpaceDefaultsSchema = z.object({
  /** The folder the new Space's folder goes in. */
  location: z.string(),
  /** `Untitled Space`, or the first free name after it, in `location`. */
  name: z.string(),
  /** The platform's path separator, for naming `<location>/<name>`. */
  separator: z.string(),
});

const recentSpaceSchema = z.object({
  title: z.string(),
  folder: z.string(),
  /** Open in a window: choosing it shows that window. */
  open: z.boolean().optional(),
  /** Why it did not open at launch, or that its folder is gone. */
  problem: z.object({ kind: z.enum(['gone', 'failed']), reason: z.string() }).optional(),
});

const startWindowViewSchema = z.object({
  recents: z.array(recentSpaceSchema).readonly(),
  newSpace: newSpaceDefaultsSchema,
});

/**
 * Why Create Space wrote nothing, or opened nothing, by stable code
 * (`NotCreated::to_page` in `start.rs`). The page words each code
 * (`start-refusal.ts`); `detail` is the system's own words, shown only behind
 * Details.
 */
const notCreatedSchema = z.union([
  /** The name breaks one of New Space's rules: shown on Name. */
  z.object({
    of: z.literal('name'),
    rule: z.enum(['not-a-folder-name', 'reserved', 'trailing-dot-or-space', 'taken-by-a-file']),
  }),
  /** The name holds `character`, which Windows forbids: shown on Name. */
  z.object({
    of: z.literal('name'),
    rule: z.literal('forbidden-character'),
    character: z.string(),
  }),
  /** `<location>/<name>` holds something: shown on Name. */
  z.object({ of: z.literal('folder') }),
  /** Fixed by choosing another Location: shown on Location. */
  z.object({
    of: z.enum(['no-permission', 'read-only', 'location-gone']),
    detail: z.string(),
  }),
  /** No field fixes it: a notice, saying whether anything was left in the folder. */
  z.object({ of: z.enum(['disk-full', 'failed']), detail: z.string(), kept: z.boolean() }),
  /** Written to `folder` and not opened: a notice offering to open it. */
  z.object({ of: z.literal('not-opened'), folder: z.string(), detail: z.string() }),
]);

export type NewSpaceDefaults = z.infer<typeof newSpaceDefaultsSchema>;
export type RecentSpace = z.infer<typeof recentSpaceSchema>;
export type StartWindowView = z.infer<typeof startWindowViewSchema>;
export type NotCreated = z.infer<typeof notCreatedSchema>;

export interface StartShell {
  /** The recent Spaces and the New Space form's defaults. */
  view(): Promise<StartWindowView>;
  /** The platform's folder chooser for Location; `null` when cancelled. */
  browse(location: string): Promise<NewSpaceDefaults | null>;
  /**
   * Write `<location>/<name>` and open it, answering `null` once its window
   * has opened (the shell then closes this one), or why not.
   */
  createSpace(location: string, name: string): Promise<NotCreated | null>;
  /** Open Folder…: the platform's folder chooser, as File › Open… asks. */
  openFolder(): void;
  /** Open a recent Space's folder, or a new Space's that did not open. */
  openRecent(folder: string): void;
  /** Open SQLite File…: the platform's file chooser (ADR 0181). */
  openSqliteFile(): void;
  /**
   * Open the PostgreSQL database `url` names, connected with `password` when
   * it is not empty, answering `null` once its window has opened (the shell
   * then closes this one), or why not, naming the database without its
   * password (ADR 0181).
   */
  connectPostgres(url: string, password: string): Promise<string | null>;
  /** Close the Start window. */
  close(): void;
}

/**
 * What the page reads of the global Tauri sets (`app.withGlobalTauri`): a
 * command's answer is the JSON its Rust return value serializes to, and an
 * invoke the shell refuses (a permission this window lacks) rejects.
 */
export interface TauriInvoke {
  invoke(command: string, args?: Record<string, string>): Promise<JsonValue>;
}

/** The shell's answers to the Start window, through `invoke`. */
export function tauriStartShell(tauri: TauriInvoke): StartShell {
  const invokeIgnoringRefusal = (command: string, args?: Record<string, string>): void => {
    // These commands answer nothing the page draws, and the page has nowhere
    // to show an invoke the shell refused, so a refusal is dropped.
    tauri.invoke(command, args).catch(() => undefined);
  };
  return {
    view: async () => startWindowViewSchema.parse(await tauri.invoke('start_window_view')),
    browse: async (location) =>
      newSpaceDefaultsSchema.nullable().parse(await tauri.invoke('start_browse', { location })),
    createSpace: async (location, name) => {
      try {
        return notCreatedSchema
          .nullable()
          .parse(await tauri.invoke('start_create_space', { location, name }));
      } catch (error) {
        // An invoke the shell refused, or an answer the schema does not
        // read: either way nothing the page can place on a field.
        return {
          of: 'failed',
          detail: error instanceof Error ? error.message : String(error),
          kept: false,
        };
      }
    },
    openFolder: () => invokeIgnoringRefusal('start_open_folder'),
    openRecent: (folder) => invokeIgnoringRefusal('start_open_recent', { folder }),
    openSqliteFile: () => invokeIgnoringRefusal('start_open_sqlite_file'),
    connectPostgres: async (url, password) => {
      try {
        return z
          .string()
          .nullable()
          .parse(await tauri.invoke('start_connect_postgres', { url, password }));
      } catch (error) {
        // An invoke the shell refused, or an answer the schema does not
        // read: either way the page shows it as why nothing opened.
        return error instanceof Error ? error.message : String(error);
      }
    },
    close: () => invokeIgnoringRefusal('start_close'),
  };
}
