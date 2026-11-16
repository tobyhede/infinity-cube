# Each runtime has one intake, held to one conformance suite

Status: proposed
Related: 0010, 0034, 0142, 0155

ADR 0010 makes `loadSpace` the only intake: it parses the shape, validates references and builds the index, so a Space is consistent by construction, and nothing downstream takes a value that has only passed the schema (Storage ST-22). ADR 0155 moves the server side to Rust, while the browser application and Mounting stay TypeScript and keep running the TypeScript intake. A Rust host must refuse a bad directory and a bad commit just as the TypeScript host does, so the server needs an intake of its own. The maintainer decided on 16 November 2026 that Rust reimplements intake.

## The decision

- **Each runtime has exactly one intake.** TypeScript keeps `loadSpace` and the Zod schemas of `core` and each plugin's domain half. Rust has one `intake` crate: pure, with no IO and no async, that parses the space document and every Resource, validates references, applies each listed plugin's content and Map content rules, and indexes the result. Within each runtime ADR 0010 holds unchanged: nothing downstream of intake takes a value that has not passed it.
- **One conformance suite holds the two to each other.** A corpus of Aggregate directories and commits, each with its expected answer, is run against both intakes, and the HTTP-level tests are run against both hosts. For a refusal, the two must agree on **the kind of error and where it is** (the file, the id and the field), not on the wording of the message. The JSON Schemas in `docs/schema/`, already held to the TypeScript intake, are the starting point for the corpus.
- **A kind the Rust intake does not know is kept, not refused**, as the TypeScript intake keeps it and the default plugin draws it (ADR 0142).
- **A plugin's domain rules are written in both languages.** Adding or changing a plugin's content rules changes its TypeScript domain half and its Rust module in the same change, with corpus cases for both.

## Why

- **The server cannot trust the window.** Only a server-side intake catches a bad file on disk before the window loads it, and refuses a malformed commit from any client.
- **Agreement must be checked, not hoped for.** Two implementations drift. Agreeing only on accept or refuse lets them drift unnoticed in what they refuse and why; agreeing on exact text would freeze every TypeScript wording change into Rust. Kind and location is what an author or an agent acts on.

## Rejected

- **Embedding a JavaScript engine in the Rust host to run the TypeScript intake** (for example `deno_core` or Boa). One intake, but a JavaScript runtime inside the native binary, a second build of the domain packages for it, and the Node-free host ADR 0155 wants only in name.
- **A Rust host that stores without understanding**, with the browser running intake before every commit. The simplest host, but a bad file is found only when a window loads it, and the server trusts whatever a client sends.
- **Generating the Rust intake from the JSON Schemas alone.** The schemas refuse only what intake refuses; reference resolution, uniqueness, Edge endpoints and each plugin's Map content are beyond them (`docs/schema/README.md`).

## Consequences

- ADR 0010's "the only intake" becomes "the only intake in its runtime". Accepting this ADR refines 0010, and Storage ST-22 is restated to match.
- "Adding a plugin is one line in each half" (`packages/plugins`) now has a Rust counterpart: the plugin's Rust module and one entry in the Rust plugin list.
- The conformance corpus is written against the TypeScript intake and host first, before any Rust exists, so it describes today's behaviour rather than a port's.
