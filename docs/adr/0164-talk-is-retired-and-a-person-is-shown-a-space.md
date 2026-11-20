# "Talk" is retired, and what a person is shown is a Space

Status: accepted
Date: 2026-11-20
Related: 0088, 0129, 0130, 0131, 0132, 0155, 0163

"Talk" was never a term in `CONTEXT.md`. It entered as prose in ADRs 0129 to 0132 and became structural with the desktop application (ADR 0155), whose requirements and source named its windows, origins and registry for it. By then it stood for three different things: the Aggregate directory a host runs, the Graph being presented, and whatever a person had opened. InfinityCube is not a tool for talks, and none of the three is one.

## The decision

- **"Talk" names nothing.** It is not written in source, tests, fixtures, requirements, guides, skills or anything a person is shown.
- **What a person is shown is a Space.** Every control, dialog, message, guide and skill says Space. Aggregate is an internal name: it appears in source, tests, requirements and `aggregate.json`, never in what a person reads on screen.
- **A window the desktop application opens on a folder is a Space window.**
- **Where source and requirements mean the directory, its run, its origin or its lock, they say Aggregate**, as ADR 0088 defines it. Two Aggregates open at once share no origin; two Spaces of one Aggregate do.
- **What is presented is a presented Graph, and one run through it is a presentation**, as ADR 0129 and Navigation NV-57 already use the word.
- **A fixture's directory, repository or Title that was named for a talk is named `space`,** and a presented Graph's fixture Title `demo`.

## Why

- **The word assumed one use.** A Space holds designs, notes and maps of a system as readily as slides.
- **One word had three meanings,** and a reader could not tell which a sentence meant. "Two talks share no `localStorage`" is true of two Aggregates and false of two Spaces.
- **A person never meets an Aggregate.** They open a folder and see a Space; the Meta Space and the rest are reached from it.

## Rejected

- **Define "talk" in `CONTEXT.md` as an opened Aggregate directory.** It would keep the word the product is not about and leave the presenting sense unnamed.
- **Say Space everywhere, in source too.** The shell's key, origin and lock belong to the directory, and a `SpaceKey` would read as a Space's id.
- **Say Aggregate to a person.** It is a name for how Spaces are stored together, which a person has no need to learn.

## Consequences

- The sweep is `.scratch/talk-to-space/rename-talk.mjs`, tracked so a branch in flight can replay it. Its header lists what it does not produce.
- The desktop shell's command is `open_aggregate` and its permission `allow-open-aggregate`; a Space window's label begins `space-`.
- The Notes window's view names the presented Graph's Title `presentedGraph`.
- Accepted ADRs keep their wording, their titles and their file names, 0131, 0132 and 0163 among them. The index in `docs/adr/README.md` is written in current words, so its summaries of 0129 and 0132 say presented Graph and Aggregate while their links keep the file names. Tickets under `.scratch/` and plans under `docs/superpowers/` are history and keep theirs.
- `test/unit/current-domain-vocabulary.test.ts` holds the word out of authored source. It does not read Markdown, so prose is reviewed.
