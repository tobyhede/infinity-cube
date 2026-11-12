# Resource file schema

The JSON Schema (draft 2020-12) for a Resource file: the `resources/<id>.json` that [ADR 0128](../../adr/0128-every-resource-kind-is-a-module-and-a-resource-file-is-json.md) makes every Resource. It is the specification of that format.

- `envelope.schema.json` is the core's half, `{ id, title, kind, content }`. It names no kind: `kind` is any well-formed kind id, and `content` any object.
- `resource.schema.json` is the envelope composed with the built-in kinds, as a build registers them. Its `builtInKinds` is that registration, one entry per kind pairing its id with its content schema, so adding a kind is one entry there and one schema under `kinds/`. Any other well-formed kind id, bare or vendor (`vnd.<owner>.<name>`, ADR 0120), is a kind whose plugin a build reading the file may not have (ADR 0142); this schema accepts its `content` as any object, which such a build carries whole and never reads, and which the kind's own plugin checks where it is present.
- `kinds/*.schema.json` is one schema per built-in kind, the file half of that kind's module.
- `locator.schema.json` is the shared content locator: `{ url }`, naming content by URL. Markdown takes only `/assets/<hash>`, and Image an `https:` or `http:` URL or `/assets/<hash>` (ADR 0142). There is no path form: a Resource keeps no file beside its Resource file, and every file it uses is an asset.
- `examples/` holds one valid Resource file per kind.

What a schema cannot say is left to intake: a Title is normalized before it is stored (ADR 0083), an external Image URL must parse as a WHATWG URL with an `http:` or `https:` scheme, a Target, Space, Map or Graph must resolve, and content a present plugin rejects is refused. The schema refuses only what intake refuses; intake refuses more.

The schemas assume Ajv's draft 2020-12 validator in strict mode with no formats added: they use no `format` keyword, and the `$data` reference that would compare a path with an id is not part of the standard.
