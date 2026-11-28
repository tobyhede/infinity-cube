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


def prose(path):
    """Keep block boundaries while removing fenced examples of either spelling."""
    lines = []
    fence = None
    with open(path, encoding="utf8") as source:
        for line in source:
            marker = re.match(r"^ {0,3}(`{3,}|~{3,})(.*)$", line)
            if fence is not None:
                if marker and marker[1].startswith(fence) and not marker[2].strip():
                    fence = None
                lines.append("\n")
            elif marker and (marker[1][0] == "~" or "`" not in marker[2]):
                fence = marker[1]
                lines.append("\n")
            else:
                lines.append(line)
    return "".join(lines)


def anchors(path):
    if path not in anchor_cache:
        text = prose(path)
        headings = re.compile(
            r"^ {0,3}#{1,6}[ \t]+(?P<atx>[^\n]+?)[ \t]*#*[ \t]*$"
            r"|^ {0,3}(?P<setext>[^\s][^\n]*)\n {0,3}(?:=+|-+)[ \t]*$",
            re.M,
        )
        out = set()
        for match in headings.finditer(text):
            base = slug(match["atx"] or match["setext"])
            name = base
            suffix = 0
            while name in out:
                suffix += 1
                name = f"{base}-{suffix}"
            out.add(name)
        out.update(re.findall(r'<a\s+(?:name|id)="([^"]+)"', text))
        anchor_cache[path] = out
    return anchor_cache[path]


def destinations(text):
    text = re.sub(r"`[^`\n]*`", "", text)
    destination = r"<([^<>\n]*)>|([^\s)<>]+)"
    references = {}

    def label(value):
        return " ".join(value.split()).casefold()

    def remember(match):
        references.setdefault(label(match[1]), match[2] if match[2] is not None else match[3])
        return ""

    text = re.sub(r"^ {0,3}\[([^\]\n]+)\]:[ \t]*(?:" + destination + r").*$",
                  remember, text, flags=re.M)
    inline = re.compile(r'\]\(\s*(?:' + destination + r')(?:\s+"[^"]*")?\s*\)')
    for match in inline.finditer(text):
        yield match[1] if match[1] is not None else match[2]

    for match in re.finditer(r"\[([^\]\n]*)\](?:\[([^\]\n]*)\])?(?!\()", text):
        target = references.get(label(match[2] or match[1]))
        if target is not None:
            yield target


broken = []
checked = 0
for f in files:
    for url in destinations(prose(f)):
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
