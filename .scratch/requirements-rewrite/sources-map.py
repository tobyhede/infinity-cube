#!/usr/bin/env python3
"""Build each requirement's `Sources:` clause from the trace files, and apply it.

Usage, from the repository root:

    python3 .scratch/requirements-rewrite/sources-map.py report   # print the map and the rules it cannot source
    python3 .scratch/requirements-rewrite/sources-map.py apply    # write the clauses into docs/requirements/*.md

How a rule's sources are found:

1. Every table row of `docs/requirements/trace/*.md` is read as (source cell, disposition).
2. A rule id (`MG-14`) counts as a destination of the row when it follows an arrow (`→`)
   in the disposition, up to the next sentence break. Ids named only in a "struck" or
   "dropped" clause are not destinations.
3. The row's ADRs are the four-digit numbers in its source cell. Only accepted ADRs are
   cited: superseded ADRs (`docs/adr/superseded/`), the rejected 0016 and the proposed
   ADRs (0107, 0138, 0141) are left out, because they do not bind.
4. A row whose source cell names no ADR is a guide row (the archived guide its section
   names), a ruling row (`DEC n`, `ruling ...`), or neither.
5. Rulings that changed what an accepted ADR decides were written as ADRs 0146 to 0152
   (`RULING_ADRS`); a rule they reach cites the ADR instead of the ruling. The rules those
   rulings rewrote get their ADRs from `OVERRIDES` as well.
6. The "Code only" sections list rules kept under drafting rule 5; a rule with no ADR,
   guide or ruling cites "code and tests (no ADR)".

The clause is placed immediately before the rule's first status marker (`**built**`,
`**built (untested)**`, `**not built**`, `**bug: code differs**`). Applying is idempotent:
an existing clause is replaced.
"""

from __future__ import annotations

import glob
import os
import re
import sys
from collections import defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
REQ = os.path.join(ROOT, "docs", "requirements")
ADR = os.path.join(ROOT, "docs", "adr")

DOCS = ["space-and-resources", "maps-and-graphs", "editing", "storage", "rendering", "ui", "navigation"]
RULE_ID = re.compile(r"\b(SR|MG|ED|ST|RD|UI|NV)-(\d+)\b")
STATUS = re.compile(r"\*\*(built \(untested\)|built|not built|bug: code differs)\*\*")

# Rulings in docs/requirements/DECISIONS.md that changed what an accepted ADR decides.
RULING_ADRS = {
    "1": "0146",
    "C1": "0146",
    "C2": "0146",
    "C3": "0147",
    "Navigation C2": "0148",
    "Rendering C1": "0149",
    "Space and Resources C1": "0150",
    "UI C3": "0151",
    "Storage S2": "0152",
}
# Rulings that are not sources of a rule: 8 replaced ADR 0115 and is itself ADR 0145.
IGNORED_RULINGS = {"8"}

# Rules a ruling rewrote, with the ADRs they restate (the ruling's ADR and the ADR it refines).
OVERRIDES = {
    "MG-45": {"0028", "0146"},
    "MG-46": {"0116", "0146"},
    "MG-47": {"0116", "0146"},
    "MG-84": {"0146"},
    "SR-46": {"0146"},
    "MG-61": {"0032", "0104", "0147"},
    "UI-101": {"0147"},
    "NV-13": {"0041", "0148"},
    "RD-5": {"0122", "0149"},
    "RD-61": {"0149"},
    "SR-26": {"0106", "0150"},
    "ED-72": {"0150"},
    "UI-99": {"0083", "0151"},
    "ST-36": {"0054", "0056", "0152"},
}

