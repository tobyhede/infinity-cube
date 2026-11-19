# JSON text holds no lone surrogate in either runtime

Status: accepted
Date: 2026-11-18
Related: 0010, 0034, 0155, 0156

ADR 0156 gives each runtime its own intake and holds the two to one conformance suite, by the kind of a refusal and where it is. In two places the TypeScript runtime and the Rust runtime answer one input differently because their JSON parsers do. `JSON.parse` reads a string that escapes a lone UTF-16 surrogate, such as `"\ud800"`, into a JavaScript string that is not well formed, which the TypeScript host then stores; the Rust intake's reader refuses it, because a Rust string cannot hold one. And the Rust reader refuses arrays and objects nested deeper than `intake::json::MAX_DEPTH`, 512 levels, so a hostile file cannot exhaust its stack, where `JSON.parse` reads on until its engine's own limit. The maintainer decided on 18 November 2026 to unify the first and keep the second.

## The decision

- **JSON text that escapes a lone UTF-16 surrogate is not JSON, in both runtimes.** A string anywhere in the text, a key or a value at any depth, holding a high surrogate not followed by a low one, or a low surrogate not preceded by a high one, is refused exactly as text that is not JSON is refused. An escaped pair that spells one character is read as that character.
- **At both doors.** Import refuses such an `aggregate.json`, `space.json` or Resource file as `invalid-json`, located at the file, as for any file that is not JSON. A commit body holding one is answered 400 `invalid-request` with the detail "Malformed JSON in request body", the answer to a body that is not JSON. TypeScript reads every such text through one `parseJsonText` in `core`, the lowest package all of its readers may import.
- **The suites hold both runtimes to it.** The intake corpus has directory cases for a value and for a key (`invalid-json-lone-surrogate`, `invalid-json-lone-surrogate-key`), and the HTTP wire cases send a commit body with the escape. A corpus commit case cannot carry one: its runners read `case.json` as JSON, and the Rust runner would refuse the case file itself.
- **The nesting limit stays a known difference.** The Rust intake and host refuse JSON nested deeper than 512 levels, a file as `invalid-json` and a commit body as malformed JSON; the TypeScript runtime reads what `JSON.parse` reads. The difference is written down in Storage and pinned by a test in each runtime, and no conformance case expects either answer.

## Why

- **One suite, one answer.** Under ADR 0156 a difference between the runtimes is a defect unless it is written down and kept. The lone surrogate had only one answer a Rust reader could give, so the TypeScript reader moves to it rather than the suite carrying an exception.
- **An ill-formed string cannot round-trip.** Every place InfinityCube keeps a string is UTF-8: an Aggregate directory's files, Export's bytes, and the stores. A lone surrogate has no UTF-8 encoding, so a string holding one is changed or refused wherever it is written next, and the value read back is not the value committed. Refusing it where it arrives is the only place the author is told which file or request held it.
- **The depth limit costs no author anything.** InfinityCube's own formats nest a handful of levels; only a Resource of a kind no plugin draws carries content unread, and nothing an author writes by hand reaches 512 levels. The limit exists to keep a hostile file from exhausting the Rust host's stack, which `JSON.parse` would not protect it from.

## Rejected

- **Keeping the lone-surrogate difference.** The Rust host would refuse a directory or a commit the TypeScript host accepts, and the conformance suite would carry an exception in each runtime's runner.
- **Replacing a lone surrogate with U+FFFD in both runtimes.** It accepts text whose value is then not the value written, silently, and the Rust reader would need a lossy path that nothing else wants.
- **Unifying the depth limit.** Imposing 512 levels on `JSON.parse` means a second pass over every value TypeScript reads, for content no author writes; raising the Rust limit to what an engine allows means trusting the stack the limit protects.

## Consequences

- Storage ST-22 and ST-77 restate the refusal for TypeScript, and ST-118 and ST-119 for the Rust intake and host, where the depth limit is the one difference kept.
- `parseJsonText` refuses with a `SyntaxError`, so every caller that already refuses text `JSON.parse` refuses needs no new branch.
- The HTTP application reads a commit body's text before Hono's json validator does, and the validator parses it a second time; a commit body is at most 1 MiB.
- No test asserts what PostgreSQL's `jsonb` does with a lone surrogate, so no requirement says it.
