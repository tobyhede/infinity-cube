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
  /** Not one folder name, in the shell's sentence: shown on Name. */
  z.object({ of: z.literal('name'), message: z.string() }),
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
        // Refused by the shell before the command ran, which rejects with its
        // reason in words; the command answers rather than rejects.
        return {
          of: 'failed',
          detail: error instanceof Error ? error.message : String(error),
          kept: false,
        };
      }
    },
    openFolder: () => fire('start_open_folder'),
    openRecent: (folder) => fire('start_open_recent', { folder }),
    close: () => fire('start_close'),
  };
}
