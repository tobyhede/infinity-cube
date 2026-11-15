#!/usr/bin/env python3
"""Every test citation in the requirements resolves.

Finds each citation of the form `path` › "title"[, "title" ...] in
docs/requirements/*.md and checks that the file exists and contains each title.
A path that starts with `test/` is at the repository root; any other is under
`packages/`. A title matches when its text appears in the file after allowing
for: curly or straight quotes and apostrophes, escaped quotes, `\\n` escapes,
whitespace runs, and template literals (a `${...}` or `%s`-style placeholder in
the source, or a `<...>` stand-in in the title, matches any text).

Run from the repository root:  python3 .scratch/requirements-rewrite/check-evidence.py
Exits non-zero and lists each citation that does not resolve.
"""
import glob
import os
import re
import sys

root = sys.argv[1] if len(sys.argv) > 1 else "."
os.chdir(root)

docs = [d for d in sorted(glob.glob("docs/requirements/*.md")) if not d.endswith(("README.md", "DECISIONS.md"))]
citation = re.compile(r'`([^`]+\.(?:tsx?|mjs|js))`\s*›\s*((?:(?:“[^”]+”|"(?:[^"\\]|\\.)+")(?:\s*(?:,|and)\s*)?)+)')
title_re = re.compile(r'“([^”]+)”|"((?:[^"\\]|\\.)+)"')


def normalise(text):
    text = text.replace("\\u2019", "'").replace("\\u2018", "'").replace("\\\\", "\\")
    text = text.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    text = text.replace("\\'", "'").replace('\\"', '"').replace("\\`", "`").replace("\\n", " ")
    return re.sub(r"\s+", " ", text)


placeholder = re.compile(r"\$\{[^}]*\}|%[sdifjoO#]|\$[a-zA-Z_]\w*")


def matches(title, source, source_pattern):
    t = normalise(title)
    if t in source:
        return True
    # A title may name a template literal's output; the source holds placeholders.
    if source_pattern is not None and source_pattern.search(t):
        return True
    # A title may itself stand a placeholder in with <...>.
    parts = [re.escape(p) for p in re.split(r"<[^>]+>|…|\.\.\.", t)]
    if len(parts) > 1 and re.search(".*?".join(parts), source):
        return True
    return False


def template_pattern(source):
    """A regex matching any test title in the source whose placeholders take any text."""
    titles = re.findall(r"(?:it|test|describe)(?:\.\w+)*(?:\([^)]*\))?\(\s*`([^`]*)`", source)
    alts = []
    for t in titles:
        if placeholder.search(t):
            alts.append("^" + ".+".join(re.escape(normalise(p)) for p in placeholder.split(t)) + "$")
    return re.compile("|".join(alts)) if alts else None


checked = 0
missing_files = []
missing_titles = []
cache = {}
for doc in docs:
    for number, line in enumerate(open(doc, encoding="utf8"), 1):
        for m in citation.finditer(line):
            cited = m.group(1)
            path = cited if cited.startswith("test/") else os.path.join("packages", cited)
            if not os.path.exists(path):
                missing_files.append((doc, number, path))
                continue
            if path not in cache:
                raw = open(path, encoding="utf8").read()
                cache[path] = (normalise(raw), template_pattern(raw))
            source, pattern = cache[path]
            for curly, straight in title_re.findall(m.group(2)):
                title = curly or straight
                checked += 1
                if not matches(title, source, pattern):
                    missing_titles.append((doc, number, path, title))

print(f"titles checked: {checked}; missing files: {len(missing_files)}; titles not found: {len(missing_titles)}")
for doc, number, path in missing_files:
    print(f"FILE {doc}:{number} {path}")
for doc, number, path, title in missing_titles:
    print(f"TITLE {doc}:{number} {path} › \"{title}\"")
sys.exit(1 if missing_files or missing_titles else 0)
