# A preview build is not a release

Status: accepted
Date: 2026-11-20
Related: 0054, 0152, 0155, 0156

InfinityCube will publish downloadable builds before it makes any compatibility promise. ADR 0152 rests the rolling-forward format on InfinityCube being unreleased and promising nothing for a copy outside the repository, and a downloaded binary is such a copy. Each published build is therefore a **preview build**: it does not end the unreleased state, and the rules of 0054 and 0152 hold for it unchanged.

## The decision

- **A preview build is a published, downloadable build of InfinityCube that makes no compatibility promise.** Publishing one does not make InfinityCube released.
- **An Aggregate directory is read with the preview build that wrote it**, or recovered from git, exactly as 0152 says of any copy outside the repository. A later preview build may refuse a directory an earlier one wrote, and adds no versioned reader to accept it.
- **A preview build says it is one** where a person meets it: on its download page and in the version it reports.

## Why

- **The format still changes.** A promise to read forward would need the versioned reader 0054 rules out, before the format has settled.
- **People can try it now.** Waiting for a release to publish anything keeps the product with the people who can build it from a clone.

## Rejected

- **Treat the first download as a release** and start reading old directories forward. It brings the versioned reader in before anything needs it.
- **Publish nothing until release.** It keeps the people who would say what to change from trying it.

## Consequences

- Storage ST-36 names preview builds beside the repository.
- Ending the preview, so that a build is a release, is a new ADR that refines 0152 and this one.
