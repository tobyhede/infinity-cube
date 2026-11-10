# A Resource plugin owns everything inside its rect

Status: accepted
Supersedes: 0137
Refines: 0051, 0064, 0120, 0121, 0123, 0125, 0128, 0135, 0139
Related: 0070, 0082, 0089, 0106, 0118, 0122, 0126, 0140

A Resource is drawn and authored by its **Resource plugin**. The canvas owns the rect and what connects rects: position, size, Resize, which Resource is selected, Edges and the actions that change the Map. The plugin owns every pixel inside the rect and every way its content is authored. The application keeps no shared drawing of a Resource that a plugin fills a region of. An Image Resource is its picture, because the Image plugin draws nothing else.

Every plugin, bundled or written outside this repository, is built against one public **Resource API** and may reach nothing else. There is no private door for a bundled plugin and no second tier of the API. Plugins are still compiled in and listed once at build time (ADR 0120), and each declares the API version it was written for, checked at build. The Resource API has a domain half that names no view, because the server and the CLI load it, and a view half.

**The stored `kind` stays.** It is the Resource kind, the name that selects a plugin. The envelope and required Title do not change.

## What a plugin keeps

A plugin keeps two things, each parsed by a strict schema it declares.

- **Resource content** is the existing `content`, the same on every Map.
- **Map content** is what it keeps for its Resource on one Map. A Map entry holds the canvas's `x`, `y` and `size`, and the plugin's Map content.

A plugin commits either one, only for its own Resource, and hears whether the commit completed, changed nothing or was refused. Commits go through Space Authoring as every Edit does. A plugin never writes a position, a size or an Edge.

**Open and Closed stop being the application's.** A plugin that wants the state keeps it in Map content, as Markdown, Space and Reference do. Image and Ur have none. An Ur Resource's Shape moves to its Map content in the same way (ADR 0121 keeps it the Map's), and with it goes every core rule about which kind may be Open or take a Shape: each is now a question of whether that plugin's schema accepts the value. Every tracked file rolls forward in the same change (ADR 0054).

**Open and expand is retired (ADR 0137).** It was an application Edit built on Open, which the application no longer has. A Resource renders into whatever size the canvas gives it, and a plugin asks for none.

## What the application offers

A **Resource surface** hosts a plugin's one render, giving it the Title, its content, its Map content when there is a Map, the dimensions to draw into, and the capabilities that surface offers. The Map, the Stage (ADR 0123) and another Resource's embedding are surfaces. A capability is present or absent, and that is the whole of what a plugin learns: it is not told which surface it is on. The Stage stays its own surface, and withdraws authoring by offering none.

A Map also tells the render whether the Resource is selected, its Graph's colour and whether it recedes (ADR 0135, ADR 0139), and every plugin draws those from the same inputs. The anchor handles and the resize control stay the canvas's, so a selected Resource shows as selected whatever its plugin draws.

The API offers commit, an exclusive interaction claim (one at a time, canvas-wide, as ADR 0064 had for content edits), the Title component, a standard frame drawing the border, ring and receding on a rectangle, a generic asset store, and the embedding of a Map or of another Resource. "Editing" is no longer a word the application uses. A plugin with a mode, as Markdown has, owns the mode, its draft and how it ends; a plugin without one, as Image's Replace, owns that instead.

A Space Resource uses the Map embedding. A Reference Resource is an ordinary plugin: it embeds its Target on a surface offering no authoring of the Target, under the Reference Resource's own Title and rename. Aggregate rules stay in the core, read from what each plugin declares (ADR 0128).

Stored bytes become the asset store's. A plugin declares which assets its content references, as it declares its Resource references, and Export carries those. An image replacement is then an ordinary content commit, its exclusivity (ADR 0126) coming from the claim.

## Considered options

- **Keep the shared frame and let a kind fill it.** Rejected. It is why an image cannot simply be an image, and every kind's differences accumulate as branches in the frame.
- **Open/Closed stays universal, with each kind choosing what Closed draws.** Rejected. A Closed picture that still shows the picture is a distinction nobody can see.
- **The canvas drawing the border and ring, with a plugin opting out.** Rejected. Only a plugin that is not a rectangle would opt out, which is a special path for one plugin, and it contradicts the plugin owning what is inside its rect.
- **Open and expand kept, with a plugin requesting a size.** Rejected. It keeps an application gesture for a concept the application no longer has.
- **Open/Closed and Shape in Resource content.** Rejected. It loses a Resource being Open on one Map and Closed on another, and a Shape is notation that belongs to the diagram (ADR 0121).
- **A `readOnly` flag on a plugin's view.** Rejected. It assumes what a surface is. Absent capabilities say the same thing and cover surfaces not yet thought of.
- **Telling a plugin which surface it is on.** Rejected. Every plugin would branch on a list that grows.
- **Space as a privileged exception, or a less stable tier of the API.** Rejected. A plugin that needs a private door shows the API is incomplete.
- **Runtime-loaded plugins.** Not built, as ADR 0120 left them.
- **Host versioning of content.** Not built. A plugin that changes its format handles its old content in its own schema, and a kind nothing registers is still refused at intake.

## Cost accepted

The accessibility and drawing work now in the shared frame has to be reached through the API, or be redone by each plugin; the Title component exists for that reason. Plugins can look inconsistent with each other, one may ignore its Graph colour, and nothing but review prevents it. Reading a long document on a Map is an Open and then a drag, now that Open and expand has gone. The API is a public commitment that the internal seams it replaces were not.

## Negative

- **Do not add a `readOnly` prop or a surface name to a plugin's render.**
- **Do not let a plugin write position, size or an Edge.**
- **Do not give a bundled plugin an import outside the Resource API.**
