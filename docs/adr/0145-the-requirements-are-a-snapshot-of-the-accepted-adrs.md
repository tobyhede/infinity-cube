# The requirements are a snapshot of the accepted ADRs

Status: accepted
Date: 2026-11-15
Supersedes: 0115
Related: 0116

ADR 0115 adopted current contracts in `docs/agents/`: one topic's accepted design in current words, kept beside the ADRs, with build status left to delivery issues. The requirements rewrite replaced those contracts and the overlapping product guides with seven requirements documents in `docs/requirements/` (Space and Resources, Maps and Graphs, Editing, Storage and hosts, Rendering, UI, Navigation), which also keep build status beside each rule. A first draft of that rewrite archived every ADR as history and made the requirements the binding record. The maintainer chose otherwise on 15 November 2026: the ADRs stay binding, and the requirements restate them.

## The decision

- **ADRs are binding and append-only.** A new decision, or a change to what an accepted ADR decides, is a new ADR. An accepted ADR's decision text is never rewritten, demoted or archived; the only edits it receives are status lines (`Refined by:`, `Superseded by:`) and the move of a superseded ADR into `docs/adr/superseded/`.
- **The seven requirements documents are a snapshot.** Each restates, in current words and present tense, what the accepted ADRs decide for its topic, together with treatment the maintainer settled where no ADR spoke and behaviour the code implements and a test asserts that no source contradicts. Each rule names its source ADRs, its reason and its evidence, and carries its build status beside it: **built**, **built (untested)**, **not built** or **bug: code differs**. Presentation alone (colour values, sizes, spacing, timing, as `docs/requirements/DECISIONS.md` drafting rule 6 sets out) is not restated, even where an ADR decides it: the rule that owns the structure names that ADR among its sources, and the ADR still binds.
- **Each document carries a snapshot marker** near its top: the commit it was checked against, the date, and the highest ADR it incorporates. ADRs accepted after the marker bind where they differ, until the document is updated.
- **A requirement that disagrees with an accepted ADR is a defect in the requirement.** The requirement is corrected; the ADR is not.
- **Accepting an ADR updates the owning requirements document and its marker in the same change.** A wording fix or a faithful restatement needs no ADR and does not advance a marker.
- **A maintainer ruling that changes what an accepted ADR decides is recorded as a new ADR.** A ruling that only settles which of two accepted sources holds, or records detail no ADR states, is recorded in the owning requirement with its date and in `docs/requirements/DECISIONS.md`.
- **Reading order.** `AGENTS.md` routes a task to its owning document. `CONTEXT.md` defines the terms. The owning requirements document states the rules. Then read any ADR newer than its snapshot marker, and older ADRs for the full argument, the rejected alternatives and the history.
- **`CONTEXT.md` stays the glossary.** Requirements use its terms and do not redefine them; a term coined in a requirement goes into `CONTEXT.md` in the same change.

## Why

- **The ADRs are the reasoning a reader reaches from a code citation.** About fifteen hundred `ADR NNNN` citations in code, tests and schemas point at them. Demoting the ADRs would leave every one of those pointing at text that no longer binds, while the requirements say the same thing with no argument behind it.
- **A snapshot ages visibly.** A marker says which decisions a document has absorbed, so a reader can tell when an ADR has overtaken it, rather than trusting a document that silently fell behind.
- **The requirements keep what 0115 promised and delivered.** One current account per topic, in current words, with one owner per rule, remains the ordinary entry point. What changes is where it lives, that status sits beside each rule, and that its authority is explicitly derived.

## Consequences

- `docs/agents/` keeps engineering guides (workflow, tooling, anti-slop, HTTP) and pointer pages; the product guides 0115 called contracts are archived under `docs/adr/archive/agent-guides/`.
- The rulings made during the rewrite that changed accepted decisions are ADRs 0146 to 0154, each refining the ADR it changes.
- `docs/adr/README.md` points each topic at its owning requirements document.
- The cost is the same as 0115's: a second current-state account beside each topic's ADRs that must be kept accurate. The same-change rule and the snapshot marker bound it; review and fresh-reader checks remain the controls for a restatement that misstates its source while passing every mechanical check.

## Rejected

- **Making the requirements the binding record and archiving the ADRs** (the first draft of the rewrite). It breaks the link from code citations to the reasoning, and a requirement edit would then change a decision without the admission rules an ADR goes through.
- **Keeping 0115's contracts in `docs/agents/`.** The rewrite already replaced them, and one product account per topic is the point; two would disagree.
- **Leaving build status to delivery issues, as 0115 did.** The requirements record what is built beside each rule, which is where a reader deciding whether code matches needs it.
