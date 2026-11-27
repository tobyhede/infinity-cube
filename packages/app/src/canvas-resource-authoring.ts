import type { Continuation } from './continuation';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  RESOURCE_TITLE_REQUIRED,
  resourceDocumentSchema,
  uuidSchema,
  type ResourceId,
} from '@project/core';
import type { Size } from '@project/resource-api/domain';
import type { ObserverErrorReporter, SpaceSession } from '@project/persistence';
import type { ResourceFlowNode } from '@project/react-flow-adapter';
import { usePluginAssets, type EntityActionGroup } from '@project/ui';
import type { AuthoringAvailability } from './authoring-availability';
import { describeAuthoringRefusal } from './authoring-refusal';
import type { ResourceResize } from './render-adapter';
import type { SurfaceAuthoring } from './space-authoring';
import { useOpenSpaces } from './open-spaces-context';
import type { CommandOutcomes } from './command-outcomes';
import type { DeleteConfirmation } from './delete-confirmation';
import { NO_SPACE_RESOURCE_TARGETS, type SpaceResourceTargets } from './space-resource-targets';
import {
  applyResourceDataPatch,
  decoratePluginSurface,
  decorateSharedResourceNode,
  type PluginSurfaceDecorationContext,
} from './canvas-resource-decoration';
import { decorateEmbedCommands, type EmbedCommandsContext } from './embed-commands';
import type { Embedding } from './plugin-host/claim-chain';
import type { PluginHost } from './plugin-host/plugin-commits';
import { editorsOn, type PluginGate } from './plugin-host/plugin-gate';
import { usePluginGate } from './plugin-host/plugin-gate-context';
import type { MapEmbedEntry } from './map-embedding/map-embeddings';
import type { MapEmbedding } from './map-embedding/map-embedding';
import { useMapEmbedding } from './map-embedding/map-embedding-view';

const NO_SUBSCRIPTION = () => () => undefined;
const NONE_EMBEDDED: ReadonlyMap<string, MapEmbedEntry> = new Map();
const NO_MAP_EMBEDS = () => NONE_EMBEDDED;
/** Off a canvas: nothing is said about an embedding, and no rail is editing. */
const NO_NOTICES: ReadonlyMap<string, string> = new Map();
const NO_RAIL_EDITING: ReadonlySet<string> = new Set();

type Caret = { readonly resourceId: string; readonly field: 'title' } | null;

/** What this canvas's plugin surfaces claim on, and where what they throw is reported. */
export interface CanvasPlugins {
  /** The composition's gate, which its Authoring asks at `complete` (ADR 0142). */
  readonly gate: PluginGate;
  readonly report: ObserverErrorReporter;
  /**
   * The drawings whose Map embedding this canvas is drawn inside, outermost
   * first, so a Claim here nests under one they hold. Absent on a canvas drawn
   * in no embedding.
   */
  readonly embeddedIn?: Embedding | undefined;
}

const reportPluginFailureToConsole: ObserverErrorReporter = (error) =>
  console.error('A Resource plugin failed', error);

export interface CanvasResourceAuthoringInput {
  readonly continuation: Continuation;
  /**
   * The composition's gate and reporter. Absent, the page's gate (or one of
   * this canvas's own, as in a story) and the console.
   */
  readonly plugins?: CanvasPlugins | undefined;
  /** This canvas Space's outcomes; target rails resolve their target's composition. */
  readonly commandOutcomes?: CommandOutcomes | undefined;
  /** This canvas Space's confirmation; target rails use the target's confirmation. */
  readonly deleteConfirmation?: DeleteConfirmation;
  readonly nodes: readonly ResourceFlowNode[];
  /**
   * What may be authored right now, answered once for the whole application:
   * every control drawn on a Resource is `authorOnCanvas`.
   */
  readonly availability: AuthoringAvailability;
  readonly nameOnCreation: string | null;
  readonly authoring: Pick<SurfaceAuthoring, 'complete' | 'getState'>;
  readonly spaceSession: SpaceSession;
  readonly resourceResize: ResourceResize;
  readonly onSelectResource: (resourceId: ResourceId) => void;
  readonly onBodyEditingChange?: ((editing: boolean) => void) | undefined;
  readonly onTitleEditingChange?: ((editing: boolean) => void) | undefined;
  /**
   * What each referenced Space offers a Space Resource to select, keyed by target.
   *
   * Absent, or missing an entry, means the target has not been read yet — the
   * Resource still draws, without the rail an Open one carries (ADR 0068).
   */
  readonly spaceResourceTargets?: SpaceResourceTargets | undefined;
  /**
   * What commands each Resource on this canvas offers, asked one Resource at a time.
   *
   * A function rather than a built list, for the reason the Space's command
   * surface takes one: what a command *is* — the address it copies, the Edit it
   * runs — belongs to the composition that owns both, while this module knows
   * only which Resources are on the canvas and which of them may be authored.
   *
   * Absent leaves every Resource exactly as it was, which is what a read-only or
   * embedded canvas wants: a Resource drawn where none of these commands can run
   * offers no menu rather than one that refuses.
   */
  readonly resourceEntityActions?:
    ((resourceId: ResourceId) => readonly EntityActionGroup[]) | undefined;
  /**
   * The Map embedding of the canvas this composition draws on; absent, the
   * one the canvas around it provides.
   */
  readonly mapEmbedding?: MapEmbedding | undefined;
  /**
   * The most an editor on this canvas is drawn at: the visible canvas at the
   * current zoom, less a margin (ADR 0178). Only the canvas's own Map offers
   * it; absent, an editor is drawn uncapped.
   */
  readonly editorCap?: Size | undefined;
}