# Rules no trace row reaches, sourced by hand from the ADRs (checked 2026-11-15).
MANUAL_ADRS = {
    "SR-48": {"0068", "0112"},
    "MG-12": {"0040", "0091"},
    "MG-52": {"0040"},
    "ED-26": {"0042"},
    "ED-38": {"0123"},
    "ED-39": {"0112"},
    "ED-70": {"0042", "0126"},
    "ED-77": {"0076", "0099"},
    "ST-45": {"0030", "0117"},
    "ST-65": {"0080", "0117"},
    "ST-72": {"0124"},
    "ST-84": {"0080"},
    "NV-8": {"0024", "0146"},
    "NV-53": {"0069", "0111"},
    "MG-43": {"0028", "0146"},
    "MG-11": {"0116"},
    "MG-14": {"0116"},
    "MG-81": {"0116"},
    "UI-30": {"0040"},
}
MANUAL_RULINGS = {"MG-49": {"C6"}, "ST-65": {"3"}}
MANUAL_CODE_ONLY = {"SR-4", "SR-7", "MG-85", "ED-34", "ED-35", "RD-30"}
# Whole clauses where the general form does not fit.
MANUAL_TEXT = {
    "SR-5": "Sources: ADR 0010; the rejected ADR 0016 records why there is no second id.",
    "ED-36": "Sources: code and tests (no accepted ADR; the superseded ADR 0013 first stated it).",
}

GUIDE_NAMES = {
    "maps-and-graphs": "maps-and-graphs.md",
    "editing-and-persistence": "editing-and-persistence.md",
    "authoring-refusal-cascade": "authoring-refusal-cascade.md",
    "rendering": "rendering.md",
    "ui": "ui.md",
    "navigation": "navigation.md",
    "domain": "domain.md",
}


def adr_statuses() -> dict[str, str]:
    statuses: dict[str, str] = {}
    for path in glob.glob(os.path.join(ADR, "[0-9][0-9][0-9][0-9]-*.md")) + glob.glob(
        os.path.join(ADR, "superseded", "[0-9][0-9][0-9][0-9]-*.md")
    ):
        number = os.path.basename(path)[:4]
        with open(path, encoding="utf8") as handle:
            for line in handle:
                if line.startswith("Status:"):
                    statuses[number] = line.split(":", 1)[1].strip().split()[0]
                    break
    return statuses


RULING = re.compile(
    r"(?:\bDEC|\bruling|\bRuling)\s+"
    r"((?:Editing|Navigation|Rendering|Space and Resources|Storage|UI)\s+)?"
    r"(C\d+(?:\.\d+)?|S\d+|\d+)\b"
)


def rulings_in(text: str) -> set[str]:
    found = set()
    for match in RULING.finditer(text):
        prefix = (match.group(1) or "").strip()
        label = f"{prefix} {match.group(2)}".strip()
        if label not in IGNORED_RULINGS:
            found.add(label)
    return found


def segment_rulings(rule: str, segment: str) -> set[str]:
    """A ruling named in a disposition belongs to the rule it annotates.

    `→ MG-14 (ruling C4.2)` gives MG-14 the ruling. In a segment naming several
    rules, only a rule followed directly by a parenthesis naming the ruling takes it.
    """
    ids = RULE_ID.findall(segment)
    if len(ids) == 1:
        return rulings_in(segment)
    match = re.search(re.escape(rule) + r"\s*\(([^)]*)\)", segment)
    return rulings_in(match.group(1)) if match else set()


def guide_from_heading(line: str, current: str | None) -> str | None:
    match = re.search(r"agent-guides/([a-z-]+)\.md", line)
    if match:
        return GUIDE_NAMES.get(match.group(1), match.group(1) + ".md")
    if "AGENTS.md" in line and (line.startswith("**") or line.startswith("#")):
        return "AGENTS.md"
    return current


RANGE = re.compile(r"\b(SR|MG|ED|ST|RD|UI|NV)-(\d+)\s*(?:–|to)\s*(?:\1-)?(\d+)\b")


def expand_ranges(text: str, widest: int = 60) -> str:
    """`ED-41–ED-67` and `NV-43 to NV-45` become every id in the range."""

    def spell(match: re.Match) -> str:
        prefix, low, high = match.group(1), int(match.group(2)), int(match.group(3))
        if high < low or high - low > widest:
            # A wide range in a check-off row is a summary, not a destination:
            # it would give every rule in it every ADR in the row.
            return ""
        return ", ".join(f"{prefix}-{n}" for n in range(low, high + 1))

    return RANGE.sub(spell, text)


