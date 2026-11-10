import { useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Story } from '@ladle/react';
import { EMPTY_ASSET_REF, uuidSchema, type Resource, type UUID } from '@project/core';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import { ResourcesPopover, SPACE_DRAG_TYPE } from '#components/ResourcesPopover';
import { PersistenceNotice } from '#components/PersistenceControl';
import { describeAuthoringRefusal } from '#src/authoring-refusal';
import { composeApp } from '#src/compose-app';
import { resolveMap, resourcesOutsideMap } from '#src/map-resolution';
import { otherMapMemberships, type MapMemberships } from '#src/map-memberships';
import type { SpaceDrag } from '#src/resources-drag';
import { sparseAuthoredSnapshot, widelyPlacedSpace } from '../support/spaces';
import { CANVAS } from '#src/space-authoring';

export default { title: 'Surfaces/Resources Popover' };

const id = (suffix: string) => uuidSchema.parse(`00000000-0000-4000-8000-${suffix}`);

const RESOURCES: readonly Resource[] = [
  {
    id: id('000000000001'),
    title: 'API boundaries',
    kind: 'markdown',
    content: { url: EMPTY_ASSET_REF },
  },
  {
    id: id('000000000002'),
    title: 'Architecture',
    kind: 'markdown',
    content: { url: EMPTY_ASSET_REF },
  },
  {
    id: id('000000000003'),
    title: 'Design constraints',
    kind: 'markdown',
    content: { url: EMPTY_ASSET_REF },
  },
  {
    id: id('000000000004'),
    title: 'Constraints',
    kind: 'reference',
    content: { target: id('000000000003') },
  },
  {
    id: id('000000000005'),
    title: 'Demo flow',
    kind: 'space',
    content: { spaceId: id('000000000010'), map: id('000000000011'), graph: id('000000000012') },
  },
];

const LONG_RESOURCES: readonly Resource[] = Array.from({ length: 18 }, (_, index) => ({
  id: id(String(index + 100).padStart(12, '0')),
  title: `Reference ${String(index + 1).padStart(2, '0')}`,
  kind: 'markdown' as const,
  content: { url: EMPTY_ASSET_REF },
}));

/** Spaces of the Meta Space, which are not Resources and are in no Map. */
const SPACES = [
  { id: id('000000000020'), title: 'Blueprint' },
  { id: id('000000000021'), title: 'Yardstick' },
];

function ResourcesPopoverFixture({
  resources = RESOURCES,
  allResources = resources,
  disabled = false,
  notice,
  spaces,
  memberships,
  spaceTitleById,
  spaceSelectionNameById,
}: {
  readonly resources?: readonly Resource[];
  readonly allResources?: readonly Resource[];
  readonly disabled?: boolean;
  readonly notice?: ReactNode;
  readonly spaces?: readonly { readonly id: UUID; readonly title: string }[];
  readonly memberships?: MapMemberships;
  readonly spaceTitleById?: ReadonlyMap<UUID, string>;
  readonly spaceSelectionNameById?: ReadonlyMap<Resource['id'], string>;
}) {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<readonly string[]>([]);
  // What Delete from Space was asked for. The application arms a confirmation
  // the list does not own, so the fixture records the request the row made.
  const [deleted, setDeleted] = useState<readonly string[]>([]);
  // A completed Add takes the Resource out of the list, which is what the
  // application does: the Resource has joined the Map, so it is no longer
  // outside it. Without that the activated row never unmounts, and every
  // claim this catalogue makes about what follows an Add — the row going,
  // the caret coming back to the filter — would hold over a row still on
  // screen and still able to keep focus itself.
  const [placed, setPlaced] = useState<readonly string[]>([]);
  const outside = resources.filter((resource) => !placed.includes(resource.id));
  // The Space drag the list started, held the way the application holds it:
  // the row and the settlement bound to the opening it left, spent on the drop.
  const spaceDrag = useRef<Omit<SpaceDrag, 'mapId'> | null>(null);
  const placeSpace = (space: { readonly id: UUID; readonly title: string }) => {
    setAdded((titles) => [...titles, space.title]);
    return Promise.resolve(null);
  };
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-center gap-2 border-b p-2">
        <span className="text-sm font-medium">Map 1</span>
        <ResourcesPopover
          resources={outside}
          allResources={allResources}
          open={open}
          onOpenChange={setOpen}
          disabled={disabled}
          onAdd={(resource) => {
            setAdded((titles) => [...titles, resource.title]);
            setPlaced((ids) => [...ids, resource.id]);
            return null;
          }}
          onDelete={(resource) => setDeleted((titles) => [...titles, resource.title])}
          onDragStart={() => undefined}
          spaces={spaces}
          onAddSpace={placeSpace}
          onSpaceDragStart={(space, settle) => {
            spaceDrag.current = { kind: 'space', space, settle };
          }}
          onDragEnd={() => {
            spaceDrag.current = null;
          }}
          memberships={memberships}
          spaceTitleById={spaceTitleById}
          spaceSelectionNameById={spaceSelectionNameById}
        />
      </header>
      {notice}
      <button
        type="button"
        className="flex-1 text-sm text-muted-foreground"
        onClick={() => setAdded((titles) => [...titles, 'canvas'])}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes(SPACE_DRAG_TYPE)) event.preventDefault();
        }}
        onDrop={(event) => {
          const drag = spaceDrag.current;
          spaceDrag.current = null;
          if (drag?.space.id !== event.dataTransfer.getData(SPACE_DRAG_TYPE)) return;
          event.preventDefault();
          drag.settle(placeSpace(drag.space));
        }}
      >
        The canvas behind it
      </button>
      <p className="shrink-0 border-t p-2 text-sm">Added: {added.join(', ')}</p>
      <p className="shrink-0 p-2 text-sm">Delete requested: {deleted.join(', ')}</p>
    </div>
  );
}

