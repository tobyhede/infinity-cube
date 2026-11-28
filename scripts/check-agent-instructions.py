"""Check the repository's root instruction budget and Claude alias."""
from pathlib import Path

instructions = Path("AGENTS.md")
size = instructions.stat().st_size
if size > 12_288:
    print(f"AGENTS.md is {size} bytes (limit 12288)")
    raise SystemExit(1)

alias = Path("CLAUDE.md")
if not alias.is_symlink() or alias.resolve() != instructions.resolve():
    print("CLAUDE.md must be a symlink to AGENTS.md")
    raise SystemExit(1)
