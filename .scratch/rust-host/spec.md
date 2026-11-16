# A Rust host, and InfinityCube as a desktop application

**Status:** needs-triage

Decisions: ADR 0155, ADR 0156, ADR 0157 (all proposed). Research: `.scratch/desktop-app/research.md`. Decided in conversation with the maintainer, 15–17 November 2026.

## Problem Statement

InfinityCube runs only from a clone of the repository: `pnpm cube run <dir>` needs Node 26.8.1, pnpm and Vite's development server. A presenter who is not an InfinityCube developer cannot install it and open a talk. Every server-side host is TypeScript, and the maintainer wants the server side in Rust.

## Solution

First, the desktop application ships on the existing Node host: a production Node host with no Vite, run by a Tauri shell as a locked-down loopback sidecar, macOS first. Working code before the port.

Then A Rust host that answers the same HTTP contract as the TypeScript host, unchanged on the wire, behind a storage trait. It is wrapped by a command-line binary (`run`, `check`) and by a Tauri desktop application. The memory store comes first, then SQLite, then PostgreSQL, then the remaining CLI verbs and MCP, after which the TypeScript server is retired. TypeScript stays for the browser application and Mounting.

## Decisions

1. **Audience:** an installable application for presenters (not only the maintainer). First release unsigned, with Tauri's own updater keys; signing and notarization block a public launch.
2. **Vocabulary:** this is Running through a different host. `CONTEXT.md` does not change.
3. **Shell:** Tauri. One talk folder per window, each window owning its run; Export before a window or the application closes.
3a. **First stage, the Node sidecar:** a production Node host (no Vite) compiled to a single Node 26 binary, one per window, bound to `127.0.0.1` on a random port, refusing any other `Host`, requiring a per-launch secret, stopped by closing its stdin (Export, exit) with a five-second kill. macOS Apple Silicon first. The Rust host replaces it in the same shell once it passes the conformance suite.
4. **Wire contract:** the same `/api/spaces`, `/api/spaces/:id`, `/api/aggregate`, `POST /assets`, `GET /assets/:hash`, product addresses and single-page fallback; over loopback HTTP from the Node sidecar, then through a custom URI scheme from the Rust host; never IPC commands.
5. **Intake:** Rust reimplements it (ADR 0156), held to the TypeScript intake by one conformance suite that compares the kind of error and where it is, not the message text. An unknown kind is kept, as in TypeScript.
6. **Crates** live in this repository under `crates/` in one Cargo workspace with its own CI job: `intake` (pure: no IO, no async), `host` (tokio; storage trait, commit rules, HTTP application, assets, Import and Export), and two binaries over `host`.
7. **Storage:** one repository trait mirroring the TypeScript seam, memory first; SQLite and PostgreSQL through one SQL repository over `sqlx`; the commit decision is pure and shared by every store.
8. **Schema:** both hosts share one set of plain-SQL migrations until PostgreSQL moves, then Rust owns them.
9. **Browser floor:** WebKit is tested in CI; the desktop application declares a minimum macOS and WebKitGTK version (ADR 0157).
10. **Rust conventions:** `rust-sdk-dx` safety rules in full (`thiserror`, no `unwrap`/`expect`/`panic!` in library code, newtype ids, `#[must_use]`, tokio); `#[non_exhaustive]` and doctests on crate-root types only; `anyhow` allowed in the binaries' `main`. `serde` is a plain dependency of `intake`.
11. **Ids and clock:** required by the host's builder, as ADR 0109 requires (no defaults); the binaries pass the real ones.
12. **Order:** ST-65; the production Node host; the Tauri shell with the sidecar; WebKit; an unsigned macOS release. Then the conformance suite against the Node host, `intake`, `host`, the Rust CLI, and swapping the sidecar for the Rust host; then the databases.

## Out of scope

- Changing the HTTP contract or the browser application.
- Mounting, which stays TypeScript in the page.
- File watching or locking (ADR 0117 rejects them).
