# A Resource plugin owns everything inside its rect

Status: accepted
Supersedes: 0137
Refines: 0020, 0051, 0056, 0064, 0070, 0079, 0084, 0093, 0106, 0113, 0114, 0118, 0119, 0120, 0121, 0122, 0123, 0125, 0128, 0134, 0135, 0139
Related: 0057, 0074, 0082, 0089, 0126, 0140

A Resource is drawn and authored by its **Resource plugin**. The canvas owns the rect and what connects rects: position, size, Resize, which Resource is selected, Edges, and the actions that change the Map. The plugin owns every pixel inside its outline and every way its content is authored. The application keeps no shared drawing of a Resource that a plugin fills a region of. An Image Resource is its picture, because the Image plugin draws nothing else.

Every plugin, bundled or written outside this repository, is built against one public **Resource API** and may reach nothing else. There is no private door for a bundled plugin and no second tier of the API. Plugins are compiled in and listed once at build time (ADR 0120), and each declares the API version it was written for, checked at build. The Resource API has a domain half that names no view, because the server and the CLI load it, and a view half.

**The plugins are listed once.** One build list, its own package with a domain half and a view half as a plugin has, names every plugin and, separately, the default plugin. The core reads the domain half at intake. The surfaces and the creation host are handed the view half at composition, so a test can mount a plugin the build does not list. Every other list of kinds (the Resources list, the Dock, Add's first choice) is that list's order. Nothing else imports a plugin. The per-package `kinds/` halves of ADR 0128 are retired: a plugin's declarations are its kind module, read through the list. The host gives a Resource no type per kind: to the host, `content` is a value a plugin parses, and what the host needs from it comes from what the plugin declares. A treatment the host draws on the outline for one sort of Resource, such as a Reference's dotted border and badged glyph, is keyed on a declaration (a declared Target), never on a kind, and a plugin's glyph is its own.

**The stored `kind` stays.** It is the Resource kind, the name that selects a plugin. The required Title does not change.

**A Resource is one structure, and it is part of the Resource API.** It is `{ id, title, kind, content }`, the same value in a Resource file, in a store, on the wire and given to a plugin. No plugin translates a Resource between forms, so a plugin's file codec is retired.

**Every file a Resource uses is an asset. The current Markdown setup is explicitly abandoned, and all assets follow the same approach.** An asset is bytes with a media type, named by the SHA-256 of those bytes, held in one asset store and written to `assets/` in an Aggregate directory. `content` reaches it by URL. A Markdown Resource's text is an asset exactly as an Image Resource's picture is, and so is whatever the next plugin keeps. The `<id>.md` file beside a Resource file, its locator in `content` and the source held in a stored document are all retired, and the host draws no line between text and binary.

## What a plugin keeps

A plugin keeps two things, each parsed by a strict schema it declares.

- **Resource content** is the Resource's `content`, the same on every Map.
- **Map content** is what it keeps for its Resource on one Map. A Map entry holds the canvas's `x`, `y` and `size`, and the plugin's Map content.

A plugin always has a value for each. Map content is what the entry stores, the plugin's declared default where it stores nothing, and the plugin's own declared value on a surface with no Map, so an absent value never tells a plugin where it is.

The Title, Resource content and Map content are each a value with a commit that is present or absent. A commit writes only the plugin's own Resource, goes through Space Authoring as every Edit does, and settles as completed, unchanged or refused once that Edit has been applied, including an Edit that waited behind another. A plugin never writes a position, a size or an Edge. A refusal reaches a plugin as copy the host has already worded from the refusal's stable identity (ADR 0057), which the plugin shows and never interprets. Anything a plugin must act on is a typed answer of its own.

**Open and Closed stop being the application's.** A plugin that wants the state keeps it in Map content, as Markdown, Space and Reference do. Image and Ur have none. An Ur Resource's Shape moves to its Map content in the same way (ADR 0121 keeps it the Map's), and with it goes every core rule about which kind may be Open or take a Shape: each is now a question of whether that plugin's schema accepts the value. Every tracked file rolls forward in the same change (ADR 0054).

**A plugin may hint at a size.** A Map content commit made on an author's gesture may carry a size hint. The canvas applies the floor, a cap and a Resize's displacement in that one Edit, or ignores the hint, as it always does on a Map entry with a stored size. A plugin asks once per gesture. **Open and expand is retired (ADR 0137):** it was an application Edit built on Open, which the application no longer has, and the hint is what a plugin's Open uses instead.

**A plugin may declare its outline.** It is a rectangle unless the plugin says otherwise, and it may depend on Map content. The canvas draws the Graph-colour border and the selection ring on that outline (ADR 0135, ADR 0139) for every plugin, and applies receding. So selection cannot be forgotten by a plugin, and no plugin has a special path.

## What the application offers

A **Resource surface** hosts a plugin's one view, giving it the Title, its content, its Map content, the dimensions to draw into, whether the Resource is selected, and the capabilities that surface offers. The Map, the Stage (ADR 0123) and another Resource's embedding are surfaces. A capability is present or absent, and that is the whole of what a plugin learns: it is not told which surface it is on. Absence is enforced as well as offered: the host refuses a commit from a withdrawn surface and makes an inert surface inert. The Stage stays its own surface, and withdraws authoring by offering none.

Commands are data that a plugin emits from its view and the canvas draws. "Editing" is no longer a word the application uses. A plugin with a mode, as Markdown has, owns the mode, its draft and how it ends; a plugin without one, as Image's Replace, owns that instead. A replaced working Space remounts every plugin, which discards a running draft.

**A Claim is who is interacting, and exclusivity is reached through one.** Claims nest through what a plugin embeds. The deepest holds the keyboard and shows its commands, a sibling is refused, an inner release returns to the outer, and an outer Claim is not released while an inner one runs. A Claim may run work exclusively, which withdraws authoring and navigation from every composed Space until the work settles (ADR 0126), while the plugin stays mounted to show the answer. That covers the Claims the work nests in and the plugin's own surface: they stay held and mounted, every commit they retain is refused, and only the work itself can still commit, to its plugin's own Resource, and store an asset. Only one runs at a time.

**An embedding is host-owned.** A plugin draws what it does not own through one `Embed`, given a Resource, or a Space with a view. The host draws it and owns all its authoring and its commands, offered from the embedding and never by kind. A Resource is drawn by its own plugin. A Reference Resource is an ordinary plugin: it embeds its Target on a surface offering no authoring of the Target, passing the Reference Resource's own Title and rename. The Target's plugin draws that Title as it draws any, so at most one Title draws and a Reference to an Image is a picture. A Space is drawn as one of its Maps: the view's, or that Space's `defaultMap` where no view is given (refining ADR 0079). A plugin that passes a commit for the view is given the host's chooser, which writes only through that commit, so whatever withdraws the commit withdraws the choice; where the plugin keeps the view is its own. Authoring the shown Space, its Maps and Graphs included, is offered only under a Claim the plugin passes. The embedding guards recursion and a deleted Target. Aggregate rules stay in the core, read from what each plugin declares (ADR 0128).

**Each Resource is drawn inside its own failure boundary**, so a plugin that throws loses that Resource and not the canvas.

**A plugin declares how it is created and the host does the creating.** A declaration names where it is offered (the Command Dock, arriving data, another Resource, a Space) and runs when pressed. It may gather input, then asks the host to create one or more Resources, which is atomic and is refused if creation is no longer available. The host places them and continues into the Title, and owns the lifetime of a new Space (ADR 0074): a plugin may ask for one and name it in its content, and never makes or deletes one. Among plugins accepting the same data, an exact match beats a wildcard, then build order decides.

Stored bytes become the asset store's, reversing ADR 0106's rule that each content kind gets a collection named for what it stores, and ADR 0106's exception to ADR 0056 now covers every asset. A reference to a stored asset is a whole string value in `content` or Map content, and the host finds references by walking those values, read or unread. Export carries the assets found. An asset nothing references is left out of the directory (ADR 0118), the store never deletes one (ADR 0106), and no plugin declares its assets. What Export owns in a directory is `assets/` and no `*.md` (ADR 0119, ADR 0134). A new text is a new asset and a new URL, so an Edit sees the change as it sees any other. Writing an asset and committing its URL is therefore how every plugin saves bytes, and an image replacement is an ordinary content commit, run exclusively. Admitting a picture becomes the Image plugin's rule. The host admits any media type, reversing ADR 0118's refusal of a file that is not an image. The asset of zero bytes always exists, so an empty Resource needs nothing stored.

## A kind with no plugin

**A stored Resource whose kind names no plugin in this build is drawn by the default plugin.** This reverses ADR 0120's refusal at intake. It covers a missing plugin only: a Resource with no `kind` stays refused (ADR 0128), and content that a present plugin's schema rejects stays refused, naming the Resource, because in this repository that is a defect in generated state (ADR 0054).

The default plugin is an ordinary plugin the host selects when no other matches. The Resource is placed, sized, connected, renamed, deleted and presented as any other, and offers no authoring of its content. A Reference that already names it is kept and embeds the default plugin's view, but no new Reference to it is created: the default plugin declares no Target, and a returning plugin that declares none would otherwise leave the aggregate refused.

**A Resource with no plugin is still a Resource.** Because the structure is the host's, Import, a store and Export carry it whole without reading `content` or Map content, and the assets it references travel by the same walk. A rename and a Delete are ordinary Edits. When its plugin returns, the plugin reads the Resource as it stands, in the store or the directory.

**While any plugin is missing, a Space nothing else refers to is held rather than refused**, an exception to ADR 0128's rooting rule. It holds only a Space the stored aggregate already holds: a commit that leaves a Space unrooted which the stored aggregate rooted is refused as it is with every plugin present. A commit that deletes the last Resource with no plugin while a Space is held only by this exception is refused, naming that Space, because otherwise the store would accept an aggregate that no longer opens. Space Authoring refuses that Delete before the working state changes, naming the missing kind, so no Edit is kept that every later commit of its Space would be refused behind.

## Old content

A bundled plugin rolls forward with the fixtures and keeps no reader for an old shape (ADR 0054, ADR 0056). The host provides no versioning of content. What a plugin outside this repository does with its own old content is its author's to decide.

## Considered options

- **Keep the shared frame and let a kind fill it.** Rejected. It is why an image cannot simply be an image, and every kind's differences accumulate as branches in the frame.
- **Open/Closed stays universal, with each kind choosing what Closed draws.** Rejected. A Closed picture that still shows the picture is a distinction nobody can see.
- **Open/Closed and Shape in Resource content.** Rejected. It loses a Resource being Open on one Map and Closed on another, and a Shape is notation that belongs to the diagram (ADR 0121).
- **Every plugin draws its border and ring.** Rejected. Every plugin would have to remember selection. A declared outline stroked by the canvas keeps ADR 0135 and ADR 0139 in one place.
- **The canvas draws a ring on the rect, with a plugin opting out.** Rejected. Only a plugin that is not a rectangle would opt out, which is a special path for one plugin.
- **A plugin never hints at a size.** Rejected. Opening a long document at a small size draws two cramped lines. Every compound-document system let a part ask and kept the veto in the container.
- **Open and expand kept as an application Edit.** Rejected. It keeps an application gesture for a concept the application no longer has.
- **A plugin's file form beside its stored form.** Rejected. A host without the plugin cannot convert between them, so it would hold a second shape and need a way back when the plugin returned.
- **Markdown source inside the Resource file's JSON.** Rejected. It keeps one kind's bytes on a path no other kind's take, and diffs badly (ADR 0020).
- **A Resource's own files beside its Resource file, or a `files` field.** Rejected. A file owned by its name is the orphan body ADR 0020 rejected, and it is a second way of holding bytes. A Markdown file and an image file are the same thing to the host.
- **Readable asset names.** Rejected. An asset overwritten under one name changes nothing an Edit compares, so a revision would not protect it.
- **A declaration of the assets a plugin references.** Rejected. A missing plugin cannot declare anything, so the walk has to exist, and one rule is enough.
- **Refusing an Aggregate with a missing plugin.** Rejected. It is safe for the data but makes the whole Aggregate unopenable for one Resource, and no host or compound-document system surveyed refuses stored content for this reason.
- **A `readOnly` flag on a plugin's view.** Rejected. It assumes what a surface is. Absent capabilities say the same thing and cover surfaces not yet thought of.
- **Telling a plugin which surface it is on.** Rejected. Every plugin would branch on a list that grows.
- **Space as a privileged exception, or a less stable tier of the API.** Rejected. A plugin that needs a private door shows the API is incomplete.
- **A plugin reads the shown Space and draws its own chooser.** Rejected. A plugin would read a Space it does not own, and the chooser would be redone by each plugin that embeds one.
- **Two embeddings, one for a Resource and one for a Map.** Rejected. They differ only in what is drawn.
- **A plugin as a functional core returning intents to the host.** Rejected. A file picker must open inside the press, drafts would move out of the editor, and embeddings stay ordinary composition anyway. The host's own decisions are pure cores behind the seam.
- **A layered helper that draws a titled rectangle around a plugin's body.** Rejected for now. It is the shared frame again on the plugin's side, and only Markdown would use it.
- **The plugin list in the core, with each package listing its kinds again.** Rejected. The `kinds/` halves became one-line registrations of their plugins, five lists drifted (the host drew its own glyph over two plugins'), and the core and the reusable UI depended on every plugin.
- **A static type per kind in the host.** Rejected. It makes reading another plugin's content easy and type-checked, which is what the host must not do, and only the Space lifecycle used it.
- **Runtime-loaded plugins.** Not built, as ADR 0120 left them.

## Cost accepted

The accessibility and drawing work now in the shared frame has to be reached through the API, or be redone by each plugin; the Resource API's `Title` is to exist for that reason. Plugins can look inconsistent with each other, and nothing but review prevents it. The API is a public commitment that the internal seams it replaces were not. A Resource a missing plugin referred to can be deleted unnoticed, in which case that Resource is refused as invalid when its plugin returns. Deleting a Resource with no plugin that alone rooted a Space is accepted while another Resource with no plugin remains, after which deleting the last is refused, and the aggregate is refused naming that Space when its plugin returns. The host cannot read a Space reference in such a Resource's content, so a Space it shares with a Space Resource (ADR 0074) is deleted with that Space Resource, and the aggregate is refused when the plugin returns. A plugin reading text reads it asynchronously, so a Markdown Resource draws after its asset arrives. A file on disk is named by its hash, so editing one by hand means renaming it and updating its URL, and a CLI helper can do that if it proves a problem. For the same reason a Save of a text shows in a diff as one file removed and another added, not as the lines that changed. An asset URL written inside another asset's bytes is not found by the walk, so a stored picture whose URL appears only in a Markdown Resource's text is left out of the Export, and under Running (ADR 0117), whose directory is the durable copy, it is lost when the run ends. Today's Export, which carries only an Image Resource's picture, loses it too. Every tracked Markdown Resource rolls forward (ADR 0054), which changes the published file format.

## Negative

- **Do not add a `readOnly` prop or a surface name to a plugin's view.**
- **Do not let a plugin write position, size or an Edge.**
- **Do not give a bundled plugin an import outside the Resource API.**
- **Do not import a plugin package outside the build list, or list the kinds a second time.**
- **Do not give a Resource a second shape for a file or a store.**
- **Do not keep a file beside a Resource file, or give any kind its own path for bytes.** Every file is an asset.
