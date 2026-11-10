/* v8 ignore next -- V8 attributes ESM module initialization to this import as a function. */
import { z } from 'zod';

/**
 * The domain half of the Resource API (ADR 0142): what a Resource plugin
 * declares about its Resources, and the one structure a Resource is. It names
 * no view and imports no React, because the server and the CLI load it.
 */

/**
 * The version of this API, which every plugin declares it was written for. The
 * build-time plugin list accepts only this one (`pluginList`), so a plugin
 * written against another version fails the typecheck and refuses to load.
 */
export const API_VERSION = 1;

/** A Resource's identity, a UUID. */
export type ResourceId = string;

/**
 * A Resource: the one structure, the same value in a Resource file, in a store,
 * on the wire and given to a plugin. `content` is what its plugin's content
 * schema parses.
 */
export interface Resource<C> {
  readonly id: ResourceId;
  readonly title: string;
  readonly kind: string;
  readonly content: C;
}

/** A rect's dimensions, in canvas units. */
export interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * How a commit settled. `refused` carries copy the host has already worded
 * from the refusal's stable identity (ADR 0057): a plugin shows it, keeps its
 * draft, and never branches on, compares or parses it.
 */
export type Answer = 'completed' | 'unchanged' | { readonly refused: string };

/**
 * A value a plugin keeps, with its commit when the surface offers one. Absent,
 * the surface offers no way to change it, and that is all a plugin learns.
 */
export interface Kept<T> {
  readonly value: T;
  readonly commit?: (next: T) => Promise<Answer>;
}

/**
 * A reference to a stored asset: `/assets/` then the SHA-256 of its bytes as 43
 * characters of unpadded base64url (ADR 0106), always a whole string value.
 */
export type AssetRef = `/assets/${string}`;

const ASSET_REF = /^\/assets\/[A-Za-z0-9_-]{43}$/u;

/** Whether a string is an asset reference. */
export const isAssetRef = (value: string): value is AssetRef => ASSET_REF.test(value);

/** The runtime parser the host's walk and a plugin's content schema share. */
export const assetRefSchema = z.string().refine(isAssetRef, 'An asset reference.');

/**
 * The outlines the canvas strokes a Resource's border and ring on (ADR 0135,
 * ADR 0139). Each touches the midpoint of every side of the rect, where Edges
 * attach.
 */
export const OUTLINES = ['rectangle', 'pill', 'ellipse', 'diamond'] as const;

/** An outline the canvas strokes a Resource's border and ring on. */
export type Outline = (typeof OUTLINES)[number];

/** The outline of a plugin that declares none. */
export const RECTANGLE: Outline = 'rectangle';

/**
 * What a plugin keeps for its Resource on one Map, beside the canvas's `x`,
 * `y` and `size`. `default` is the value where a Map entry stores none, and
 * `withoutMap` the value on a surface with no Map, falling back to `default`.
 */
export interface MapContentDeclaration<M> {
  readonly schema: z.ZodType<M, z.ZodTypeDef, unknown>;
  readonly default: M;
  readonly withoutMap?: M;
}

/**
 * A Resource plugin's domain half. Methods are declared as methods so a plugin
 * of any content is still a plugin of the list's element type.
 */
export interface ResourcePlugin<C, M> {
  /** The API version this plugin was written for. */
  readonly apiVersion: number;
  /** The Resource kind this plugin draws, a bare id for a bundled plugin (ADR 0128). */
  readonly kind: string;
  /** What one Resource of this kind is called. */
  readonly name: string;
  /** What a list of this kind's Resources is called. */
  readonly listName: string;
  /** What a Reference to one is called, or `null` when one may not be a Target. */
  readonly referenceName: string | null;
  /** The one parser of this kind's `content`, strict. */
  readonly content: z.ZodType<C, z.ZodTypeDef, unknown>;
  /** The content a new Resource of this kind starts with, when it may be created empty. */
  readonly newContent?: C;
  readonly mapContent: MapContentDeclaration<M>;
  /** The outline the canvas strokes, from this Map's content; a rectangle when absent. */
  outline?(mapContent: M): Outline;
  /** Whether another Resource may reference one of this kind as its Target (ADR 0113). */
  readonly mayBeTarget?: boolean;
  /** The Resources this content references, which intake resolves. */
  resourceReferences?(content: C): readonly ResourceId[];
  /** The Resource whose content this one shows, when it shows another's (ADR 0070). */
  contentTarget?(content: C): ResourceId | undefined;
  /** The Spaces this content references. */
  spaceReferences?(content: C): readonly string[];
  /** Whether a Space this kind references lives by that reference (ADR 0074). */
  readonly ownsReferencedSpaces?: boolean;
}

/** A plugin written for the API this build provides. */
export type CurrentPlugin<C, M> = ResourcePlugin<C, M> & {
  readonly apiVersion: typeof API_VERSION;
};

/**
 * Declare a Resource plugin's domain half. The declaration is returned as it
 * is, its `apiVersion` and `kind` kept as literals so the plugin list can read
 * them.
 */
export function definePlugin<const V extends number, const K extends string, C, M>(
  plugin: ResourcePlugin<C, M> & { readonly apiVersion: V; readonly kind: K },
): ResourcePlugin<C, M> & { readonly apiVersion: V; readonly kind: K } {
  return plugin;
}

/** Why a plugin list cannot load. */
export class PluginListError extends Error {
  override readonly name = 'PluginListError';
}

const KIND_ID =
  /^(?:[A-Za-z0-9][A-Za-z0-9-]*|vnd\.[A-Za-z0-9][A-Za-z0-9-]*\.[A-Za-z0-9][A-Za-z0-9-]*)$/u;

/**
 * Why a plugin list cannot load, or `undefined` when it can: each plugin
 * written for this API version, its kind a well-formed id, and no kind listed
 * twice.
 */
export function pluginListProblem(
  plugins: readonly Pick<ResourcePlugin<unknown, unknown>, 'apiVersion' | 'kind'>[],
): string | undefined {
  const seen = new Set<string>();
  for (const plugin of plugins) {
    if (plugin.apiVersion !== API_VERSION) {
      return `The "${plugin.kind}" plugin was written for Resource API version ${plugin.apiVersion}; this build provides version ${API_VERSION}.`;
    }
    if (!KIND_ID.test(plugin.kind)) return `"${plugin.kind}" is not a Resource kind id.`;
    if (seen.has(plugin.kind)) return `The "${plugin.kind}" plugin is listed twice.`;
    seen.add(plugin.kind);
  }
  return undefined;
}

/**
 * The build-time plugin list (ADR 0120): every element must be written for this
 * API version, which the type says, so a plugin declaring another fails the
 * typecheck; and the list is checked again when it loads, so one that slips
 * past the compiler fails the build's first import.
 */
export function pluginList<const L extends readonly CurrentPlugin<unknown, unknown>[]>(
  plugins: L,
): L {
  const problem = pluginListProblem(plugins);
  if (problem !== undefined) throw new PluginListError(problem);
  return plugins;
}
