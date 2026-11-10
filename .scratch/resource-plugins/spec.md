# Resource plugins

Delivery for [ADR 0142](../../docs/adr/0142-a-resource-plugin-owns-everything-inside-its-rect.md), which supersedes ADR 0137 and refines ADR 0051, 0064, 0120, 0121, 0123, 0125, 0128, 0135 and 0139. The decision and its rejected options are in the ADR, and the terms in `CONTEXT.md`. This file is the plan, and the signatures and treatment an ADR does not bind. Prior art is in `canvas-shapes-research.md`, `block-editors-research.md`, `host-extensions-research.md` and `compound-documents-research.md` beside this file.

## Where it starts

Read on 2026-11-10.

- One shared frame draws every Resource on a Map: `CanvasResource` in `packages/ui`, inside `ResourceNode` in `packages/react-flow-adapter`. It owns the Title ladder, the rail, Open and Close, the `editing` display arm and Save and Cancel. A kind fills its content area through `KindView.canvas`.
- A kind is three halves: `packages/core/src/kinds/`, `packages/ui/src/kinds/`, `packages/app/src/kinds/`. Those halves import package internals. Logic for a kind also lives outside them, as `completeResourceBody`, `image-replacement.ts`, `embedded-map.ts`; `.scratch/resource-kind-modules/kind-sites.md` lists the sites that name a kind.
- The Stage already bypasses the frame and calls the kind's `presented`.
- A Map entry is strict, `{ x, y, open?, size?, shape? }`, with no room for a kind's data. `open` is stored in 5 tracked `space.json` files.
- Open and expand (ADR 0137) is an application Edit, `SnapshotEdit.openAndExpand`, measured through `CanvasResource`. `opensToFit` is a core flag that grows a Markdown Resource on Open.
- Creation lives in `kind-creation.ts`, each `app/kinds/` module and `resource-placement.ts`.
- Image bytes are image-specific: `POST /images`, the `images` table, `storeImage`, and `loadReferencedImages` naming the kind in Export.
- `complete` in `space-authoring.ts` can answer `queued` with no later outcome.
- No error boundary exists in `packages/app/src`, `packages/ui/src` or `packages/react-flow-adapter/src`.

## The target

`@project/resource-api` has a `/domain` entry that imports no React and a `/view` entry. **Each plugin is its own package** with those two halves, imports only `@project/resource-api`, and is listed once in the build-time plugin list. A lint ban holds the import rule.

```ts
// /domain: what KindModule declares today, less the Open and Shape flags, plus
definePlugin<C, M>({
  apiVersion, kind, name, listName, referenceName, content, newContent?, file?,
  mapContent: { schema, default, withoutMap? },     // withoutMap falls back to default
  assetReferences?(content, mapContent),
  outline?(mapContent),                             // a rectangle when absent
  /* the reference, target and selection declarations */
})

// /view
definePluginView<C, M>({ View, Glyph, creates? })

type Answer = 'completed' | 'unchanged' | { refused: string }
type Kept<T> = { value: T; commit?: (next: T) => Promise<Answer> }

interface Surface<C, M> {
  title: Kept<string>
  content: Kept<C>
  map: Kept<M> & { commit?: (next: M, options?: { sizeHint?: Size }) => Promise<Answer> }
  size: Size
  selected: boolean
  claim?(): Claim | undefined
  assets: { url(ref): string; pick?(accept): Promise<File[]>; store?(file): Promise<AssetRef | { refused: string }> }
  Embed: ComponentType<{ resource: ResourceId; title: Kept<string> } | { map: SpaceView; claim?: Claim }>
}

interface Claim { release(): boolean; exclusively<T>(work: () => Promise<T>): Promise<T | 'busy'> }

type Creation<C> = {
  from: 'dock' | 'data' | 'resource' | 'space'
  accepts?(input): boolean
  run(host: { create(items: New<C>[]): Promise<Answer>; assets }, input): void | Promise<void>
}
type New<C> = { title?: string; content: C | ((s: NewSpace) => C); newSpace?: true }
```

The API also exports `Title`, `Own` (the region that is the plugin's for the pointer), `<Rail commands>`, and `/view/testing`'s `renderPlugin(View, { content, map, grants })`.

Invariants:

- A commit settles once its Edit has been applied, including one `queued` behind another. It answers refused from a replaced working Space and from a withdrawn surface.
- `run` and rail actions are called in the press, so a picker can open. An `await` before `pick` loses the press.
- `host.create` takes no position; the gesture gave it. A second press while a creation runs is ignored.
- A Claim held by one chain answers `undefined` to another. Unmount releases. A host-ended Claim always unmounts the plugin, keyed by Replacement epoch.
- `exclusively` is one at a time, and answers `busy` before any work starts.
- The Claim keeps its own chain's capabilities while `exclusively` withdraws everyone else's.

Behind the seam, as pure cores with a thin shell: which fields a surface offers (`mapSurfacePolicy` and availability), the Claim chain, and the creation decision.

The plugin-level test suite renders each plugin with every capability absent, and the host mounts one probe plugin on each surface.

## Settled treatment

Not bound by the ADR, and free to change with a story and a test.

- Rail: the canvas draws it with `CommandToolbar`. During nested Claims the deepest Claim's commands show. In-rect controls are allowed too.
- Title: Ur and Markdown draw it inline with `Title`. Image draws none, keeping it as its text alternative, and is renamed from the rail. An Open Reference passes its own to the Target.
- Border, ring, receding: the canvas draws them on the outline. Image shows a border only when selected or in a Graph.
- Pointer and events: the whole rect moves and selects unless a plugin wraps a region in `Own`, and a Claim gives the plugin the whole rect. Inside `Own`, pointer and key events are the plugin's; drop and paste stay the host's unless the plugin takes them; canvas shortcuts never interrupt IME composition. `Own` works on every surface but an inert one.
- Image: fits the whole picture into the size it is given, without cropping.
- Markdown: `{ default: { open: false }, withoutMap: { open: true } }`. Open hints at the size of its content. An Edit command or a press on the body takes a Claim and shows the source editor. Save and Cancel are rail commands, and `Mod-Enter` and `Escape` still work. A click elsewhere still leaves the draft up (ADR 0064).
- Matching data: exact beats wildcard, then build order.
- A failure boundary and a deleted Target each draw a short note in the Resource's rect.

## Order

Each step is its own PR, leaves `main` green and rolls fixtures, seeds and tests forward with it (ADR 0054). The old frame hosts any kind not yet moved.

1. `01` — a throwaway proof of the interface on the hard paths.
2. `02` — the Resource API and its hosts, with Ur on it.
3. `03` — the asset store; `04` — Image.
4. `05` — Markdown; `06` — Reference.
5. `07` — Space, last of the kinds because it is the riskiest.
6. `08` — creation through the API; `09` — the default plugin.
7. `10` — retire the shared frame and the core fields.

## Out of scope

Runtime-loaded plugins, host versioning of content, a stored plugin version, separate keyboard and pointer Claims, Undo across a Claim, Edge attachment for outlines other than Ur's Shapes, and renaming "Closed Size" (a rename ships alone). The Notes window draws no Resource yet; when it does, it is one more surface.
