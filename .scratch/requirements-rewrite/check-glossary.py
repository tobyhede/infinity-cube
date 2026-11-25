#!/usr/bin/env python3
"""Every term a requirements doc defines or points to has an entry in CONTEXT.md.

Inputs: docs/requirements/*.md and CONTEXT.md, under the root given as the
first argument (default: the current directory). Standard library only.

What is extracted from a requirements doc:
  - pointers: the comma-separated list on a line that opens with a bold
    "Terms" lead-in and says "used here:" (for example "**Terms** defined in
    [`CONTEXT.md`](../../CONTEXT.md) and used here: Lane, Recede."). Each
    listed name must be a glossary entry;
  - working definitions: each bold span in the paragraph under any other bold
    "Terms" lead-in (for example "**Terms not yet in `CONTEXT.md`**"), running
    to the next blank line. A term defined in a requirements doc and absent
    from the glossary is a parallel definition;
  - inline definitions: a line, not a bullet, that opens with a bold span
    followed by a colon (`**Term**: ...`), other than the doc's own labels
    (Purpose, Snapshot, Status, Why). Bullets in Bugs and Exceptions sections
    lead with bold summaries of rules, not terms, so bullets outside a Terms
    paragraph are not read.

What counts as a glossary entry: a line of CONTEXT.md that is only a bold term
and a colon (`**Term**:`), the glossary's own form. A mention elsewhere in
CONTEXT.md is not an entry. Matching ignores case.

Output: one line per term not in the glossary, `path:line: Term (pointer |
definition)`, then a summary line. Exits 1 when a term is missing, or when
nothing at all was extracted (a zero count from matching nothing is not a
pass); 0 otherwise.

Run from the repository root:
    python3 .scratch/requirements-rewrite/check-glossary.py
    python3 .scratch/requirements-rewrite/check-glossary.py --self-test
"""
import glob
import os
import re
import sys
import tempfile

BOLD = re.compile(r"\*\*([^*]+?)\*\*")
GLOSSARY_ENTRY = re.compile(r"^\*\*([^*]+?)\*\*:\s*$")
INLINE_DEF = re.compile(r"^\*\*([^*`]+?)\*\*:")
LABELS = {"purpose", "snapshot", "status", "why"}


def glossary_terms(root):
    terms = set()
    with open(os.path.join(root, "CONTEXT.md"), encoding="utf-8") as f:
        for line in f:
            m = GLOSSARY_ENTRY.match(line.strip())
            if m:
                terms.add(m.group(1).strip().lower())
    return terms


def pointer_names(listed, glossary):
    """Split a Terms pointer list: comma-separated, ending at the first sentence end.

    " and " separates only the final two items, and not where the final item
    is itself a glossary entry (such as "Maps and Graphs").
    """
    listed = re.split(r"\.(?:\s|$)", listed.strip(), maxsplit=1)[0]
    names = [n.strip() for n in listed.split(",") if n.strip()]
    if names and names[-1].lower() not in glossary and " and " in names[-1]:
        head, _, tail = names[-1].rpartition(" and ")
        names[-1:] = [head.strip(), tail.strip()]
    return [n for n in names if n]


def extract(root):
    """Answer (path, line, term, how) for every term the requirements name."""
    glossary = glossary_terms(root)
    found = []
    for path in sorted(glob.glob(os.path.join(root, "docs/requirements/*.md"))):
        rel = os.path.relpath(path, root)
        in_definitions = False
        with open(path, encoding="utf-8") as f:
            for number, line in enumerate(f, 1):
                text = line.rstrip("\n")
                if not text.strip():
                    in_definitions = False
                    continue
                lead = BOLD.match(text)
                if lead and lead.group(1).startswith("Terms"):
                    if "used here:" in text:
                        for name in pointer_names(text.split("used here:", 1)[1], glossary):
                            found.append((rel, number, name, "pointer"))
                    else:
                        in_definitions = True
                    continue
                if in_definitions:
                    for m in BOLD.finditer(text):
                        found.append((rel, number, m.group(1).strip(), "definition"))
                    continue
                m = INLINE_DEF.match(text)
                if m and m.group(1).strip().lower() not in LABELS:
                    found.append((rel, number, m.group(1).strip(), "definition"))
    return found


def run(root):
    glossary = glossary_terms(root)
    found = extract(root)
    missing = [entry for entry in found if entry[2].lower() not in glossary]
    for p, n, t, how in missing:
        print(f"{p}:{n}: {t} ({how})")
    pointers = sum(1 for e in found if e[3] == "pointer")
    definitions = len(found) - pointers
    print(
        f"terms extracted: {len(found)} ({pointers} pointers, {definitions} working or inline definitions); "
        f"glossary entries: {len(glossary)}; missing from CONTEXT.md: {len(missing)}"
    )
    if not found:
        print("nothing extracted: the extraction matched no terms", file=sys.stderr)
        return 1
    return 1 if missing else 0


def self_test():
    context = (
        "# G\n\n**Space**:\nA world.\n\n**Resource plugin**:\nDraws a kind.\n\n"
        "**Maps and Graphs**:\nA term containing and.\n\nA **Mention** is not an entry.\n"
    )
    passing = (
        "# R\n\n**Purpose:** a doc.\n\n**Terms** defined in [`CONTEXT.md`](../../CONTEXT.md) and used here: Space, Resource plugin, Maps and Graphs. Code calls them x.\n\n"
        "## Bugs\n\n- **A refusal changes nothing**: a rule summary, not a term.\n- **AB-1** A rule.\n"
    )
    failing = passing + (
        "\n**Terms not yet in `CONTEXT.md`** (working definitions):\n- **Mention**: defined only here.\n\n"
        "**Rect**: an inline definition.\n\n**Terms** defined in CONTEXT.md and used here: Space and Lane.\n"
    )
    ok = True
    for name, doc, expect, expect_missing in (
        ("passing", passing, 0, set()),
        ("failing", failing, 1, {"Mention", "Rect", "Lane"}),
    ):
        with tempfile.TemporaryDirectory() as root:
            os.makedirs(os.path.join(root, "docs/requirements"))
            with open(os.path.join(root, "CONTEXT.md"), "w", encoding="utf-8") as f:
                f.write(context)
            with open(os.path.join(root, "docs/requirements/x.md"), "w", encoding="utf-8") as f:
                f.write(doc)
            print(f"-- fixture {name}")
            code = run(root)
            glossary = glossary_terms(root)
            missing = {t for (_, _, t, _) in extract(root) if t.lower() not in glossary}
            ok = ok and code == expect and missing == expect_missing
    with tempfile.TemporaryDirectory() as root:
        os.makedirs(os.path.join(root, "docs/requirements"))
        with open(os.path.join(root, "CONTEXT.md"), "w", encoding="utf-8") as f:
            f.write(context)
        with open(os.path.join(root, "docs/requirements/x.md"), "w", encoding="utf-8") as f:
            f.write("# R\n\nNo terms at all.\n")
        print("-- fixture empty (must fail: nothing extracted)")
        ok = ok and run(root) == 1
    print("self-test:", "pass" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    if "--self-test" in sys.argv[1:]:
        sys.exit(self_test())
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    sys.exit(run(args[0] if args else "."))