/** The production Authoring composition behind the browser-reachable repeated-activation refusal. */
function RefusedAdd() {
  const session = useMemo(() => {
    const stored = { snapshot: sparseAuthoredSnapshot, revision: 0n, exportedRevision: null };
    return openSpaceSession(MemorySpaceBackend.asMeta(stored), stored);
  }, []);
  const composed = useMemo(() => composeApp({ spaceSession: session }), [session]);
  useSyncExternalStore(session.subscribe, session.getState);
  const space = composed.currentSpace();
  const selectedMap = space.lookup.map(composed.navigation.getState().selectedMapId)?.map;
  const resources = selectedMap === undefined ? [] : resourcesOutsideMap(space, selectedMap);
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-screen items-start bg-background p-2 text-foreground">
      <ResourcesPopover
        resources={resources}
        allResources={space.resources}
        open={open}
        onOpenChange={setOpen}
        onAdd={(resource) => {
          const result = composed.authoring.complete(CANVAS, {
            kind: 'added-resource-to-map',
            resourceId: resource.id,
            anchor: { x: 0, y: 0 },
          });
          return result.kind === 'refused' ? describeAuthoringRefusal(result.refusal) : null;
        }}
        onDelete={composed.resourceDeletion.askToDelete}
        onDragStart={() => undefined}
      />
    </div>
  );
}

/**
 * The production Resources View with every Resource kind available.
 *
 * Mounted closed, behind its own trigger and over a stand-in for the canvas it
 * feeds — the smallest boundary that owns the list's opening, its dismissal and
 * the fact that the surface behind it stays live. That last one is the claim:
 * the list is anchored to its trigger and does not close on an outside press,
 * so dropping a Resource onto the canvas neither dismisses it nor is dismissed
 * by it.
 */
export const AvailableResources: Story = () => {
  return <ResourcesPopoverFixture />;
};
AvailableResources.meta = { iframed: true };

/**
 * The list's second source beside its first.
 *
 * A Space Resource is one authored view placed in a Map; a Space is the volume
 * such a view is a view of, offered whether or not this Space has ever pointed
 * at it (ADR 0074). The rows interleave by name because the reader is looking
 * for a name, and each carries the glyph that says which it is — the same pair
 * the filter draws.
 *
 * A Space row drags as a Resource row does: the stand-in canvas behind the
 * list takes the drop and settles its answer through the list that started it.
 */
export const MetaSpaces: Story = () => <ResourcesPopoverFixture spaces={SPACES} />;
MetaSpaces.meta = { iframed: true };

/**
 * Each Resource this Map leaves out, marked with the other Maps it is in.
 *
 * The Space opens on `Collection 2`; the three Resources it does not place all
 * sit in `Collection 1`: Resource 3 on three of its Graphs, Resource 5 on one,
 * and Resource 4 on ten (`widelyPlacedSnapshot`), past the capsule's dot cap and
 * wider than one line of the tooltip. Memberships come
 * from the production derivation over the loaded Space, so each capsule holds
 * the colours the canvas draws those Graphs in.
 */
