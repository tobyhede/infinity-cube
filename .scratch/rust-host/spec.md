# A Rust host, and InfinityCube as a desktop application

**Status:** needs-triage

Decisions: ADR 0155, ADR 0156, ADR 0157 (all accepted 18 November 2026). Research: `.scratch/desktop-app/research.md`, written before these decisions and superseded by them where they differ (it recommends Electron and leaves a Rust host out of scope); the points of it that still hold are carried into the decisions and open questions below. Decided in conversation with the maintainer, 15–17 November 2026.

## Problem Statement

InfinityCube runs only from a clone of the repository: `pnpm cube run <dir>` needs Node 26.8.1, pnpm and Vite's development server. A presenter who is not an InfinityCube developer cannot install it and open a talk. Every server-side host is TypeScript, and the maintainer wants the server side in Rust.

## Solution

First, the desktop application ships on the existing Node host: a production Node host with no Vite, run by a Tauri shell as a locked-down loopback sidecar, macOS first. Working code before the port.

Then a Rust host that answers the same HTTP contract as the TypeScript host, unchanged on the wire, behind a storage trait. It is wrapped by a command-line binary (`run`, `check`) and by a Tauri desktop application. The memory store comes first, then SQLite, then PostgreSQL, then the remaining CLI verbs, MCP and the development and test hosts, after which the TypeScript server is retired. TypeScript stays for the browser application and Mounting.

## Decisions

1. **Audience:** an installable application for presenters (not only the maintainer). First release unsigned, with Tauri's own updater keys; signing and notarization block a public launch (21).
2. **Vocabulary:** this is Running through a different host. `CONTEXT.md` gains one line: "sidecar" names only the desktop host process, and stays avoided for anything else.
3. **Shell:** Tauri. One Aggregate directory per window, each window owning its run; Export before a window or the application closes.
   3a. **First stage, the Node sidecar:** a production Node host (no Vite) compiled to a single Node 26 binary, one per window, bound to `127.0.0.1` on a random port, refusing any other `Host`, requiring a per-launch secret, stopped by closing its stdin (Export, exit) with a five-second kill. macOS Apple Silicon first. Its code (03, 04) landed before ADR 0155 was accepted, by the maintainer's choice. The Rust host replaces it in the same shell once it passes the conformance suite.
4. **Wire contract:** the same `/api/spaces`, `/api/spaces/:id`, `/api/aggregate`, `POST /assets`, `GET /assets/:hash`, product addresses and single-page fallback; over loopback HTTP from the Node sidecar, then through a custom URI scheme from the Rust host; never IPC commands. Under the scheme on macOS and Linux each talk has its own origin (the talk in the host part), so the presentation `BroadcastChannel` and Web Locks do not cross between talks, and the origin is the same on every launch of that talk, so what the page keeps in `localStorage` (the colour scheme) is kept. On Windows Tauri serves a scheme from `http://<scheme>.localhost`, so the scheme sets the origin and talks under one scheme share it; issue 13 records which of two answers holds there (one stable scheme per talk, or channel and lock names keyed by talk), an open decision until the Rust host ships on Windows. With no port, `Host` check or launch secret, two rules stand in their place: a talk window navigates only within its own origin, never to a remote one, and the scheme handler refuses a mutation whose `Origin` is not the application's scheme.
5. **Intake:** Rust reimplements it (ADR 0156), held to the TypeScript intake by one conformance suite that compares the kind of error and where it is, not the message text. An unknown kind is kept, as in TypeScript.
6. **Crates** live in this repository under `crates/` in one Cargo workspace with its own CI job: `intake` (pure: no IO, no async), `host` (tokio; storage trait, commit rules, HTTP application, assets, Import and Export), and the CLI binary over `host`. The desktop shell's binary stays in `packages/desktop/src-tauri/` and joins the same workspace as a member (09).
7. **Storage:** one repository trait mirroring the TypeScript seam, memory first; SQLite and PostgreSQL through one SQL repository over `sqlx`; the commit decision is pure and shared by every store.
8. **Schema:** both hosts share one set of plain-SQL migrations until PostgreSQL moves, then Rust owns them.
9. **Browser floor:** WebKit is tested in CI; the desktop application declares a minimum macOS and WebKitGTK version (ADR 0157).
10. **Rust conventions:** `rust-sdk-dx` safety rules in full (`thiserror`, no `unwrap`/`expect`/`panic!` in library code, newtype ids, `#[must_use]`, tokio); `#[non_exhaustive]` and doctests on crate-root types only; `anyhow` allowed in the binaries' `main`. `serde` is a plain dependency of `intake`.
11. **Ids and clock:** required by the host's builder, as ADR 0109 requires (no defaults); the binaries pass the real ones.
12. **The other TypeScript hosts:** the `.scratch/standalone-http-host/` tickets adopt the production Node host (03) rather than build another TypeScript host; 19 moves the hosts they serve to Rust.
13. **Order:** ST-65 (02); the production Node host (03); the Tauri shell with the sidecar (04); WebKit (05); an unsigned macOS release (06); creating a talk from the application (24). Then the conformance corpus and suite against the Node host (07, 08), the Cargo workspace (09), `intake` (10), `host` (11), the Rust CLI (12), and swapping the sidecar for the Rust host (13); then the databases (14, 15, 16); then the remaining verbs (17), MCP (18), the development and test hosts (19) and retiring the TypeScript server (20). Signing and notarization (21), the Windows bundle (22) and the Linux bundle (23) follow the first release.

## Open questions

- **Per-talk origin under the scheme.** Decision 4 needs a host part that is stable for a talk and safe in a URL; whether that is a hash of the folder's path or an id kept by the shell is 13's to decide.
- **Signing costs** (from the research): Gatekeeper blocks an unsigned macOS application and notarization comes after signing; on Windows no certificate type bypasses SmartScreen any longer: signing (OV, EV or Azure Artifact Signing) reduces its prompts while a signed file builds reputation, but does not remove them (21, 22).
- **Stopping a sidecar** (from the research): Tauri documents no stop protocol for a sidecar, which is why 03 and 04 define their own (stdin close, then kill). It goes with the sidecar in 13.

## Out of scope

- Changing the HTTP contract or the browser application.
- Mounting, which stays TypeScript in the page.
- File watching or locking (ADR 0117 rejects them).
