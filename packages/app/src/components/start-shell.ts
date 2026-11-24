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

const notCreatedSchema = z.object({
  /**
   * `name`: not one folder name; `folder`: `<location>/<name>` holds
   * something or cannot be looked in (both shown beside Name); `failed`: the
   * write, or opening what it wrote, failed after both were accepted.
   */
  of: z.enum(['name', 'folder', 'failed']),
  message: z.string(),
});

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
  /** Open a recent Space's folder. */
  openRecent(folder: string): void;
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
  const fire = (command: string, args?: Record<string, string>): void => {
    // The shell says why a folder did not open in a dialog of its own.
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
        // Refused by the shell, which rejects with its reason in words.
        return { of: 'failed', message: error instanceof Error ? error.message : String(error) };
      }
    },
    openFolder: () => fire('start_open_folder'),
    openRecent: (folder) => fire('start_open_recent', { folder }),
    close: () => fire('start_close'),
  };
}
