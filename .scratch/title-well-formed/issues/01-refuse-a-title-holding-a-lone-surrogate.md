# Refuse a title holding a lone surrogate where it is written

Status: ready-for-agent

**What to build:** every title an author writes in the browser (a Resource's Title, a Space title, a Map or Graph title, an Edge Title) that holds a lone UTF-16 surrogate is refused by the Edit that writes it, before anything is committed, the way an empty Title is refused (SR-13): the field stays open with the draft and focus, and the reason is shown beside it (UI-50). The rule is Space and Resources SR-68.

**Why:** since ADR 0160 both hosts answer a commit body holding an escaped lone surrogate 400 `invalid-request`. The browser reads that as a permanent rejection (ST-101, ED-46), and every later Edit commits the newest working Space, which still holds the surrogate, so the author sees each Edit refused with nothing pointing at the Title. Ruled by the maintainer on 21 November 2026 (option (b) of Editing C4, `docs/requirements/conflicts/editing.md`).

**Acceptance:**
- A title holding a lone high or low surrogate is refused by Space Authoring with one stable refusal code, worded for the author, and nothing is committed; an escaped pair that spells one character is accepted.
- Each title field keeps its draft and focus with the reason beside it (UI-50), for Resource, Space, Map, Graph and Edge titles.
- A test per title kind, and a regression test that a session holding no such title is unaffected.
- SR-68's status moves to **built** with that evidence, in the same change.

**Notes:** `String.prototype.isWellFormed` answers the check. Whether intake should also refuse such a title arriving in a file is already answered: `parseJsonText` (ADR 0160) refuses the file. If implementing this would change what ADR 0042 or 0160 decides, write an ADR first.
