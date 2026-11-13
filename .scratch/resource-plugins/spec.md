# Resource plugins

Delivery for [ADR 0142](../../docs/adr/0142-a-resource-plugin-owns-everything-inside-its-rect.md), which supersedes ADR 0137 and refines ADR 0020, 0051, 0056, 0064, 0070, 0079, 0084, 0093, 0106, 0113, 0114, 0118, 0119, 0120, 0121, 0122, 0123, 0125, 0128, 0134, 0135 and 0139. The decision and its rejected options are in the ADR, and the terms in `CONTEXT.md`. This file is the plan, and the signatures and treatment an ADR does not bind. Prior art is in `canvas-shapes-research.md`, `block-editors-research.md`, `host-extensions-research.md` and `compound-documents-research.md` beside this file.

## Where it starts

Read on 2026-11-10.

- One shared frame draws every Resource on a Map: `CanvasResource` in `packages/ui`, inside `ResourceNode` in `packages/react-flow-adapter`. It owns the Title ladder, the rail, Open and Close, the `editing` display arm and Save and Cancel. A kind fills its content area through `KindView.canvas`.
- A kind is three halves: `packages/core/src/kinds/`, `packages/ui/src/kinds/`, `packages/app/src/kinds/`. Those halves import package internals. Logic for a kind also lives outside them, as `completeResourceBody`, `image-replacement.ts`, `embedded-map.ts`; `.scratch/resource-kind-modules/kind-sites.md` lists the sites that name a kind.
- A Markdown Resource has two shapes: `{ source }` stored and `{ path, mediaType }` plus a sidecar in its file, converted by `KindFileCodec`. It is the only kind whose codec is not the identity.
- The Stage already bypasses the frame and calls the kind's `presented`.
- A Map entry is strict, `{ x, y, open?, size?, shape? }`, with no room for a kind's data. `open` is stored in 5 tracked `space.json` files.
- Open and expand (ADR 0137) is an application Edit, `SnapshotEdit.openAndExpand`, measured through `CanvasResource`. `opensToFit` is a core flag that grows a Markdown Resource on Open.
- Creation lives in `kind-creation.ts`, each `app/kinds/` module and `resource-placement.ts`.
- Image bytes are image-specific: `POST /images`, the `images` table, `storeImage`, and `loadReferencedImages` naming the kind in Export.
- `complete` in `space-authoring.ts` can answer `queued` with no later outcome.
- No per-Resource error boundary exists in `packages/app/src`, `packages/ui/src` or `packages/react-flow-adapter/src`. The one boundary, `SpaceAppFailure` in `packages/app/src/components/`, replaces the whole Space's application with a report when a render throws.

## The target

`@project/resource-api` has a `/domain` entry that imports no React and a `/view` entry. **Each plugin is its own package** with those two halves, imports no `@project/*` package but `@project/resource-api`, and is listed once in the build-time plugin list. React and the plugin's own third-party dependencies are allowed, and a new package also takes the workspace alias entries in `AGENTS.md`. A bundled plugin takes a bare kind id and its entry under `docs/schema/resource/`. A lint ban holds the import rule.

