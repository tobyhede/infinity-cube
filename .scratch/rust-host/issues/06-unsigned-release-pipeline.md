# 06 — An unsigned macOS release with auto-update

**Status:** ready-for-agent

**Blocked by:** 04, 05.

**What to build:** CI that builds a macOS Apple Silicon bundle on a tag (Windows, 22, and Linux, 23, follow once it works), publishes it to GitHub Releases with the Tauri updater's static JSON, and signs updates with Tauri updater keys held as a CI secret. Install notes explain the one-time Gatekeeper step. The build runs `pnpm --filter @project/desktop build` (the browser build, then `tauri build`); since 13 the shell serves the Rust host in its own process, so no Node single executable is built. Code signing and notarization are 21, which blocks a public launch.

- [ ] A tagged build installs on macOS and updates to the next tag.

## Comments

**2026-11-22, built, not yet proven.** `release/build.sh --desktop` (`pnpm release:build --desktop`) builds the macOS bundle with the same entry point as the CLI preview build: the version comes from the Cargo workspace (`tauri.conf.json` no longer says `0.0.0`), the bundle is ad-hoc signed (`bundle.macOS.signingIdentity: "-"`), and the script installs the `.dmg` it made, checks it with `codesign --verify`, and opens a Space with it until the run takes the directory's lock. With `TAURI_SIGNING_PRIVATE_KEY` set it writes the signed `.app.tar.gz` and `latest.json`. `release.yml`'s `desktop` job runs it on `macos-latest` and attaches the `.dmg`, update bundle, signature and `latest.json` to the draft; a tag without the key is refused. Publishing a release runs `desktop-updates.yml`, which copies `latest.json` to the `desktop-updates` release named by `plugins.updater.endpoints`; `release/install.sh` now skips any release whose tag is not a version. The shell (`src/update.rs`) checks once at launch and offers the update in a dialog; an installed update opens on the next launch, so no running Aggregate is stopped. The updater's public key is the person's (minisign key ID `7877565670B080BF`); the private key and password are repository secrets the person set.

The box stays unticked until a build installed from one tag is watched updating to the next.


**2026-11-22, the bundle opens a Space in CI.** On PR #522 at `5960a54`, the `desktop` job on `macos-latest` built the bundle, the `.dmg`, the signed `.app.tar.gz` and its `.sig` (so the updater secrets are set), installed the `.app` from the `.dmg`, passed `codesign --verify --deep --strict`, and opened a Space with it until its run took the directory's lock. The first runs timed out because the smoke test ran the app from macOS's temporary directory under `/var`, a symlink to `/private/var`: Tauri refuses to find its resources, or check for an update, from an executable whose path holds a symlink. The smoke test now resolves that path first; an app in `/Applications` is not affected. The update itself is still unwatched.
