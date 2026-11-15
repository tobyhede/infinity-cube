#!/usr/bin/env python3
"""Every ADR has a disposition row.

Lists every ADR number in docs/adr/ and docs/adr/superseded/ and checks that
each one is named in at least one disposition row: a table row ("| ...") or a
list item ("- ...") of docs/requirements/trace/*.md, or any line of
docs/requirements/conflicts/*.md or docs/requirements/DECISIONS.md.

Run from the repository root:  python3 .scratch/requirements-rewrite/check-dispositions.py
Exits non-zero and names each ADR that has no row.
"""
import glob
import os
import re
import sys

root = sys.argv[1] if len(sys.argv) > 1 else "."
os.chdir(root)

adrs = {}
for path in sorted(glob.glob("docs/adr/[0-9]*.md") + glob.glob("docs/adr/superseded/[0-9]*.md")):
    number = os.path.basename(path)[:4]
    adrs[number] = path

named = set()
number_re = re.compile(r"(?<![\d.:/-])(0\d{3})(?![\d])")
for path in glob.glob("docs/requirements/trace/*.md"):
    for line in open(path, encoding="utf8"):
        if line.lstrip().startswith(("|", "-")):
            named.update(number_re.findall(line))
for path in glob.glob("docs/requirements/conflicts/*.md") + ["docs/requirements/DECISIONS.md"]:
    for line in open(path, encoding="utf8"):
        named.update(number_re.findall(line))

missing = [n for n in adrs if n not in named]
print(f"ADRs: {len(adrs)} ({sum('superseded' in p for p in adrs.values())} superseded); without a disposition row: {len(missing)}")
for n in missing:
    print(f"MISSING {n} {adrs[n]}")
sys.exit(1 if missing else 0)
