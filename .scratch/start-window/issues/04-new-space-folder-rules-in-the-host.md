# 04 — New Space's folder rules and Title in the host

**Status:** ready-for-agent

**Blocked by:** nothing.

**What to build:** The parts of New Space (ST-131) that need no window, in Rust, so 02 only wires them to the form.

- `init_directory` (`crates/host/src/init.rs`) takes the Title to write as the Meta Space's `title`. The CLI's `init`, and `infinity-cube init`, keep writing `New space`, held by `conformance/init/`.
- A pure function in the desktop shell answers, for a location and a name, the folder New Space would write or why not: refused for a name that is not a single folder name on the platform (empty, `.` or `..`, holding `/` or `\`; on Windows `<>:"|?*`, a reserved name such as `CON`, a trailing dot or space), or for a folder that exists and holds anything but dot-entries.
- A function answers the default name for a location: `Untitled Space`, or the first free `Untitled Space 2`, `Untitled Space 3`, ….
- The listing these need goes through a seam a test can fake; the decisions stay pure.

- [ ] `init_directory` writes the Title it is given; `conformance/init/` still passes for the CLI's `New space`.
- [ ] A case for each refusal above, and for an accepted name, in the shell's tests; the Windows-only refusals are tested on every platform as data, whatever the build target.
- [ ] A case for `Untitled Space` free, taken, and `Untitled Space 2` also taken.
- [ ] `cargo fmt`, `clippy -D warnings` and `cargo nextest run -p host -p infinity-cube-desktop` pass, `-j 2`.

## Comments
