#!/usr/bin/env python3
"""Lock a requirements snapshot to the ADRs it restates, and check it mechanically.

The lock file records every ADR the requirements were reconciled against, by
content hash. It replaces hand-maintained markers, checked revisions and
freshness policies: the script computes what is stale, and CI enforces that the
lock is consistent.

Commands (run from anywhere inside the repository, or pass --root):

  init     Create the lock file with the ADR and requirements globs.
             --superseded GLOB      where retired ADRs are kept, when they are
                                    moved rather than deleted
  stamp    Re-hash every ADR and rewrite the lock. Run after reconciling.
             --na PATH REASON       record an ADR that no requirement needs to cite
             --supersede OLD NEW    record a deleted ADR fully replaced by NEW
             --leave-pending PATH   keep PATH's previous entry, or leave it out,
                                    so it stays pending; prints what it records
  supersede OLD NEW [OLD NEW ...]
           Record only that each locked ADR OLD, now deleted or moved out of
           the ADR glob, is fully replaced by NEW. Every other entry is left as
           it is, so pending ADRs stay pending. For the pull request that
           supersedes an ADR, between refreshes.
  check    Verify the lock against the tree. Report ADRs added or changed since
           the last stamp ("pending"); these bind where they differ from the
           requirements.
             --fail-stale           exit 2 when anything is pending
             --github               also print GitHub Actions annotations

Lock format (JSON, version 1):

  {
    "version": 1,
    "script_version": "0.6.0",
    "adr_glob": "docs/adr/[0-9]*.md",
    "requirements_glob": "docs/requirements/*.md",
    "superseded_glob": "optional, e.g. docs/adr/superseded/[0-9]*.md",
    "adrs": {"docs/adr/0042-x.md": {"sha256": "...", "na": "optional reason"}},
    "superseded": {"docs/adr/0007-y.md": {"by": "docs/adr/0042-x.md", "commit": "<sha>"}}
  }

Rules check enforces (exit 1 on any):

  - the lock exists, parses, and has a known version and both globs;
  - the lock was not written by a newer copy of this script (stamp
    refuses too); a lock with no script_version is accepted;
  - every locked ADR still exists, unless it is recorded as superseded;
  - every ADR in the tree that is in the lock is cited by a requirements
    document or has an "na" reason;
  - a superseded ADR is absent from the tree and names a replacement that is
    in the tree and not itself superseded;
  - every link from a requirements document to an ADR (a locked or
    glob-matching path) resolves;
  - every requirements document that cites an ADR links to the lock file.

A requirements document that still cites a superseded ADR (a recorded one, or
any file matching superseded_glob) is pending, not an error: the next refresh cites the replacement, and stamp refuses until it does.

A pending ADR whose Status line is not "accepted" (a proposed one, say) is
reported as binding nothing.

Links are inline `[text](path)` links and reference definitions
`[label]: path`; links inside code spans and fenced blocks are ignored.

Hashes ignore line-ending differences. Requires Python 3.9+ and, for
`stamp --supersede` and `supersede`, git. No third-party packages.
"""

from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

LOCK_VERSION = 1
SCRIPT_VERSION = "0.6.0"
DEFAULT_LOCK = "docs/requirements/snapshot.lock.json"
DEFAULT_ADR_GLOB = "docs/adr/[0-9]*.md"
DEFAULT_REQUIREMENTS_GLOB = "docs/requirements/*.md"
LINK_RE = re.compile(r"\]\(\s*<?([^)\s>]+)>?(?:\s+\"[^\"]*\")?\s*\)")
REFERENCE_RE = re.compile(r"^ {0,3}\[[^\]]+\]:\s*<?([^\s>]+)>?", re.M)
FENCE_RE = re.compile(r"^ {0,3}(`{3,}|~{3,}).*?^ {0,3}\1[`~]*[ \t]*$", re.M | re.S)
CODE_SPAN_RE = re.compile(r"(`+)(?!`).+?(?<!`)\1(?!`)", re.S)
STATUS_RE = re.compile(r"^\s*(?:\*\*)?Status(?:\*\*)?:\s*(?:\*\*)?\s*([A-Za-z]+)", re.M | re.I)


