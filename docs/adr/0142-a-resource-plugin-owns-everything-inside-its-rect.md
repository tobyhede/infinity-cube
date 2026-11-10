# A Resource plugin owns everything inside its rect

Status: accepted
Supersedes: 0137
Refines: 0051, 0064, 0120, 0121, 0123, 0125, 0128, 0135, 0139
Related: 0070, 0074, 0082, 0089, 0106, 0118, 0122, 0126, 0140

A Resource is drawn and authored by its **Resource plugin**. The canvas owns the rect and what connects rects: position, size, Resize, which Resource is selected, Edges, and the actions that change the Map. The plugin owns every pixel inside its outline and every way its content is authored. The application keeps no shared drawing of a Resource that a plugin fills a region of. An Image Resource is its picture, because the Image plugin draws nothing else.

Every plugin, bundled or written outside this repository, is built against one public **Resource API** and may reach nothing else. There is no private door for a bundled plugin and no second tier of the API. Plugins are compiled in and listed once at build time (ADR 0120), and each declares the API version it was written for, checked at build. The Resource API has a domain half that names no view, because the server and the CLI load it, and a view half.

**The stored `kind` stays.** It is the Resource kind, the name that selects a plugin. The envelope and required Title do not change.

## What a plugin keeps

A plugin keeps two things, each parsed by a strict schema it declares.

- **Resource content** is the existing `content`, the same on every Map.
- **Map content** is what it keeps for its Resource on one Map. A Map entry holds the canvas's `x`, `y` and `size`, and the plugin's Map content.

A plugin always has a value for each. Map content is what the entry stores, the plugin's declared default where it stores nothing, and the plugin's own declared value on a surface with no Map, so an absent value never tells a plugin where it is.

The Title, Resource content and Map content are each a value with a commit that is present or absent. A commit writes only the plugin's own Resource, goes through Space Authoring as every Edit does, and settles as completed, unchanged or refused once that Edit has been applied, including an Edit that waited behind another. A plugin never writes a position, a size or an Edge.

