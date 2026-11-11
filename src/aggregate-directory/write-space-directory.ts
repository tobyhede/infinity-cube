import { stat } from 'node:fs/promises';
import { relative } from 'node:path';
import {
  SPACE_FILE_VERSION,
  canonicalJsonValue,
  canonicalResource,
  isMissingKind,
  type GraphEdge,
  type JsonObject,
  type JsonValue,
  type SpaceFile,
} from '@project/core';
import { Placement, serializeResource } from '@project/graph';
import type { LoadedSpace } from '@project/persistence';
import { compareOrdinal } from '@project/aggregate';
import { discoverResourceFiles, isMissingFile } from './space-directory';
import { writeInPlace } from './write-in-place';

const exists = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isMissingFile(error)) return false;
    throw error;
  }
};

/** Full literals, so the exported key order is fixed and an absent Title writes no key. */
const canonicalEdge = (edge: GraphEdge): GraphEdge => {
  if (edge.title === undefined) return { from: edge.from, to: edge.to };
  return edge.titleHidden === undefined
    ? { from: edge.from, to: edge.to, title: edge.title }
    : { from: edge.from, to: edge.to, title: edge.title, titleHidden: edge.titleHidden };
};

/**
 * A map's graphs, rebuilt key by key and emitted in the order the map
 * holds them.
 *
 * Ordering is the one constraint this does *not* impose, and the asymmetry with the
 * positions beside it comes from how the document is stored. `jsonb` reorders
 * an object's keys on write and preserves an array's order. A map's
 * positions are an object, so the order they were written in is gone by the
 * time they are read back and the sort below is what gives them one again —
 * without it a re-export of untouched content produces a diff. Its graphs are
 * an array, so their order survives storage intact; it is also authored content
 * (ADR 0040) — order is what the graph selector offers and what the
 * absent-`activeGraph` fallback resolves against — so sorting them here would
 * rewrite the space on its way to disk.
 *
 * Every nested value is rebuilt from a literal rather than carried through, for
 * the same reason: what `jsonb` hands back is key-ordered however it likes, and
 * a spread would export that order.
 */
const canonicalGraphs = (
  graphs: NonNullable<SpaceFile['maps']>[number]['graphs'],
): NonNullable<SpaceFile['maps']>[number]['graphs'] =>
  graphs.map(({ id, title, color, headShape, edges }) => {
    // Each optional field is added to the head in exported key order, and
    // `edges` is spread in after the head so it stays last.
    const head: Omit<NonNullable<SpaceFile['maps']>[number]['graphs'][number], 'edges'> = {
      id,
      title,
    };
    if (color !== undefined) head.color = color;
    if (headShape !== undefined) head.headShape = headShape;
    return { ...head, edges: edges.map(canonicalEdge) };
  });

/**
 * A plugin's Map content with every object's keys in ordinal order, at every
 * depth: its keys are the plugin's, so no literal can fix their order, and
 * `jsonb` hands them back in its own. An array keeps its order, which is the
 * value's.
 */
const isJsonObject = (value: JsonValue): value is JsonObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const canonicalJson = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!isJsonObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compareOrdinal(left, right))
      .map(([key, nested]) => [key, canonicalJson(nested)]),
  );
};

const canonicalSpaceFile = ({ snapshot }: LoadedSpace): SpaceFile => {
  const unread = new Set(
    snapshot.resources.filter(({ document }) => isMissingKind(document.kind)).map(({ id }) => id),
  );
  const maps = snapshot.document.maps?.map((m) => {
    const mapBase: Omit<NonNullable<SpaceFile['maps']>[number], 'activeGraph'> = {
      id: m.id,
      title: m.title,
      kind: m.kind,
      // `Placement.fromMap` rebuilds every entry key by key — state and size
      // included — so a stored `{"y":…,"x":…}` exports in the canonical order
      // rather than the one `jsonb` handed back; the sort fixes the entries'
      // order. The Map content of a Resource whose plugin is missing is read by
      // nothing here, so it is written in `canonicalJsonValue`'s one form; a
      // present plugin's is written as its Resource's plugin keeps it.
      positions: Object.fromEntries(
        [...Placement.fromMap(m)]
          .sort(([left], [right]) => compareOrdinal(left, right))
          .map(([id, entry]) => [
            id,
            entry.content === undefined || !unread.has(id)
              ? entry
              : { ...entry, content: canonicalJsonValue(entry.content) },
          ]),
      ),
      graphs: canonicalGraphs(m.graphs),
    };
    return m.activeGraph === undefined ? mapBase : { ...mapBase, activeGraph: m.activeGraph };
  });
  const fileBase: Pick<SpaceFile, 'version' | 'id' | 'title'> = {
    version: SPACE_FILE_VERSION,
    id: snapshot.id,
    title: snapshot.document.title,
  };
  const withMaps = maps === undefined ? fileBase : { ...fileBase, maps };
  return snapshot.document.defaultMap === undefined
    ? withMaps
    : { ...withMaps, defaultMap: snapshot.document.defaultMap };
};

/**
 * One Space's canonical files, by path relative to its Space directory:
 * `space.json` and one `resources/<id>.json` per Resource. No file sits beside
 * a Resource file: its bytes are assets, which `assets/` holds (ADR 0142).
 */
export const spaceDirectoryFiles = (stored: LoadedSpace): ReadonlyMap<string, string> => {
  const files = new Map<string, string>([
    ['space.json', `${JSON.stringify(canonicalSpaceFile(stored), null, 2)}\n`],
  ]);
  for (const resource of [...stored.snapshot.resources].sort((left, right) =>
    compareOrdinal(left.id, right.id),
  )) {
    // Each kind puts its own content as Export writes it, so a file's bytes do
    // not depend on the order a document's keys were inserted in
    // (`test/unit/space-directory-files.test.ts`).
    for (const file of serializeResource({
      ...canonicalResource(resource.document),
      id: resource.id,
    })) {
      files.set(file.path, file.text);
    }
  }
  return files;
};

/**
 * The files Import reads in a Space directory, by path relative to it, or none
 * when the directory does not exist.
 */
export const scannedSpaceFiles = async (directory: string): Promise<readonly string[]> => {
  if (!(await exists(directory))) return [];
  const resources = await discoverResourceFiles(directory);
  return ['space.json', ...resources.map((path) => relative(directory, path))];
};

/**
 * Write one Space's canonical files into a directory, in place, replacing
 * whatever the reader would have discovered there and leaving everything else
 * alone.
 *
 * What it removes is exactly what `readSingleSpace` scans — `resources/*.json`
 * and `space.json` — so a Resource deleted since the last export leaves no
 * Resource file behind to be read back, and every other Resource's file stays.
 * Anything the reader would not have looked at survives, a `README.md` or any
 * other `*.md` included (ADR 0119, ADR 0142), which is what lets a Space
 * directory carry notes across a round trip.
 */
export const writeSpaceDirectory = async (
  stored: LoadedSpace,
  directory: string,
): Promise<void> => {
  const files = new Map(
    [...spaceDirectoryFiles(stored)].map(([path, text]) => [path, Buffer.from(text)] as const),
  );
  await writeInPlace(directory, files, await scannedSpaceFiles(directory));
};
