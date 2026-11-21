# Init conformance case

What `init` writes to an empty directory when its ids are counted up from one: `00000000-0000-4000-8000-` and the count as twelve hex digits, minted in the order the new Space needs them (the Space, its Resource, its Map and that Map's Graph). Storage ST-11 makes Default Content one generator, and the TypeScript `cube init` and the Rust `infinity-cube init` each have one, so this case holds the two to the same bytes.

- `expected/` is the directory `init` writes, compared byte for byte, every file and no other.
- `test/unit/init-conformance.test.ts` runs `initAggregate` (`src/run/run.ts`) against it, and `crates/host/tests/init.rs` runs `init_directory`.

A change to the new Space changes this directory and both generators in one change. `conformance/**` is `-text` in `.gitattributes` and ignored by Prettier, as the intake corpus is.