class LockError(Exception):
    pass


@dataclass
class Report:
    errors: list[str] = field(default_factory=list)
    added: list[str] = field(default_factory=list)
    changed: dict[str, list[str]] = field(default_factory=dict)
    stale: list[tuple[str, str]] = field(default_factory=list)
    recorded: list[str] = field(default_factory=list)

    @property
    def pending(self) -> bool:
        return bool(self.added or self.changed or self.stale)


def repo_root(explicit: str | None) -> Path:
    if explicit:
        return Path(explicit).resolve()
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            check=True, capture_output=True, text=True,
        ).stdout.strip()
        return Path(out)
    except (OSError, subprocess.CalledProcessError):
        return Path.cwd()


def digest(path: Path) -> str:
    data = path.read_bytes().replace(b"\r\n", b"\n")
    return hashlib.sha256(data).hexdigest()


def rel(root: Path, path: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def parse_version(value: str) -> tuple[int, ...]:
    """Compare release numbers only: 0.6.0-rc.1 and 0.6.0 are the same release."""
    try:
        return tuple(int(part) for part in re.split(r"[-+]", value, maxsplit=1)[0].split("."))
    except (AttributeError, TypeError, ValueError) as exc:
        raise LockError(f"unrecognised script_version {value!r}") from exc


def load_lock(path: Path) -> dict:
    if not path.is_file():
        raise LockError(f"{path.name}: lock file not found; run `init` first")
    try:
        lock = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise LockError(f"{path.name}: invalid JSON: {exc}") from exc
    if not isinstance(lock, dict) or lock.get("version") != LOCK_VERSION:
        raise LockError(f"{path.name}: expected \"version\": {LOCK_VERSION}")
    written_by = lock.get("script_version")
    if written_by is not None and parse_version(written_by) > parse_version(SCRIPT_VERSION):
        raise LockError(
            f"{path.name}: written by adr_snapshot.py {written_by}; "
            f"update this copy (it is {SCRIPT_VERSION}) from the adr-snapshot skill"
        )
    for key in ("adr_glob", "requirements_glob"):
        if not isinstance(lock.get(key), str) or not lock[key]:
            raise LockError(f"{path.name}: missing \"{key}\"")
    if "superseded_glob" in lock and (not isinstance(lock["superseded_glob"], str) or not lock["superseded_glob"]):
        raise LockError(f"{path.name}: \"superseded_glob\" must be a non-empty string")
    for key in ("adrs", "superseded"):
        lock.setdefault(key, {})
        if not isinstance(lock[key], dict):
            raise LockError(f"{path.name}: \"{key}\" must be an object")
    for name, entry in lock["adrs"].items():
        if not isinstance(entry, dict) or not isinstance(entry.get("sha256"), str):
            raise LockError(f"{path.name}: adrs[{name}] needs a sha256")
    for name, entry in lock["superseded"].items():
        if not isinstance(entry, dict) or not entry.get("by") or not entry.get("commit"):
            raise LockError(f"{path.name}: superseded[{name}] needs \"by\" and \"commit\"")
    return lock


def write_lock(path: Path, lock: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    ordered = {
        "version": LOCK_VERSION,
        "script_version": SCRIPT_VERSION,
        "adr_glob": lock["adr_glob"],
        "requirements_glob": lock["requirements_glob"],
    }
    if lock.get("superseded_glob"):
        ordered["superseded_glob"] = lock["superseded_glob"]
    ordered["adrs"] = dict(sorted(lock["adrs"].items()))
    ordered["superseded"] = dict(sorted(lock["superseded"].items()))
    path.write_text(json.dumps(ordered, indent=2) + "\n", encoding="utf-8")


def tree_adrs(root: Path, lock: dict) -> dict[str, str]:
    return {rel(root, p): digest(p) for p in sorted(root.glob(lock["adr_glob"])) if p.is_file()}


def resolve_link(root: Path, doc: Path, target: str) -> str | None:
    if re.match(r"^[a-z][a-z0-9+.-]*:", target, re.I) or target.startswith("#"):
        return None
    target = target.split("#", 1)[0]
    if not target:
        return None
    base = root if target.startswith("/") else doc.parent
    resolved = Path(os.path.normpath(base / target.lstrip("/")))
    try:
        return rel(root, resolved)
    except ValueError:
        return None


def matches_glob(path: str, glob: str) -> bool:
    patterns = {glob, glob.replace("**/", "")}
    return any(fnmatch.fnmatchcase(path, pattern) for pattern in patterns)


def links(text: str) -> list[str]:
    """Inline link targets and reference definitions, outside fenced blocks and code spans."""
    text = CODE_SPAN_RE.sub("", FENCE_RE.sub("", text))
    return LINK_RE.findall(text) + REFERENCE_RE.findall(text)


def binds(root: Path, path: str) -> bool:
    """An ADR binds unless its Status line names something other than accepted."""
    match = STATUS_RE.search((root / path).read_text(encoding="utf-8", errors="replace"))
    return match is None or match.group(1).lower() == "accepted"


def scan_requirements(root: Path, lock: dict, lock_path: Path) -> tuple[dict[str, list[str]], list[str], list[tuple[str, str]]]:
    """Return {adr path: [citing docs]}, structural errors, and citations of superseded ADRs."""
    superseded = lock["superseded"]
    lock_rel = rel(root, lock_path)
    citations: dict[str, list[str]] = {}
    errors: list[str] = []
    stale: list[str] = []
    for doc in sorted(root.glob(lock["requirements_glob"])):
        if not doc.is_file():
            continue
        doc_rel = rel(root, doc)
        cites_adr = links_lock = False
        for target in links(doc.read_text(encoding="utf-8")):
            path = resolve_link(root, doc, target)
            if path is None:
                continue
            if path == lock_rel:
                links_lock = True
            elif lock.get("superseded_glob") and matches_glob(path, lock["superseded_glob"]):
                cites_adr = True
                if not (root / path).is_file():
                    errors.append(f"{doc_rel}: links to missing ADR {path}")
                    continue
                entry = (doc_rel, f"{doc_rel}: cites superseded ADR {path}; cite its replacement instead")
                if entry not in stale:
                    stale.append(entry)
            elif path in lock["adrs"] or path in superseded or matches_glob(path, lock["adr_glob"]):
                cites_adr = True
                if path in superseded and not (root / path).is_file():
                    entry = (doc_rel, f"{doc_rel}: cites superseded ADR {path}; cite {superseded[path]['by']} instead")
                    if entry not in stale:
                        stale.append(entry)
                    continue
                if not (root / path).is_file():
                    errors.append(f"{doc_rel}: links to missing ADR {path}")
                    continue
                citations.setdefault(path, [])
                if doc_rel not in citations[path]:
                    citations[path].append(doc_rel)
        if cites_adr and not links_lock:
            errors.append(f"{doc_rel}: cites ADRs but does not link the lock file {lock_rel}")
    return citations, errors, stale


def check(root: Path, lock_path: Path) -> Report:
    report = Report()
    try:
        lock = load_lock(lock_path)
    except LockError as exc:
        report.errors.append(str(exc))
        return report
    tree = tree_adrs(root, lock)
    citations, doc_errors, stale = scan_requirements(root, lock, lock_path)
    report.errors.extend(doc_errors)
    report.stale.extend(stale)
    locked, superseded = lock["adrs"], lock["superseded"]

    for path, entry in locked.items():
        if path in superseded:
            report.errors.append(f"{path}: listed as both locked and superseded")
        elif path not in tree:
            report.errors.append(f"{path}: locked ADR is missing; only superseded ADRs may be deleted (supersede OLD NEW)")
        elif not citations.get(path) and not entry.get("na"):
            report.errors.append(f"{path}: cited by no requirements document and has no \"na\" reason")

    for path, entry in superseded.items():
        if path in tree:
            report.errors.append(f"{path}: recorded as superseded but still present; delete it")
        by = entry["by"]
        if by in superseded or by not in tree:
            report.errors.append(f"{path}: superseded by {by}, which is not a live ADR")

    for path, sha in tree.items():
        if path in superseded:
            continue
        if path not in locked:
            report.added.append(path)
        elif locked[path]["sha256"] != sha:
            report.changed[path] = citations.get(path, [])
    return report


def git_commit_with(root: Path, path: str) -> str:
    """Name a commit whose tree holds path: HEAD, or else the parent of the commit that removed it."""
    def git(*args: str) -> str:
        return subprocess.run(
            ["git", "-C", str(root), *args], check=True, capture_output=True, text=True,
        ).stdout.strip()

    def holds(sha: str) -> bool:
        try:
            git("cat-file", "-e", f"{sha}:{path}")
            return True
        except subprocess.CalledProcessError:
            return False

    try:
        head = git("rev-parse", "HEAD")
        if holds(head):
            return head
        removed = git("log", "-1", "--format=%H", "HEAD", "--", path)
        if removed:
            parent = git("rev-parse", f"{removed}^")
            if holds(parent):
                return parent
    except (OSError, subprocess.CalledProcessError):
        pass
    raise LockError(f"{path}: not found in git history; commit it before deleting so history keeps it")


def record_supersessions(root: Path, lock: dict, tree: dict[str, str], pairs: list[list[str]]) -> None:
    """Record every pair, repointing chains, then require each replacement to be live."""
    for old_path, by in pairs:
        if old_path in tree:
            raise LockError(f"{old_path}: delete the file before recording it as superseded")
        lock["superseded"][old_path] = {"by": by, "commit": git_commit_with(root, old_path)}
        for entry in lock["superseded"].values():
            if entry["by"] == old_path:
                entry["by"] = by
        lock["adrs"].pop(old_path, None)
    for old_path, _ in pairs:
        by = lock["superseded"][old_path]["by"]
        if by not in tree or by in lock["superseded"]:
            raise LockError(f"{old_path}: superseded by {by}, which is not a live ADR")


def stamp(
    root: Path, lock_path: Path, na: list[list[str]], supersede: list[list[str]],
    leave_pending: list[str] | None = None,
) -> Report:
    lock = load_lock(lock_path)
    tree = tree_adrs(root, lock)
    old = dict(lock["adrs"])
    keep = set(leave_pending or [])
    for path in keep:
        if path not in tree:
            raise LockError(f"{path}: --leave-pending names an ADR that is not in the tree")
    record_supersessions(root, lock, tree, supersede)
    reasons = {path: entry["na"] for path, entry in old.items() if entry.get("na")}
    for path, reason in na:
        if path not in tree:
            raise LockError(f"{path}: --na names an ADR that is not in the tree")
        reasons[path] = reason.strip()
    missing = [p for p in old if p not in tree and p not in lock["superseded"]]
    if missing:
        raise LockError("ADRs deleted without being recorded as superseded (--supersede OLD NEW): " + ", ".join(missing))
    new = {}
    recorded = []
    for path, sha in tree.items():
        if path in lock["superseded"]:
            continue
        if path in keep:
            if path in old:
                new[path] = old[path]
            continue
        if old.get(path, {}).get("sha256") != sha:
            recorded.append(path)
        new[path] = {"sha256": sha}
        if reasons.get(path):
            new[path]["na"] = reasons[path]
    lock["adrs"] = new
    report = write_checked(root, lock_path, lock, stale_is_error=True)
    if not report.errors:
        report.recorded = recorded
    return report


def write_checked(root: Path, lock_path: Path, lock: dict, stale_is_error: bool) -> Report:
    """Write the lock, check it, and put the previous lock back on any error or exception."""
    previous = lock_path.read_text(encoding="utf-8")
    try:
        write_lock(lock_path, lock)
        report = check(root, lock_path)
        if stale_is_error:
            report.errors.extend(line for _, line in report.stale)
            report.stale = []
    except BaseException:
        lock_path.write_text(previous, encoding="utf-8")
        raise
    if report.errors:
        lock_path.write_text(previous, encoding="utf-8")
    return report


def supersede_only(root: Path, lock_path: Path, pairs: list[list[str]]) -> Report:
    lock = load_lock(lock_path)
    for old_path, _ in pairs:
        if old_path not in lock["adrs"]:
            raise LockError(f"{old_path}: not in the lock, so there is nothing to record")
    record_supersessions(root, lock, tree_adrs(root, lock), pairs)
    return write_checked(root, lock_path, lock, stale_is_error=False)


def init(root: Path, lock_path: Path, adr_glob: str, requirements_glob: str, superseded_glob: str | None = None) -> None:
    if lock_path.exists():
        raise LockError(f"{rel(root, lock_path)} already exists")
    write_lock(lock_path, {
        "adr_glob": adr_glob, "requirements_glob": requirements_glob,
        "superseded_glob": superseded_glob, "adrs": {}, "superseded": {},
    })


def print_report(report: Report, github: bool, root: Path | None = None) -> None:
    def note(path: str) -> str:
        if root is not None and (root / path).is_file() and not binds(root, path):
            return "; its Status is not accepted, so it binds nothing"
        return "; it binds where it differs from the requirements"

    for path in report.recorded:
        print(f"recorded: {path}")
    for error in report.errors:
        print(f"error: {error}")
        if github:
            print(f"::error::{error}")
    for path in report.added:
        line = f"pending: {path} is new since the last stamp{note(path)}"
        print(line)
        if github:
            print(f"::warning file={path}::{line}")
    for path, docs in report.changed.items():
        cited = ", ".join(docs) if docs else "no requirements document"
        line = f"pending: {path} changed since the last stamp (cited by {cited}){note(path)}"
        print(line)
        if github:
            print(f"::warning file={path}::{line}")
    for doc, line in report.stale:
        print(f"pending: {line}")
        if github:
            print(f"::warning file={doc}::{line}")
    if not report.errors and not report.pending:
        print("ok: requirements snapshot covers every ADR")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--root", help="repository root (default: git top level)")
    parser.add_argument("--lock", default=DEFAULT_LOCK, help=f"lock path from the root (default: {DEFAULT_LOCK})")
    sub = parser.add_subparsers(dest="command", required=True)
    p_init = sub.add_parser("init")
    p_init.add_argument("--adrs", default=DEFAULT_ADR_GLOB)
    p_init.add_argument("--requirements", default=DEFAULT_REQUIREMENTS_GLOB)
    p_init.add_argument("--superseded")
    p_stamp = sub.add_parser("stamp")
    p_stamp.add_argument("--na", nargs=2, action="append", default=[], metavar=("PATH", "REASON"))
    p_stamp.add_argument("--supersede", nargs=2, action="append", default=[], metavar=("OLD", "NEW"))
    p_stamp.add_argument("--leave-pending", action="append", default=[], metavar="PATH")
    p_supersede = sub.add_parser("supersede")
    p_supersede.add_argument("pairs", nargs="+", metavar="OLD NEW")
    p_check = sub.add_parser("check")
    p_check.add_argument("--fail-stale", action="store_true")
    p_check.add_argument("--github", action="store_true")
    args = parser.parse_args(argv)

    root = repo_root(args.root)
    lock_path = root / args.lock
    try:
        if args.command == "init":
            init(root, lock_path, args.adrs, args.requirements, args.superseded)
            print(f"created {args.lock}")
            return 0
        if args.command == "stamp":
            report = stamp(root, lock_path, args.na, args.supersede, args.leave_pending)
            print_report(report, False, root)
            if report.errors:
                print("lock not written; fix the errors above and stamp again")
                return 1
            return 0
        if args.command == "supersede":
            if len(args.pairs) % 2:
                raise LockError("supersede takes OLD NEW pairs")
            pairs = [args.pairs[i:i + 2] for i in range(0, len(args.pairs), 2)]
            report = supersede_only(root, lock_path, pairs)
            print_report(report, False, root)
            if report.errors:
                print("lock not written; fix the errors above and run supersede again")
                return 1
            return 0
        report = check(root, lock_path)
    except LockError as exc:
        print(f"error: {exc}")
        return 1
    print_report(report, args.github, root)
    if report.errors:
        return 1
    return 2 if args.fail_stale and report.pending else 0


if __name__ == "__main__":
    sys.exit(main())
