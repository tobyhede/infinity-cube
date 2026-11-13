import type { NodeChange } from '@xyflow/react';
import {
  authorsContent,
  embedsMap,
  uuidSchema,
  type JsonValue,
  type ResourceContent,
  type UUID,
} from '@project/core';
import { bareKindData, type ResourceFlowNode } from '@project/react-flow-adapter';
import type { RenderAdapter } from '../src/render-adapter';
import { textAsset } from './markdown-texts';
import { type PluginKind } from '@project/plugins/testing';

export function node(id: string, x: number, y: number, title = id): ResourceFlowNode {
  return {
    id,
    type: 'resource',
    position: { x, y },
    className: 'rf-resource-node',
    data: {
      shape: 'rectangle',
      resourceId: uuidSchema.parse(id),
      title,
      readOnly: false,
      ...bareKindData('markdown'),
      ...fixtureFacts('markdown'),
      selectedForAuthoring: false,
      activeGraphId: null,
      activeGraphColor: '#8a94a6',
      borderColor: null,
      receding: false,
    },
  };
}

const FIXTURE_TARGET = uuidSchema.parse('00000000-0000-4000-8000-0000000000f9');
const FIXTURE_TARGET_SPACE = uuidSchema.parse('00000000-0000-4000-8000-0000000000fa');
const FIXTURE_TARGET_MAP = uuidSchema.parse('00000000-0000-4000-8000-0000000000fb');
const FIXTURE_TARGET_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-0000000000fc');

/** Where a fixture Space Resource's view goes. */
interface FixtureView {
  readonly spaceId: UUID;
  readonly map: UUID;
}

const FIXTURE_VIEW: FixtureView = { spaceId: FIXTURE_TARGET_SPACE, map: FIXTURE_TARGET_MAP };

function fixtureContent(kind: PluginKind, source: string, space: FixtureView): ResourceContent {
  switch (kind) {
    case 'markdown':
      return { kind: 'markdown', content: { url: textAsset(source) }, via: 'self' };
    case 'reference':
      return { kind: 'markdown', content: { url: textAsset(source) }, via: 'target' };
    case 'space':
      return {
        kind: 'space',
        content: { ...space, graph: FIXTURE_TARGET_GRAPH },
        via: 'self',
      };
    case 'image':
      return {
        kind: 'image',
        content: { url: 'https://example.com/picture.png' },
        via: 'self',
      };
    case 'ur':
      return { kind: 'ur', content: {}, via: 'self' };
  }
}

/** What a fixture Resource of `kind` stores; a Reference Resource names a Target. */
function fixtureOwnContent(
  kind: PluginKind,
  source: string,
  space: FixtureView,
): ResourceFlowNode['data']['ownContent'] {
  switch (kind) {
    case 'markdown':
      return { url: textAsset(source) };
    case 'reference':
      return { target: FIXTURE_TARGET };
    case 'space':
      return { ...space, graph: FIXTURE_TARGET_GRAPH };
    case 'image':
      return { url: 'https://example.com/picture.png' };
    case 'ur':
      return {};
  }
}

/**
 * The Map content a fixture Resource of `kind` carries, as its plugin reads it
 * (ADR 0142): Open for the kinds whose plugin keeps it, the Shape for an Ur
 * Resource and nothing for an Image Resource.
 */
export function fixtureMapContent(open: boolean, kind: PluginKind): JsonValue {
  switch (kind) {
    case 'image':
      return {};
    case 'ur':
      return { shape: 'rectangle' };
    case 'markdown':
    case 'reference':
    case 'space':
      return { open };
  }
}

/**
 * The projection's answers for a fixture Resource of `kind`: its content facts,
 * its stored content and its Map content. `source` is a Markdown Resource's
 * text and `space` the view a Space Resource goes to.
 */
export function fixtureFacts(
  kind: PluginKind,
  open = false,
  source = '',
  space: FixtureView = FIXTURE_VIEW,
): Pick<ResourceFlowNode['data'], 'authorsContent' | 'embedsMap' | 'ownContent' | 'mapContent'> {
  const content = fixtureContent(kind, source, space);
  return {
    authorsContent: authorsContent(content),
    embedsMap: embedsMap(content),
    ownContent: fixtureOwnContent(kind, source, space),
    mapContent: fixtureMapContent(open, kind),
  };
}

export function moving(id: string, x: number, y: number): NodeChange<ResourceFlowNode>[] {
  return [{ type: 'position', id, position: { x, y }, dragging: true }];
}

export function settled(id: string, x: number, y: number): NodeChange<ResourceFlowNode>[] {
  return [{ type: 'position', id, position: { x, y }, dragging: false }];
}

export function completeDrag(store: RenderAdapter, id: string, x: number, y: number): void {
  store.getState().changeNodes(moving(id, x, y));
  store.getState().changeNodes(settled(id, x, y));
}