**Open and Closed stop being the application's.** A plugin that wants the state keeps it in Map content, as Markdown, Space and Reference do. Image and Ur have none. An Ur Resource's Shape moves to its Map content in the same way (ADR 0121 keeps it the Map's), and with it goes every core rule about which kind may be Open or take a Shape: each is now a question of whether that plugin's schema accepts the value. Every tracked file rolls forward in the same change (ADR 0054).

**A plugin may hint at a size.** A Map content commit made on an author's gesture may carry a size hint. The canvas applies the floor, a cap and a Resize's displacement in that one Edit, or ignores the hint. A plugin asks once per gesture. **Open and expand is retired (ADR 0137):** it was an application Edit built on Open, which the application no longer has, and the hint is what a plugin's Open uses instead.

**A plugin may declare its outline.** It is a rectangle unless the plugin says otherwise, and it may depend on Map content. The canvas draws the Graph-colour border and the selection ring on that outline (ADR 0135, ADR 0139) for every plugin, and applies receding. So selection cannot be forgotten by a plugin, and no plugin has a special path.

## What the application offers

A **Resource surface** hosts a plugin's one view, giving it the Title, its content, its Map content, the dimensions to draw into, whether the Resource is selected, and the capabilities that surface offers. The Map, the Stage (ADR 0123) and another Resource's embedding are surfaces. A capability is present or absent, and that is the whole of what a plugin learns: it is not told which surface it is on. Absence is enforced as well as offered: the host refuses a commit from a withdrawn surface and makes an inert surface inert. The Stage stays its own surface, and withdraws authoring by offering none.

Commands are data that a plugin emits from its view and the canvas draws. "Editing" is no longer a word the application uses. A plugin with a mode, as Markdown has, owns the mode, its draft and how it ends; a plugin without one, as Image's Replace, owns that instead. A replaced working Space remounts every plugin, which discards a running draft.

**A Claim is who is interacting, and exclusivity is reached through one.** Claims nest through what a plugin embeds. The deepest holds the keyboard and shows its commands, a sibling is refused, an inner release returns to the outer, and an outer Claim is not released while an inner one runs. A Claim may run work exclusively, which withdraws authoring and navigation from every composed Space until the work settles (ADR 0126), while the plugin stays mounted to show the answer. Only one runs at a time.

**An embedding is host-owned.** A Space Resource uses the Map embedding. A Reference Resource is an ordinary plugin: it embeds its Target on a surface offering no authoring of the Target, passing the Reference Resource's own Title and rename. The Target's plugin draws that Title as it draws any, so at most one Title draws and a Reference to an Image is a picture. The embedding guards recursion and a deleted Target. Aggregate rules stay in the core, read from what each plugin declares (ADR 0128).

**Each Resource is drawn inside its own failure boundary**, so a plugin that throws loses that Resource and not the canvas.

**A plugin declares how it is created and the host does the creating.** A declaration names where it is offered (the Command Dock, arriving data, another Resource, a Space) and runs when pressed. It may gather input, then asks the host to create one or more Resources, which is atomic and is refused if creation is no longer available. The host places them and continues into the Title, and owns the lifetime of a new Space (ADR 0074): a plugin may ask for one and name it in its content, and never makes or deletes one. Among plugins accepting the same data, an exact match beats a wildcard, then build order decides.

Stored bytes become a generic asset store's. A plugin declares which assets it references, as it declares its Resource references, and Export carries those. An image replacement is then an ordinary content commit, run exclusively.

## A kind with no plugin

**A stored Resource whose kind names no plugin in this build is drawn by the default plugin.** This reverses ADR 0120's refusal at intake. It covers a missing plugin only: a Resource with no `kind` stays refused (ADR 0128), and content that a present plugin's schema rejects stays refused, naming the Resource, because in this repository that is a defect in generated state (ADR 0054).

The default plugin is an ordinary plugin the host selects when no other matches. The Resource is placed, sized, connected, renamed, deleted, referenced and presented as any other, and offers no authoring of its content.

**While any plugin is missing, the host deletes nothing it cannot prove is unreferenced.** Resource content and Map content round-trip unread, the files named for that Resource are left alone, stored images are not pruned, and a Space nothing else refers to is held rather than refused.

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
- **Refusing an Aggregate with a missing plugin.** Rejected. It is safe for the data but makes the whole Aggregate unopenable for one Resource, and no host or compound-document system surveyed refuses stored content for this reason.
- **A `readOnly` flag on a plugin's view.** Rejected. It assumes what a surface is. Absent capabilities say the same thing and cover surfaces not yet thought of.
- **Telling a plugin which surface it is on.** Rejected. Every plugin would branch on a list that grows.
- **Space as a privileged exception, or a less stable tier of the API.** Rejected. A plugin that needs a private door shows the API is incomplete.
- **A plugin as a functional core returning intents to the host.** Rejected. A file picker must open inside the press, drafts would move out of the editor, and embeddings stay ordinary composition anyway. The host's own decisions are pure cores behind the seam.
- **A layered helper that draws a titled rectangle around a plugin's body.** Rejected for now. It is the shared frame again on the plugin's side, and only Markdown would use it.
- **Runtime-loaded plugins.** Not built, as ADR 0120 left them.

## Cost accepted

The accessibility and drawing work now in the shared frame has to be reached through the API, or be redone by each plugin; the Title component exists for that reason. Plugins can look inconsistent with each other, and nothing but review prevents it. The API is a public commitment that the internal seams it replaces were not. `images/` can grow while a plugin is missing, and something a missing plugin referred to can be deleted unnoticed, in which case that Resource is refused as invalid when its plugin returns.

## Negative

- **Do not add a `readOnly` prop or a surface name to a plugin's view.**
- **Do not let a plugin write position, size or an Edge.**
- **Do not give a bundled plugin an import outside the Resource API.**
