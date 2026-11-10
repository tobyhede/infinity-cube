/**
 * THROWAWAY (issue 01): the Resource plugin interface exactly as
 * `.scratch/resource-plugins/spec.md` writes it, so the proof runs against the
 * spec's words rather than a version improved in passing. Deleted when the
 * Answer is written.
 */
import type { ComponentType } from 'react';
import type { SpaceView } from '@project/core';

export type ResourceId = string;
export interface Resource<C = unknown> {
  id: ResourceId;
  title: string;
  kind: string;
  content: C;
}
export type AssetRef = `/assets/${string}`;
export const isAssetRef = (value: string): value is AssetRef =>
  /^\/assets\/[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u.test(value);

export interface Size {
  width: number;
  height: number;
}

export type Answer = 'completed' | 'unchanged' | { refused: string };
export interface Kept<T> {
  value: T;
  commit?: (next: T) => Promise<Answer>;
}

export type MapCommit<M> = (next: M, options?: { sizeHint?: Size }) => Promise<Answer>;

export interface Assets {
  url(ref: string): string;
  read(ref: string): Promise<Blob | { refused: string }>;
  pick?(accept: string): Promise<File[]>;
  store?(bytes: Blob): Promise<AssetRef | { refused: string }>;
}

export type EmbedProps =
  | { resource: ResourceId; title: Kept<string> }
  | { map: SpaceView; claim?: Claim };

export interface Surface<C, M> {
  resource: Resource<C>;
  title: Kept<string>;
  content: Kept<C>;
  map: Kept<M> & { commit?: MapCommit<M> };
  size: Size;
  selected: boolean;
  claim?(): OwnClaim<C, M> | undefined;
  assets: Assets;
  Embed: ComponentType<EmbedProps>;
}

export interface Claim {
  release(): boolean;
}
export interface OwnClaim<C, M> extends Claim {
  exclusively<T>(work: (own: Exclusive<C, M>) => Promise<T>): Promise<T | 'busy'>;
}
export interface Exclusive<C, M> {
  title?: Kept<string>['commit'];
  content?: Kept<C>['commit'];
  map?: MapCommit<M>;
  store?: Assets['store'];
}

export interface NewSpace {
  spaceId: string;
  map: string;
  graph: string;
}
export interface New<C> {
  title?: string;
  content: C | ((s: NewSpace) => C);
  newSpace?: true;
}
export interface Creation<C> {
  from: 'dock' | 'data' | 'resource' | 'space';
  accepts?(input: unknown): boolean;
  run(
    host: { create(items: New<C>[]): Promise<Answer>; assets: Assets },
    input: unknown,
  ): void | Promise<void>;
}

export interface PluginView<C, M> {
  kind: string;
  mapContent: { default: M; withoutMap?: M };
  View: ComponentType<{ surface: Surface<C, M> }>;
  creates?: Creation<C>;
}

/** jsdom's Blob has neither `text` nor `arrayBuffer`; FileReader has both. Harness only. */
export const blobBytes = (blob: Blob): Promise<ArrayBuffer> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
export const blobText = async (blob: Blob): Promise<string> =>
  new TextDecoder().decode(await blobBytes(blob));
