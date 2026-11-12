import { useState } from 'react';
import {
  imageKind,
  KIND_IDS,
  markdownKind,
  referenceKind,
  spaceKind,
  urKind,
  type KindId,
} from '@project/core';
import type { ResourceFlowNode } from '@project/react-flow-adapter';
import {
  kindDecorationMemo,
  kindDecorator,
  type AgreeingAllOf,
  type KindDecorator,
} from '../canvas-resource-decoration';
import { imageDecoration } from './image';
import { markdownDecoration } from './markdown';
import { spaceDecoration } from './space';
import { referenceDecoration } from './reference';
import { urDecoration } from './ur';

/**
 * How each kind decorates its Resources on the canvas.
 */
const DECORATIONS = {
  [markdownKind.id]: kindDecorator(markdownDecoration),
  [imageKind.id]: kindDecorator(imageDecoration),
  [urKind.id]: kindDecorator(urDecoration),
  [spaceKind.id]: kindDecorator(spaceDecoration),
  [referenceKind.id]: kindDecorator(referenceDecoration),
} satisfies Readonly<Record<KindId, KindDecorator<never>>>;

/** The context one kind's decoration reads. */
type ContextOf<Decorator> = Decorator extends KindDecorator<infer Context> ? Context : never;

/**
 * What every kind's canvas decoration reads, together. Two kinds that read a
 * field of one name with different types fail to compile where it is supplied.
 */
export type KindDecorationContext = AgreeingAllOf<ContextOf<(typeof DECORATIONS)[KindId]>>;

/** Every kind's decoration, in registry order. */
const KIND_DECORATORS: readonly KindDecorator<KindDecorationContext>[] = KIND_IDS.map(
  (kind): KindDecorator<KindDecorationContext> => DECORATIONS[kind],
);

/**
 * Every Resource node with its kind's operations: the app half of each kind,
 * and the one place in the application each kind's canvas decoration is named
 * (ADR 0128). Each kind's nodes are decorated from that kind's own part of the
 * context, so a change that only one kind reads keeps every other kind's
 * nodes, and their identities, as they were.
 */
export function useKindDecoratedNodes(
  nodes: readonly ResourceFlowNode[],
  context: KindDecorationContext,
): ResourceFlowNode[] {
  const [decorate] = useState(() => kindDecorationMemo(KIND_DECORATORS));
  return decorate(nodes, context);
}