export interface CanvasResourceAuthoring {
  readonly nodes: ResourceFlowNode[];
  readonly bodyEditing: boolean;
  readonly titleEditing: boolean;
  readonly beginTitleEditing: (resourceId: string) => void;
}

/**
 * The complete canvas-local Resource interaction: caret ownership, Open/Edit
 * composition, completion translation and the operations projected onto each
 * Resource. Space Authoring remains authoritative for every completed Edit.
 */
export function useCanvasResourceAuthoring({
  continuation,
  commandOutcomes,
  deleteConfirmation,
  nodes,
  availability,
  nameOnCreation,
  authoring,
  spaceSession,
  resourceResize,
  onSelectResource,
  onBodyEditingChange,
  onTitleEditingChange,
  spaceResourceTargets = NO_SPACE_RESOURCE_TARGETS,
  resourceEntityActions,
  plugins,
  editorCap,
  mapEmbedding: ownMapEmbedding,
}: CanvasResourceAuthoringInput): CanvasResourceAuthoring {
  const spaces = useOpenSpaces();
  const [caret, setCaret] = useState<Caret>(null);
  const editingTitleResourceId = caret?.field === 'title' ? caret.resourceId : null;
  /**
   * Where a plugin surface's commits go (ADR 0142): this canvas's Edits, each
   * answering how it settled, withdrawn by the application's one gate and by
   * the Space being replaced. A Claim held on the gate is a plugin's running
   * work, as a Markdown Resource's edit is: it holds the keyboard and withdraws
   * what a body edit does, while the canvas keeps no editing state of its own
   * for it.
   */
  const pageGate = usePluginGate();
  const pluginGate = plugins?.gate ?? pageGate;
  const reportPluginFailure = plugins?.report ?? reportPluginFailureToConsole;
  // Read so every plugin surface is decorated again when a Claim is taken or
  // exclusive work begins or ends, and offers only what is not withdrawn.
  const claimChain = useSyncExternalStore(pluginGate.subscribe, pluginGate.getState);
  // The application's asset store, which a surface stores and picks through
  // only where it offers commits, and only while they are not withdrawn.
  const pluginAssets = usePluginAssets();
  // A Claim passed to a Map embedding authors that Map, not the plugin's own
  // rect, so it withdraws nothing a plugin's edit does.
  const lent = useSyncExternalStore(pluginGate.subscribe, pluginGate.lent);
  const bodyEditing = claimChain.holders.some((held) => {
    const drawing = held.at(-1);
    return drawing !== undefined && !lent.has(drawing.key);
  });
  // A plugin that took its Claim to edit in place is drawn at its Edit size,
  // and resized as an editor, until the Claim ends (ADR 0178). The render
  // adapter is told in a layout effect. The canvas then lays the new placement
  // out through `usePlacementRendering`, an effect and a microtask later, so a
  // frame may still show the Resource at its size before it is drawn at its
  // Edit size.
  const editingDrawings = useSyncExternalStore(pluginGate.subscribe, pluginGate.editors);
  const embeddedIn = plugins?.embeddedIn;
  const editors = useMemo(() => {
    const editing = editorsOn(claimChain, editingDrawings, embeddedIn ?? []);
    return new Map(
      nodes.flatMap((node) => {
        const edit = editing.get(node.data.resourceId);
        return edit === undefined ? [] : [[node.data.resourceId, edit] as const];
      }),
    );
  }, [claimChain, editingDrawings, embeddedIn, nodes]);
  const drawEditors = resourceResize.drawEditors;
  useLayoutEffect(() => {
    drawEditors(editors, editorCap);
  }, [drawEditors, editors, editorCap]);
  useLayoutEffect(() => () => drawEditors(new Map()), [drawEditors]);
  // The Map embedding of the canvas this draws on, which a Space Resource's
  // host chooser writes a choice through (ADR 0142), and which keeps what the
  // canvas says about each embedding, and its rail editing, while it stands.
  const providedMapEmbedding = useMapEmbedding();
  const mapEmbedding = ownMapEmbedding ?? providedMapEmbedding;
  const mapEmbeds = useSyncExternalStore(
    mapEmbedding?.embeddings.subscribe ?? NO_SUBSCRIPTION,
    mapEmbedding?.embeddings.getState ?? NO_MAP_EMBEDS,
  );
  // Each read on its own, so a framing draft published on every pan move does
  // not draw this composition again.
  const contextNotices = useSyncExternalStore(
    mapEmbedding?.subscribe ?? NO_SUBSCRIPTION,
    () => mapEmbedding?.getState().notices ?? NO_NOTICES,
  );
  const railEditing = useSyncExternalStore(
    mapEmbedding?.subscribe ?? NO_SUBSCRIPTION,
    () => mapEmbedding?.getState().railEditing ?? NO_RAIL_EDITING,
  );
  const contextEditing = nodes.some((node) => railEditing.has(node.id));

  useEffect(() => {
    onBodyEditingChange?.(bodyEditing);
  }, [bodyEditing, onBodyEditingChange]);
  useEffect(() => {
    onTitleEditingChange?.(editingTitleResourceId !== null || contextEditing);
    // Returning the Space chrome on unmount is the whole of the safety net,
    // and it is narrower than "a Map change remounts the canvas" would
    // suggest. Only a Map move that drops the projection unmounts this
    // canvas; a move made *through* a completed Edit installs the next
    // projection instead, so the canvas stays mounted and the caret with it —
    // even where the Resource it names has left `nodes`, since the caret is keyed
    // by Resource id and nothing here watches them. So a surface that moves the
    // Map that way withdraws itself while the caret is held rather than
    // relying on this, and what remains here is the unmount case: a canvas that
    // goes away must not leave the chrome withdrawn against an editor no
    // callback will ever settle.
    return () => onTitleEditingChange?.(false);
  }, [editingTitleResourceId, contextEditing, onTitleEditingChange]);

  const [canvasAuthoringWasEnabled, setCanvasAuthoringWasEnabled] = useState(
    availability.authorOnCanvas,
  );
  if (canvasAuthoringWasEnabled !== availability.authorOnCanvas) {
    setCanvasAuthoringWasEnabled(availability.authorOnCanvas);
    if (!availability.authorOnCanvas && caret?.field === 'title') setCaret(null);
  }

  const [lastCreatedResourceId, setLastCreatedResourceId] = useState(nameOnCreation);
  if (lastCreatedResourceId !== nameOnCreation) {
    setLastCreatedResourceId(nameOnCreation);
    if (nameOnCreation !== null && !bodyEditing) {
      setCaret({ resourceId: nameOnCreation, field: 'title' });
    }
  }

  const pluginHost = useMemo(
    (): PluginHost => ({
      gate: pluginGate,
      claims: claimChain,
      replacementEpoch: () => authoring.getState().replacementEpoch,
      complete: (completion, settle) => authoring.complete(completion, settle),
      report: reportPluginFailure,
      document: (resourceId) =>
        spaceSession.getState().working.resources.find(({ id }) => id === resourceId)?.document,
      assets: { store: pluginAssets.store, pick: pluginAssets.pick },
      embeddedIn: plugins?.embeddedIn,
    }),
    [
      authoring,
      pluginGate,
      reportPluginFailure,
      claimChain,
      spaceSession,
      pluginAssets,
      plugins?.embeddedIn,
    ],
  );

  const completeResourceTitle = useCallback(
    (resourceIdInput: string, title: string): string | null => {
      const resourceId = uuidSchema.safeParse(resourceIdInput);
      if (!resourceId.success) return 'This Resource is no longer available.';
      const stored = spaceSession
        .getState()
        .working.resources.find((resource) => resource.id === resourceId.data);
      if (stored === undefined) return 'This Resource is no longer available.';
      // The draft goes to the schema as it was typed: normalization is that
      // boundary's (ADR 0083), and a `trim()` here would be the rule written a
      // second time and disagreeing about the line breaks the author meant.
      // Which refusal this is comes off the issue the schema raised rather than
      // being re-derived from the draft — the domain owns the code and this
      // composes its sentence (ADR 0057), and re-deciding it here would be the
      // same rule kept in two places, free to drift apart.
      const parsed = resourceDocumentSchema.safeParse({ ...stored.document, title });
      if (!parsed.success) {
        const titleRequired = parsed.error.issues.some(
          (issue) => issue.code === 'custom' && issue.params?.['code'] === RESOURCE_TITLE_REQUIRED,
        );
        return titleRequired
          ? describeAuthoringRefusal({ code: RESOURCE_TITLE_REQUIRED })
          : (parsed.error.issues[0]?.message ?? 'The Resource title is invalid.');
      }
      const result = authoring.complete({
        kind: 'edited-resource',
        resourceId: resourceId.data,
        document: parsed.data,
      });
      return result.kind === 'refused' ? describeAuthoringRefusal(result.refusal) : null;
    },
    [authoring, spaceSession],
  );

  const beginTitleEditing = useCallback((resourceId: string) => {
    setCaret({ resourceId, field: 'title' });
  }, []);
  const getWorking = useCallback(() => spaceSession.getState().working, [spaceSession]);
  const working = useSyncExternalStore(spaceSession.subscribe, getWorking);
  const editableResourceIdsKey = working.resources.map((resource) => resource.id).join();
  /* eslint-disable react-hooks/exhaustive-deps -- membership key, not snapshot identity */
  const editableResourceIds = useMemo(
    () => new Set(working.resources.map((resource) => resource.id)),
    [editableResourceIdsKey],
  );
  /* eslint-enable react-hooks/exhaustive-deps */
  const clearCaret = useCallback(() => {
    setCaret(null);
  }, []);
  const onContextEditingChange = useCallback(
    (nodeId: string, editing: boolean) => {
      mapEmbedding?.setRailEditing(nodeId, editing);
    },
    [mapEmbedding],
  );
  const onContextReport = useCallback(
    (nodeId: string, message: string | null, lifetime: symbol) => {
      mapEmbedding?.setNotice(nodeId, message, lifetime);
    },
    [mapEmbedding],
  );

  const sharedContext = useMemo(
    () => ({
      authorOnCanvas: availability.authorOnCanvas,
      bodyEditing,
      editableResourceIds,
      beginTitleEditing,
      onSelectResource,
      resourceResize,
      editingTitleResourceId,
      completeResourceTitle,
      clearCaret,
      resourceEntityActions,
    }),
    [
      availability.authorOnCanvas,
      bodyEditing,
      editableResourceIds,
      beginTitleEditing,
      onSelectResource,
      resourceResize,
      editingTitleResourceId,
      completeResourceTitle,
      clearCaret,
      resourceEntityActions,
    ],
  );
  const withShared = useMemo(
    () =>
      nodes.map((node) =>
        applyResourceDataPatch(node, decorateSharedResourceNode(node, sharedContext)),
      ),
    [nodes, sharedContext],
  );
  const surfaceContext = useMemo(
    (): PluginSurfaceDecorationContext => ({
      authorOnCanvas: availability.authorOnCanvas,
      embeddedMapEdit: availability.embeddedMapEdit,
      editableResourceIds,
      pluginHost,
    }),
    [availability.authorOnCanvas, availability.embeddedMapEdit, editableResourceIds, pluginHost],
  );
  const kindDecorated = useMemo(
    () => withShared.map((node) => decoratePluginSurface(node, surfaceContext)),
    [withShared, surfaceContext],
  );
  // The commands of each Space a Resource embeds, read from what its plugin
  // passed `Embed`, whatever the kind (ADR 0142).
  const embedContext = useMemo(
    (): EmbedCommandsContext => ({
      authorOnCanvas: availability.authorOnCanvas,
      editableResourceIds,
      continuation,
      containingSpaceId: working.id,
      spaceResourceTargets,
      spaces,
      commandOutcomes,
      deleteConfirmation,
      mapEmbeds,
      contextNotices,
      onContextEditingChange,
      onContextReport,
    }),
    [
      availability.authorOnCanvas,
      editableResourceIds,
      continuation,
      working.id,
      spaceResourceTargets,
      spaces,
      commandOutcomes,
      deleteConfirmation,
      mapEmbeds,
      contextNotices,
      onContextEditingChange,
      onContextReport,
    ],
  );
  const decoratedNodes = useMemo(
    () => kindDecorated.map((node) => decorateEmbedCommands(node, embedContext)),
    [kindDecorated, embedContext],
  );

  return {
    nodes: decoratedNodes,
    bodyEditing,
    titleEditing: editingTitleResourceId !== null || contextEditing,
    beginTitleEditing,
  };
}