```ts
// /domain: the one structure, in a Resource file, a store, on the wire and given to a plugin
interface Resource<C = unknown> { id: ResourceId; title: string; kind: string; content: C }
type AssetRef = `/assets/${string}`                       // /assets/ then the SHA-256 as 43 characters of unpadded base64url (ADR 0106), a whole string value
assetRefSchema                                            // the runtime parser the walk and a plugin's content schema share

// /domain: what KindModule declares today, less the file codec, `resolveContent`, `canonicalContent` and the Open and Shape flags, plus
definePlugin<C, M>({
  apiVersion, kind, name, listName, referenceName, content, newContent?,
  mapContent: { schema, default, withoutMap? },     // withoutMap falls back to default
  outline?(mapContent),                             // a rectangle when absent
  /* the reference, target and selection declarations */
})

// /view
definePluginView<C, M>({ View, Glyph, creates? })

type Answer = 'completed' | 'unchanged' | { refused: string }
type Kept<T> = { value: T; commit?: (next: T) => Promise<Answer> }
type EmbedView = { map: MapId; graph?: GraphId; framing?: SpaceFraming } // which of a Space's Maps an Embed shows, and where

interface Surface<C, M> {
  resource: Resource<C>                                   // title and content below are its values, with their commits
  title: Kept<string>
  content: Kept<C>
  map: Kept<M> & { commit?: (next: M, options?: { sizeHint?: Size }) => Promise<Answer> }
  size: Size
  selected: boolean
  claim?(): OwnClaim<C, M> | undefined
  assets: { url(ref): string; read(ref): Promise<Blob | { refused: string }>; pick?(accept): Promise<File[]>; store?(bytes: Blob): Promise<AssetRef | { refused: string }> }
  // One component for the surface's lifetime: unmounting releases, so a new type per render would release every Claim inside it.
  // One Embed: a Resource, drawn by its own plugin, or a Space, drawn as one of its Maps.
  // No `select`: the Space's defaultMap. `select` with a commit: the host's chooser and framing, writing only through it.
  // Choosing another Map commits a view with no framing; reframing commits the same Map and Graph with the new framing.
  // Enter, which navigates into the shown Space, is an embedding command too, offered where navigation is.
  // `claim`: the shown Space's authoring, its Maps and Graphs included. Commands come from these, never from a kind.
  Embed: ComponentType<{ resource: ResourceId; title: Kept<string> } | { space: SpaceId; select?: Kept<EmbedView>; claim?: Claim }>
}

interface Claim { release(): void }   // never refused: while an inner Claim or its own exclusive work runs, the host releases it when that ends
interface OwnClaim<C, M> extends Claim {
  exclusively<T>(work: (own: Exclusive<C, M>) => Promise<T>): Promise<T | 'busy'>
}
// The surface's commits and store, as far as it offered them, live only while the work runs.
type Exclusive<C, M> = {
  title?: Kept<string>['commit']
  content?: Kept<C>['commit']
  map?: Surface<C, M>['map']['commit']
  store?: Surface<C, M>['assets']['store']
}

type Creation<C> =                                   // each `from` given its own input
  | { from: 'dock'; run(host: CreationHost<C>): void | Promise<void> }
  | { from: 'data'; types: string[]; accepts?(data: CreationData): boolean; run(host, data: CreationData) }
  | { from: 'resource'; accepts?(resource: Resource): boolean; run(host, resource: Resource) }
  | { from: 'spaces'; run(host, space: { spaceId: string; title: string }) }   // a Space chosen from a list of Spaces
interface CreationHost<C> {
  create(items: New<C>[]): Promise<Answer>
  assets
  report(words: string): void                        // a refusal the plugin worded, which the host shows
}
type CreationData = { kind: 'files'; files: File[] } | { kind: 'url'; url: string }   // a URL matches as `text/uri-list`
type New<C> =
  | { title?: string; content: C }
  | { title?: string; contentFor: (s: NewSpace) => C; newSpace?: true }   // the only item of its create; without newSpace, the offered Space
type NewSpace = { spaceId: string; map: string; graph: string }                      // the new Space and the Map and Graph it opens on
```

The API also exports `Title`, `Own` (the region that is the plugin's for the pointer), `<Rail commands>` (which draws nothing: it publishes the plugin's commands as data to its surface, and the canvas draws them on the rail), and `/view/testing`'s `renderPlugin(View, { content, map, grants })`.

Invariants:

- A Resource has one shape everywhere. **Every file is an asset: the current Markdown setup is explicitly abandoned, and all assets follow the same approach.** Markdown, Image, Mermaid and a kind with no plugin differ in nothing the host sees.
- A plugin saves bytes by `store`, which answers their `AssetRef`, then a content commit naming it. A plugin creating a Resource stores first, or names the asset of zero bytes, which always exists, so it needs no id and `newContent` stays a plain value.
- The host finds asset references by walking `content` and Map content for whole string values that `assetRefSchema` accepts, whether or not it can read them. Export carries what it finds. Import admits every asset in the directory. A string that only looks like a reference is treated as one, and absent bytes are not an error: Export keeps the URL, completes (ADR 0118) and removes no file of that name. An external URL, such as an Image Resource's `https:` one (ADR 0106), is not an asset: the walk does not find it and Export carries no bytes for it (ADR 0118).
- A commit settles once its Edit has been applied, including one `queued` behind another. It answers refused from a replaced working Space and from a withdrawn surface.
- `run` and rail actions are called in the press, so a picker can open. An `await` before `pick` loses the press. `Exclusive` has no `pick`, so work that needs a file picks first and then calls `exclusively`.
- `host.create` takes no position; the gesture gave it. A second Dock press of a kind while that kind's Dock creation runs is ignored. `run` has no surface, so the host reports a refused `store` or `create` made through `host`, a plugin's own refusal handed to `report`, and a `run` that throws. A data `types` entry is exact or a wildcard (`image/*`, or `*` then `/*`): an exact match beats a wildcard, then build order decides.
- A Claim held by one chain answers `undefined` to another. Unmount releases. A host-ended Claim always unmounts the plugin, keyed by Replacement epoch.
- `exclusively` is one at a time, and answers `busy` before any work starts.
- `exclusively` withdraws every commit, `store` and `pick` on every surface, including the calling plugin's own and those of the Claims around it. Those Claims stay held and their plugins mounted, each surface re-renders without what was withdrawn, and a retained callback answers refused. A rail command or in-rect control therefore cannot change the Space around the work, whichever Claim's commands are showing.
- The only commits that still land are the ones handed to `work` as `own`. Each writes only the calling plugin's Resource, `own.store` writes an asset, and each answers refused once `work` settles.
- `{ refused: string }` is copy the host has already worded from the refusal's stable identity (ADR 0057), and it is final. A plugin shows it and keeps its draft. It never branches on, compares or parses it, and a plugin's test asserts that a refusal arrived, not its words. A cause a plugin must act on is its own typed arm, as `'busy'` is.

