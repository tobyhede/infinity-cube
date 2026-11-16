# A Rust host replaces every server-side host, and Tauri is the desktop shell

Status: proposed
Related: 0030, 0034, 0071, 0078, 0109, 0117, 0124, 0130, 0156, 0157

InfinityCube is to be installed and run by presenters who are not its developers: a desktop application they download, open a talk folder in, and edit. Today every server-side host is TypeScript on Node 26.8.1 (ADR 0071), and Running serves through Vite's development server, so it needs a clone of the repository, Node and pnpm. ADR 0034 already makes the HTTP application Fetch-native and calls the Node and Vite wiring "prototype composition, not architectural constraints". The maintainer decided on 16 November 2026 to move the server side to Rust and to ship the desktop application with Tauri. The research behind this is `.scratch/desktop-app/research.md`; the plan is `.scratch/rust-host/spec.md`.

## The decision

- **One Rust host serves the HTTP contract the TypeScript host serves, unchanged on the wire.** Every route under `/api` and `/assets`, the product addresses (`/` and `/spaces/…`) answered before the shell, the single-page fallback, the transport policy and the Problem Details catalogue are the same requests answered with the same statuses, bodies and headers. The browser, its typed client and the Mount build do not change.
- **It replaces every server-side host, in stages.** Running and `check` first; then SQLite; then PostgreSQL; then the remaining CLI verbs (`init`, `import`, `export`) and the MCP server. When the last stage lands the TypeScript server is retired. TypeScript remains the language of the browser application and of Mounting, which runs its host inside the page (ADR 0130). No new server-side host is added in TypeScript meanwhile.
- **The host is a library behind a storage trait.** A Rust `host` crate owns the HTTP application, product resolution, the commit rules, assets, and Import and Export of an Aggregate directory. It reaches storage only through one repository trait that mirrors the TypeScript seam (`StoredSpaceRepository` plus the aggregate lifecycle of `SpaceRepository`, and the asset store). The memory store is the first implementation; SQLite and PostgreSQL follow behind the same trait through one SQL repository over `sqlx`. The commit decision is pure code every store calls, so only transactions and locking differ between stores.
- **Both hosts share one database schema until PostgreSQL moves.** The migrations are plain SQL files that Prisma (PostgreSQL), the SQLite migrator and `sqlx` all apply, held to one schema by a test. Migration ownership moves to Rust when PostgreSQL does. Either host can then serve the same database during the switch, with no data migration.
- **Two thin shells wrap the library.** A command-line binary (`run`, `check`) serves to the person's browser on loopback; a Tauri application serves to its own window through a custom URI scheme, with no port. The Tauri application opens one talk folder per window, each window owning its own run, and Exports before the window or the application closes.
- **Nondeterminism is still injected at composition (ADR 0109).** The host's builder requires its directory, its id source and its clock; the two shells pass the real ones, and tests pass deterministic ones.

## Why

- **The desktop application needs a host that is not Node.** Electron would run the existing host in its main process, but embeds Node 24 against ADR 0071's Node 26 pin and ships Chromium in every download. Tauri with a Node sidecar keeps the TypeScript host but ships a Node binary anyway, needs a stop protocol Tauri does not document, and listens on a port. A Rust host runs inside Tauri's own process, with no second runtime and no port.
- **One host rather than two.** A Rust host for the desktop alone would leave two server implementations to keep in step forever. Making Rust the end state for every server-side host bounds that to a transition.
- **The wire contract is the seam that already exists.** Keeping it unchanged means the browser, the Mount build and the HTTP-level tests stay as they are, and the same tests can be run against both hosts (ADR 0156).

## Rejected

- **Electron, with the run in its main process.** The smallest step from today's code, rejected for the Node 24 runtime under a Node 26 pin, the bundled Chromium, and because it keeps the server in TypeScript, which the maintainer wants to move.
- **Tauri with a Node sidecar.** It keeps the TypeScript host, but a whole Node binary rides along, so Tauri's size advantage mostly goes, and it needs a single-file Node build per platform, a graceful-stop protocol of its own, and a loopback listener with no host checks.
- **Tauri IPC commands in place of HTTP.** A second client in the browser application beside the typed HTTP client, and nothing the existing HTTP-level tests could run against.
- **Porting only the Running host.** Smaller at first, but it leaves a TypeScript server for the databases indefinitely and invites designing the Rust host around a memory store alone.

## Consequences

- ADR 0034's "runtime hosts adapt the application" now includes a second implementation of the application itself, not only a second adapter. Accepting this ADR refines 0034, and refines 0124 for as long as two CLIs exist: the Rust binary takes verbs from `pnpm cube` stage by stage, and `pnpm cube` keeps the rest until it is retired.
- ADR 0071's Node pin governs the TypeScript host until it is retired. The desktop application's browser floor is ADR 0157.
- Running's semantics (ADR 0117 and its refinements) are unchanged: the directory is the durable copy, Export is the only write, and file watching and locking stay rejected. ST-65 (opening a Space never writes the directory) is fixed before the Rust host is pointed at real talks.
- The first installable release is unsigned, with Tauri's own updater keys; signing and notarization are a release blocker before a public launch.
- Rust code follows the `rust-sdk-dx` conventions for its safety rules (`thiserror` errors, no `unwrap`, `expect` or `panic!` in library code, newtype identifiers, `#[must_use]`, tokio), relaxed to crate-root types for `#[non_exhaustive]` and doctests, since both consumers are ours. `serde` is a plain dependency of intake, not a feature.
- No code changes with this ADR. The work is `.scratch/rust-host/issues/`.
