# A preview build is a normal GitHub release, and the desktop updater reads the latest one

Status: accepted
Date: 2026-11-23
Related: 0155, 0166

ADR 0155 gives the desktop application Tauri's updater, with its own keys, and rust-host issue 06 publishes each build to GitHub Releases with the updater's static JSON (`latest.json`). Where an installed application looks for that file was not decided. GitHub answers `releases/latest` with the newest published release that is not marked a pre-release, so while every preview build was a pre-release that address could never name one.

## The decision

- **A preview build is published as a normal GitHub release, not a pre-release.** It is still a preview build (0166): its version and its release notes say so, and it makes no compatibility promise. GitHub's pre-release flag is not how a preview says it is one.
- **The release workflow creates each release as a draft a person publishes, marked as the latest release.** A draft is never `latest`, so nothing is offered until a person publishes it.
- **An installed desktop application reads `https://github.com/<repository>/releases/latest/download/latest.json`**, the `latest.json` attached to the newest published release, and offers the build it names when that build is newer than itself. No other release or workflow holds the file.

## Why

- **It is the conventional Tauri and GitHub setup.** Tauri's updater reads a static JSON at a fixed address, and GitHub serves the newest release's assets at `releases/latest/download/`. Nothing bespoke has to be kept working beside the release.
- **Publishing is the one act that offers a build**, to a person installing by hand and to an installed application alike.

## Rejected

- **Keep previews as pre-releases and copy `latest.json` to a standing release on each publish.** It works, but it is a second release and a second workflow that exist only to undo GitHub's pre-release rule, and it was built before it was decided.
- **No updater until previews end.** Issue 06 asks for an update from one tag to the next, and 0155 already chose Tauri's updater.

## Consequences

- `release.yml` drops `--prerelease` and passes `--latest`; `desktop-updates.yml` and the `desktop-updates` release are removed; `plugins.updater.endpoints` in `tauri.conf.json` names the address above.
- A person publishing a preview build leaves it marked as the latest release. A build published as a pre-release, or not as the latest, is offered to no installed application.
- Storage ST-129 and ST-130 restate this.
