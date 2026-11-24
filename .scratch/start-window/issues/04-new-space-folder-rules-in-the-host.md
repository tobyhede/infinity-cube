# 04 — New Space's folder rules and Title in the host

**Status:** done

**Blocked by:** nothing.

**What to build:** The parts of New Space (ST-131) that need no window, in Rust, so 02 only wires them to the form.

- `init_directory` (`crates/host/src/init.rs`) takes the Title to write as the Meta Space's `title`. The CLI's `init`, and `infinity-cube init`, keep writing `New space`, held by `conformance/init/`.
- A pure function in the desktop shell answers, for a location and a name, the folder New Space would write or why not: refused for a name that is not a single folder name on the platform (empty, `.` or `..`, holding `/` or `\`; on Windows `<>:"|?*`, a reserved name such as `CON`, a trailing dot or space), or for a folder that exists and holds anything but dot-entries.
- A function answers the default name for a location: `Untitled Space`, or the first free `Untitled Space 2`, `Untitled Space 3`, ….
- The listing these need goes through a seam a test can fake; the decisions stay pure.

- [x] `init_directory` writes the Title it is given; `conformance/init/` still passes for the CLI's `New space`.
- [x] A case for each refusal above, and for an accepted name, in the shell's tests; the Windows-only refusals are tested on every platform as data, whatever the build target.
- [x] A case for `Untitled Space` free, taken, and `Untitled Space 2` also taken.
- [x] `cargo fmt`, `clippy -D warnings` and `cargo nextest run -p host -p infinity-cube-desktop` pass, `-j 2`. (The `rust` CI job, which runs nextest over the workspace, passed on PR #527 at `da700d54`.)

## Comments

- 2026-11-24: landed `init_directory(fs, directory, title, ids)`, with `host::NEW_SPACE_TITLE` (`New space`) passed by the CLI's `init` and the shell's `create_space`; `crates/host/tests/init.rs` › `given_a_title::titles_the_meta_space_with_it_as_written` (a Title with `"` and `\` read back from `space.json`), and the conformance case byte for byte as before (`given_a_missing_directory::writes_the_files_of_the_conformance_case_byte_for_byte`, `test/unit/init-conformance.test.ts`). `packages/desktop/src-tauri/src/new_space_folder.rs`: `new_space_folder(listing, location, name, platform)`, `default_name(listing, location)`, the `Listing` seam and `FolderListing` over `std::fs`; its tests (`new_space_folder/tests.rs`) are `given_a_name_that_is_free` (accepted, and a folder holding only dot-entries), `given_a_name_that_is_not_one_folder_name`, `given_a_character_windows_forbids`, `given_a_name_windows_reserves`, `given_a_name_ending_in_a_dot_or_a_space` (each Windows rule refused for `Platform::Windows` and accepted for `Platform::Unix`, on every build), `given_a_folder_that_holds_something`, `given_a_folder_that_cannot_be_listed`, `the_folders_on_disk` and `the_default_name` (free, dot-entries only, taken, and `Untitled Space 2` taken too). `cargo fmt --all --check` and `cargo clippy -p host -p infinity-cube-desktop -p infinity-cube --all-targets --locked -j 2 -- -D warnings` pass; the tests passed under `cargo test -p host -p infinity-cube-desktop -p infinity-cube --locked -j 2`, not nextest, which was not installed where this was built, so the last box stays open until CI's `rust` job runs it. Nothing calls the new functions yet (02 does), so the module is `expect(dead_code)` outside tests.
- 2026-11-24 (review): `default_name` lists the location first and refuses one it cannot list (a file included), then passes over a candidate that is a file, as one holding something: `the_default_name::is_untitled_space_2_when_a_file_holds_the_name_untitled_space` and `refuses_a_location_that_is_a_file_naming_it`, over real files in a temp directory.