export const PlacedElsewhere: Story = () => {
  const { map: opening } = resolveMap(widelyPlacedSpace);
  const outside = resourcesOutsideMap(widelyPlacedSpace, opening);
  return (
    <ResourcesPopoverFixture
      resources={outside}
      allResources={widelyPlacedSpace.resources}
      memberships={otherMapMemberships(widelyPlacedSpace, opening.id)}
    />
  );
};
PlacedElsewhere.meta = { iframed: true };

const ROADMAP_ID = id('000000000040');
const PLAN_MAP = id('000000000041');
const RISKS_MAP = id('000000000042');

/** The target Space as the target read answers it: its Maps and their Graphs. */
const ROADMAP_TARGETS = new Map([
  [
    ROADMAP_ID,
    {
      id: ROADMAP_ID,
      title: 'Roadmap',
      maps: [
        {
          id: PLAN_MAP,
          title: 'Plan',
          graphs: [
            {
              id: id('000000000043'),
              title: 'Milestones',
              color: '#1f77b4',
              headShape: 'arrow' as const,
            },
          ],
        },
        {
          id: RISKS_MAP,
          title: 'Risks',
          graphs: [
            {
              id: id('000000000044'),
              title: 'Security',
              color: '#d62728',
              headShape: 'arrow' as const,
            },
          ],
        },
      ],
    },
  ],
]);

const ROADMAP_RESOURCES: readonly Resource[] = [
  {
    id: id('000000000045'),
    title: 'Roadmap',
    kind: 'space',
    content: { spaceId: ROADMAP_ID, map: PLAN_MAP, graph: id('000000000043') },
  },
  {
    id: id('000000000046'),
    title: 'Roadmap',
    kind: 'space',
    content: { spaceId: ROADMAP_ID, map: RISKS_MAP, graph: id('000000000044') },
  },
  {
    id: id('000000000047'),
    title: 'Release notes',
    kind: 'markdown',
    content: { url: EMPTY_ASSET_REF },
  },
];

/**
 * One Space under three rows that share its name: two Space Resources showing
 * it differently, one of them also on another Map, and the Space itself. Each
 * Space Resource row names the Map and Graph it shows, read from the target the
 * way the application reads it, and the Space row says it makes a new Space Resource.
 */
export const SpaceSelections: Story = () => (
  <ResourcesPopoverFixture
    resources={ROADMAP_RESOURCES}
    spaces={[{ id: ROADMAP_ID, title: 'Roadmap' }]}
    spaceTitleById={spaceTitlesById(ROADMAP_TARGETS)}
    spaceSelectionNameById={spaceSelectionNamesById(ROADMAP_TARGETS, ROADMAP_RESOURCES)}
    memberships={
      new Map([
        [id('000000000046'), [{ mapId: id('000000000048'), mapTitle: 'Deep dive', graphs: [] }]],
      ])
    }
  />
);
SpaceSelections.meta = { iframed: true };

const LONG_NAME = 'A Resource whose name runs far past the width the list can give it';
const LONG_SPACE_NAME = 'A Space whose name runs far past the width the list can give it';
const LONG_NAMED: readonly Resource[] = [
  { id: id('000000000050'), title: LONG_NAME, kind: 'markdown', content: { url: EMPTY_ASSET_REF } },
];

/**
 * A name longer than its row: a Resource placed in another Map, so its row
 * also carries a capsule and Delete, and a Space. Each name is cut short
 * with an ellipsis before the marks at the row's end rather than running
 * under them.
 */
export const LongNames: Story = () => (
  <ResourcesPopoverFixture
    resources={LONG_NAMED}
    spaces={[{ id: id('000000000051'), title: LONG_SPACE_NAME }]}
    memberships={
      new Map([
        [id('000000000050'), [{ mapId: id('000000000052'), mapTitle: 'Elsewhere', graphs: [] }]],
      ])
    }
  />
);
LongNames.meta = { iframed: true };

export const Empty: Story = () => (
  <ResourcesPopoverFixture resources={[]} allResources={RESOURCES} />
);
Empty.meta = { iframed: true };

export const LongList: Story = () => <ResourcesPopoverFixture resources={LONG_RESOURCES} />;
LongList.meta = { iframed: true };

export const Disabled: Story = () => <ResourcesPopoverFixture disabled />;
Disabled.meta = { iframed: true };

export const Refused: Story = () => <RefusedAdd />;
Refused.meta = { iframed: true };

export const PersistenceFailure: Story = () => (
  <ResourcesPopoverFixture
    notice={
      <PersistenceNotice
        navigate
        persistence={{
          kind: 'failed',
          failure: { kind: 'retryable-failure', code: 'network' },
        }}
        onRetry={() => undefined}
      />
    }
  />
);
PersistenceFailure.meta = { iframed: true };
