#!/usr/bin/env python3
"""Every ADR has a disposition row.

Lists every ADR number in docs/adr/ and docs/adr/superseded/ and checks that
each one is named in at least one disposition row: a table row ("| ...") or a
list item ("- ...") of docs/requirements/trace/*.md, or any line of
docs/requirements/conflicts/*.md or docs/requirements/DECISIONS.md.

Run from the repository root:  python3 .scratch/requirements-rewrite/check-dispositions.py
Exits non-zero and names each ADR that has no row. Two ADR files sharing a
number are reported as a warning: a row names a number, not a file, so one row
counts for both, and the collision is for the ADR process to settle.
"""
import glob
import os
import re
import sys

root = sys.argv[1] if len(sys.argv) > 1 else "."
os.chdir(root)

adrs = {}
files = {}
for path in sorted(glob.glob("docs/adr/[0-9]*.md") + glob.glob("docs/adr/superseded/[0-9]*.md")):
    number = os.path.basename(path)[:4]
    adrs[number] = path
    files.setdefault(number, []).append(path)

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
paths = [p for ps in files.values() for p in ps]
print(f"ADRs: {len(paths)} files, {len(adrs)} numbers ({sum('superseded' in p for p in paths)} superseded); without a disposition row: {len(missing)}")
for n, ps in files.items():
    if len(ps) > 1:
        print(f"WARNING {n} is the number of {len(ps)} ADRs: {', '.join(ps)}")
for n in missing:
    print(f"MISSING {n} {adrs[n]}")
sys.exit(1 if missing else 0)