Behind the seam, as pure cores with a thin shell: which fields a surface offers (`mapSurfacePolicy` and availability), the Claim chain, and the creation decision.

Also behind the seam, as issue 01 found:

- Withdrawal is offered and enforced. The surface host builds each surface without what is withdrawn. It also refuses a retained commit, when called, if its surface is unmounted, the Replacement epoch has moved, or exclusive work is running. The exclusive gate is application-wide across composed Spaces and lives in the surface host around `complete`. Today's `replacingImage` only withdraws controls.
- `complete` settles a `queued` completion through a callback held on the queue entry. The drain calls it with the entry's own result, or with refused when the entry's epoch has moved or a throw abandoned it.
- The Map surface's commit caps a size hint at the visible canvas (`visibleCanvasCap`, a canvas fact). The Edit then applies the floor and displacement. The plugin measures at its own width and the cap applies to each side separately, so a capped width can leave text taller than its hint, drawn with overflow.
- A creation with a new Space, or of a listed Space, goes through the coordinated Space Resource lifecycle, not `complete`. `planCreate` and `planLink` take a document builder (`CreateSpaceResourceInput.document`), which the host builds from the plugin's `contentFor` and the lifecycle calls with the Space made or linked, throwing unless the document names that Space alone.

The plugin-level test suite renders each plugin with every capability absent, and the host mounts one probe plugin on each surface.

## Settled treatment

Not bound by the ADR, and free to change with a story and a test.

- Rail: the canvas draws it with `CommandToolbar`. During nested Claims the deepest Claim's commands show. In-rect controls are allowed too.
- Space: the plugin's rail has Open, Close, Enter and the Title. The host-owned Map embedding draws the Map and Graph chooser and the target Space's links, and, under the Claim the plugin passes, that Space's Map and Graph authoring. It writes a choice through the plugin's selection commit (`select`), so withdrawal covers it, and while `select` carries no commit the chooser is drawn disabled. Issue 01 found that a plugin cannot read the target Space's structure, and that these commands write a Space other than the plugin's own Resource.
- Claims: there is one chain at a time, so an entered Space or an open Markdown draft stops every other Resource from claiming until it is released, as availability does today.
- Title: Ur and Markdown draw it inline with `Title`. Image draws none, keeping it as its text alternative, and is renamed from the rail. An Open Reference passes its own to the Target.
- Border, ring, receding: the canvas draws them on the outline. Image shows a border only when selected or in a Graph.
- Pointer and events: the whole rect moves and selects unless a plugin wraps a region in `Own`, and a Claim gives the plugin the whole rect. Inside `Own`, pointer and key events are the plugin's; drop and paste stay the host's unless the plugin takes them; canvas shortcuts never interrupt IME composition. `Own` works on every surface but an inert one.
- Image: fits the whole picture into the size it is given, without cropping.
- Markdown: `{ default: { open: false }, withoutMap: { open: true } }`. It reads its text before committing Open, and carries the hint on that one commit. An Edit command or a press on the body takes a Claim and shows the source editor. Save and Cancel are rail commands, and `Mod-Enter` and `Escape` still work. A click elsewhere still leaves the draft up (ADR 0064).
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
8. `11` — list the plugins once, after the Embed amendment is built.

## Out of scope

Runtime-loaded plugins, a CLI helper for editing an asset by hand (built if manual editing proves a problem), host versioning of content, a stored plugin version, separate keyboard and pointer Claims, Undo across a Claim, Edge attachment for outlines other than Ur's Shapes, and renaming "Closed Size" (a rename ships alone). The Notes window draws no Resource yet; when it does, it is one more surface.