def destinations(disposition: str) -> list[tuple[str, str]]:
    """Each (rule id, the segment it was found in) that follows an arrow."""
    out = []
    if "→" not in disposition:
        text = expand_ranges(disposition, widest=7)
        # A received item's row names the rule it landed on without an arrow:
        # `| R12, R27: ... | UI-30 |`. Its first sentence is read, unless it
        # says the item went somewhere else.
        segment = re.split(r"\. |;", text, maxsplit=1)[0]
        if not re.search(r"\b(dropped|struck|removed|sent|not here)\b", segment, re.I):
            for match in RULE_ID.finditer(segment):
                out.append((match.group(0), segment))
        return out
    for part in disposition.split("→")[1:]:
        segment = re.split(r"\. |;|\|", part, maxsplit=1)[0]
        if re.search(r"\bheld\b", segment):
            # "held in MG-50–MG-67": the rules already hold it; not a source row.
            continue
        segment = expand_ranges(segment)
        for match in RULE_ID.finditer(segment):
            out.append((match.group(0), segment))
    return out


def build_map():
    statuses = adr_statuses()
    adrs: dict[str, set[str]] = defaultdict(set)
    guides: dict[str, set[str]] = defaultdict(set)
    rulings: dict[str, set[str]] = defaultdict(set)
    code_only: set[str] = set()

    for path in sorted(glob.glob(os.path.join(REQ, "trace", "*.md"))):
        doc = os.path.basename(path)[:-3]
        default_guide = {
            "space-and-resources": "editing-and-persistence.md",
            "editing": "editing-and-persistence.md",
            "maps-and-graphs": "maps-and-graphs.md",
            "storage": "editing-and-persistence.md",
            "rendering": "rendering.md",
            "ui": "ui.md",
            "navigation": "navigation.md",
        }[doc]
        section = ""
        guide: str | None = None
        with open(path, encoding="utf8") as handle:
            lines = handle.read().split("\n")
        for line in lines:
            if line.startswith("## "):
                section = line
                guide = guide_from_heading(line, None)
                continue
            if line.startswith("### ") or line.startswith("**"):
                guide = guide_from_heading(line, guide)
            in_code_only = "code only" in section.lower()
            if in_code_only and not line.startswith("|"):
                line = expand_ranges(line)
                head = line.split(":", 1)[0] if line.startswith("- ") else line
                # A bullet names its rules before its colon; a paragraph lists them.
                for match in RULE_ID.finditer(head if line.startswith("- ") else line):
                    code_only.add(match.group(0))
                continue
            if not line.startswith("|") or line.startswith("|---") or line.startswith("| Source") or line.startswith("| Item"):
                continue
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if len(cells) < 2:
                continue
            source, disposition = cells[0], " | ".join(cells[1:])
            row_adrs = {n for n, s in re.findall(r"(?<![0-9A-Za-z:])(\d{4})(s?)(?![0-9])", source) if not s}
            row_adrs = {n for n in row_adrs if statuses.get(n) == "accepted"}
            row_rulings = rulings_in(source)
            is_guide = False
            if not row_adrs and not row_rulings:
                section_lower = section.lower()
                if (
                    "guide" in section_lower
                    or "old contract" in section_lower
                    or re.match(r"(R|A|EP|G|M|CAS|ARC|E&P)\s?§?\d", source)
                    or source.startswith(("G§", "E&P", "CAS", "ARC", "EP ", "Old contract", "Commands"))
                ):
                    is_guide = True
            found = destinations(disposition)
            for rule, segment in found:
                adrs[rule] |= row_adrs
                rulings[rule] |= row_rulings | segment_rulings(rule, segment)
                if is_guide:
                    if source.startswith("Commands") or guide == "AGENTS.md":
                        guides[rule].add("AGENTS.md")
                    elif source.startswith(("EP ", "E&P")):
                        guides[rule].add("editing-and-persistence.md")
                    elif source.startswith(("CAS", "ARC")):
                        guides[rule].add("authoring-refusal-cascade.md")
                    elif re.match(r"(R|A)\d", source):
                        guides[rule].add("maps-and-graphs.md")
                    else:
                        guides[rule].add(guide or default_guide)

    for table in (OVERRIDES, MANUAL_ADRS):
        for rule, extra in table.items():
            adrs[rule] |= extra
    for rule, extra in MANUAL_RULINGS.items():
        rulings[rule] |= extra
    code_only |= MANUAL_CODE_ONLY
    # Rulings that are ADRs now.
    for rule, labels in rulings.items():
        for label in list(labels):
            if label in RULING_ADRS:
                adrs[rule].add(RULING_ADRS[label])
                labels.discard(label)
    return adrs, guides, rulings, code_only


