# InfinityCube preview build

This is a **preview build** of InfinityCube: one `infinity-cube` binary that runs an Aggregate directory on your machine and opens it in your browser. It makes no compatibility promise. A directory this build writes may not open in a later preview build, so keep your directory in git and read it with the build that wrote it. `infinity-cube --version` names this build and the commit it was made from.

## Install

On macOS or Linux, the install script picks this platform's archive from the newest published preview build, checks it against the release's `SHA256SUMS`, and puts `infinity-cube` in `~/.local/bin`, with no `sudo`:

```sh
curl -fsSL https://raw.githubusercontent.com/tobyhede/infinity-cube/main/release/install.sh | sh
```

Set `INFINITY_CUBE_VERSION` (say `v0.1.0-preview.1`) on `sh` to install a particular build, and `INFINITY_CUBE_INSTALL_DIR` to install somewhere else. If the folder is not on your `PATH`, the script prints the line to add. Running it again replaces the binary, which is how you upgrade; a later build may refuse a directory an earlier one wrote, so read a directory with the build that wrote it. To uninstall, delete the binary: `rm ~/.local/bin/infinity-cube`.

There are builds for Linux on x86_64 and arm64 and macOS on Apple silicon and Intel. There is no Windows build yet.

## Start

1. If you did not use the install script, put `infinity-cube` somewhere on your `PATH`, or run it from where you unpacked it as `./infinity-cube`.
2. Make a new Space in an empty folder: `infinity-cube init my-space`
3. Run it: `infinity-cube run my-space`

Your browser opens on the Space. Edits are written back to `my-space` about a second after you stop editing. Stop the run with Ctrl-C, which writes any Edit not yet on disk before it exits.

`infinity-cube check my-space` tells you whether a directory will run, and why not, without serving or writing anything. `infinity-cube help` lists every command.

## macOS

This build is not signed, so macOS quarantines it when a browser downloads it and refuses to open it. The install script downloads with `curl`, which sets no quarantine, so it needs no such step. If you downloaded the archive in a browser, remove the quarantine once, from the folder you unpacked it in:

```sh
xattr -d com.apple.quarantine infinity-cube
```

## Checking the download

The install script checks the archive for you. If you downloaded it yourself, the release lists a `SHA256SUMS` file. From the folder holding the archive:

```sh
shasum -a 256 -c SHA256SUMS --ignore-missing
```

## Licence

InfinityCube is licensed under either of the Apache License, Version 2.0 (`LICENSE-APACHE`) or the MIT license (`LICENSE-MIT`), at your option.
