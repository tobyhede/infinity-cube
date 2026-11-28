#!/usr/bin/env python3
"""Markdown links and anchors resolve.

Checks every relative Markdown link, and its #anchor when it has one, in the
tracked Markdown under docs/, .agents/skills/ and plugins/, and in AGENTS.md,
CONTEXT.md, README.md and CLAUDE.md. ADR bodies (docs/adr/NNNN-*.md and
docs/adr/superseded/) are skipped: they are append-only history and are not
rewritten to repair a link. The archived guides under docs/adr/archive/ are
byte-identical copies of the guides they replaced, moved two levels down, so
their relative links are reported for information and do not fail the run.
Fenced code blocks and inline code are ignored.
Anchors follow GitHub's slug rule (lower case, punctuation dropped, spaces to
hyphens, duplicates suffixed -1, -2 ...).

Run from the repository root:  python3 .scratch/requirements-rewrite/check-links.py
Exits non-zero and lists each broken link.
"""
import argparse
import os
import re
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("root", nargs="?", default=".")
parser.add_argument("--agent-docs", action="store_true", help="Check only AGENTS.md and docs/agents/")
args = parser.parse_args()
os.chdir(args.root)

listed = subprocess.check_output(["git", "ls-files", "--cached", "--others", "--exclude-standard", "*.md"]).decode().split("\n")
adr_body = re.compile(r"^docs/adr/(superseded/)?\d{4}-")
files = sorted(
    f
    for f in set(listed)
    if f
    and os.path.exists(f)
    and (f.startswith(("docs/", ".agents/skills/", "plugins/")) or f in ("AGENTS.md", "CONTEXT.md", "README.md", "CLAUDE.md"))
    and not adr_body.match(f)
)

if args.agent_docs:
    files = [f for f in files if f == "AGENTS.md" or f.startswith("docs/agents/")]

anchor_cache = {}


def slug(heading):
    heading = re.sub(r"`([^`]*)`", r"\1", heading.strip())
    heading = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", heading)
    heading = heading.lower()
    heading = re.sub(r"[^\w\- ]", "", heading)
    return heading.replace(" ", "-")


def anchors(path):
    if path not in anchor_cache:
        text = re.sub(r"```.*?```", "", open(path, encoding="utf8").read(), flags=re.S)
        seen = {}
        out = set()
        for m in re.finditer(r"^#{1,6}\s+(.*?)\s*#*\s*$", text, re.M):
            s = slug(m.group(1))
            n = seen.get(s, 0)
            out.add(s if n == 0 else f"{s}-{n}")
            seen[s] = n + 1
        out.update(re.findall(r'<a\s+(?:name|id)="([^"]+)"', text))
        anchor_cache[path] = out
    return anchor_cache[path]


broken = []
checked = 0
for f in files:
    text = open(f, encoding="utf8").read()
    text = re.sub(r"```.*?```", "", text, flags=re.S)
    text = re.sub(r"`[^`\n]*`", "", text)
    for m in re.finditer(r"\]\(<?([^)\s>]+)>?(?:\s+\"[^\"]*\")?\)", text):
        url = m.group(1)
        if re.match(r"^[a-z][a-z0-9+.-]*:", url):
            continue
        checked += 1
        target_path, _, anchor = url.partition("#")
        target = os.path.normpath(os.path.join(os.path.dirname(f), target_path)) if target_path else f
        if not os.path.exists(target):
            broken.append((f, url, "missing file"))
            continue
        if anchor and target.endswith(".md") and anchor.lower() not in anchors(target):
            broken.append((f, url, "missing anchor"))

archived = [b for b in broken if b[0].startswith("docs/adr/archive/")]
live = [b for b in broken if not b[0].startswith("docs/adr/archive/")]
print(f"files: {len(files)}; links checked: {checked}; broken live links: {len(live)}; broken in archived guides (information): {len(archived)}")
for f, url, why in live:
    print(f"BROKEN {f} -> {url} ({why})")
for f, url, why in archived:
    print(f"archived {f} -> {url} ({why})")
sys.exit(1 if live else 0)