def clause(rule, adrs, guides, rulings, code_only) -> str | None:
    if rule in MANUAL_TEXT:
        return MANUAL_TEXT[rule]
    cited = sorted(adrs.get(rule, ()))
    parts = []
    if cited:
        parts.append(", ".join(f"ADR {n}" for n in cited))
    labels = sorted(rulings.get(rule, ()), key=lambda s: (len(s), s))
    if labels:
        word = "ruling" if len(labels) == 1 else "rulings"
        parts.append(f"`DECISIONS.md` {word} " + ", ".join(labels))
    if not cited:
        names = sorted(guides.get(rule, ()))
        if names:
            rendered = [n if n == "AGENTS.md" else f"archived guide `{n}`" for n in names]
            parts.append(", ".join(rendered) + " (no ADR)")
        elif not labels:
            if rule in code_only:
                return "Sources: code and tests (no ADR)."
            return None
        elif labels:
            parts[-1] += " (no ADR)"
    return "Sources: " + "; ".join(parts) + "."


def rule_blocks(lines):
    """Yield (rule id, first line index, last line index) for each rule entry."""
    starts = []
    for i, line in enumerate(lines):
        if line.startswith("## Bugs"):
            # The Bugs section restates rules as code changes; it carries no sources.
            break
        match = re.match(r"^- \*\*((?:SR|MG|ED|ST|RD|UI|NV)-\d+)\*\* ", line)
        if match:
            starts.append((match.group(1), i))
    for k, (rule, i) in enumerate(starts):
        j = i + 1
        while j < len(lines):
            line = lines[j]
            if line.startswith("- **") or line.startswith("#") or line.startswith("| "):
                break
            if line and not line.startswith(" ") and not line.startswith("\t"):
                break
            j += 1
        # Trailing blank lines are not part of the rule.
        while j - 1 > i and lines[j - 1].strip() == "":
            j -= 1
        yield rule, i, j - 1


EXISTING = re.compile(r"Sources: [^*]*?\. (?=\*\*)")


def apply(write: bool):
    adrs, guides, rulings, code_only = build_map()
    missing = []
    for doc in DOCS:
        path = os.path.join(REQ, doc + ".md")
        with open(path, encoding="utf8") as handle:
            lines = handle.read().split("\n")
        for rule, first, last in rule_blocks(lines):
            text = lines[first]
            if re.match(r"^- \*\*[A-Z]{2}-\d+\*\* (removed|Removed)", text):
                continue
            wanted = clause(rule, adrs, guides, rulings, code_only)
            if wanted is None:
                missing.append(f"{doc}: {rule}")
                continue
            for i in range(first, last + 1):
                line = EXISTING.sub("", lines[i])
                match = STATUS.search(line)
                if match:
                    lines[i] = line[: match.start()] + wanted + " " + line[match.start():]
                    break
            else:
                missing.append(f"{doc}: {rule} (no status marker)")
        if write:
            with open(path, "w", encoding="utf8") as handle:
                handle.write("\n".join(lines))
    return adrs, guides, rulings, code_only, missing


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "report"
    adrs, guides, rulings, code_only, missing = apply(write=(mode == "apply"))
    if mode == "report":
        for rule in sorted(set(adrs) | set(guides) | set(rulings), key=lambda r: (r[:2], int(r[3:]))):
            print(rule, clause(rule, adrs, guides, rulings, code_only))
    print(f"\n{len(missing)} rules without a source:", file=sys.stderr)
    for item in missing:
        print("  " + item, file=sys.stderr)


if __name__ == "__main__":
    main()
