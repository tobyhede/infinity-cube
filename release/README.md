# InfinityCube preview build

This is a **preview build** of InfinityCube: one `infinity-cube` binary that runs an Aggregate directory on your machine and opens it in your browser. It makes no compatibility promise. A directory this build writes may not open in a later preview build, so keep your directory in git and read it with the build that wrote it. `infinity-cube --version` names this build and the commit it was made from.

## Start

1. Put `infinity-cube` somewhere on your `PATH`, or run it from where you unpacked it as `./infinity-cube`.
2. Make a new Space in an empty folder: `infinity-cube init my-space`
3. Run it: `infinity-cube run my-space`

Your browser opens on the Space. Edits are written back to `my-space` about a second after you stop editing. Stop the run with Ctrl-C, which writes any Edit not yet on disk before it exits.

`infinity-cube check my-space` tells you whether a directory will run, and why not, without serving or writing anything. `infinity-cube help` lists every command.

## macOS

This build is not signed, so macOS quarantines it when it is downloaded and refuses to open it. Remove the quarantine once, from the folder you unpacked it in:

```sh
xattr -d com.apple.quarantine infinity-cube
```

## Checking the download

The release lists a `SHA256SUMS` file. From the folder holding the archive:

```sh
shasum -a 256 -c SHA256SUMS --ignore-missing
```

## Licence

InfinityCube is licensed under either of the Apache License, Version 2.0 (`LICENSE-APACHE`) or the MIT license (`LICENSE-MIT`), at your option.
