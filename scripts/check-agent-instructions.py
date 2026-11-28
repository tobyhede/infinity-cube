"""Check the repository's root instruction budget and CLAUDE.md symlink."""
from pathlib import Path

instructions = Path("AGENTS.md")
size = instructions.stat().st_size
if size > 12_288:
    print(f"AGENTS.md is {size} bytes (limit 12288)")
    raise SystemExit(1)

claude_instructions = Path("CLAUDE.md")
if not claude_instructions.is_symlink() or claude_instructions.resolve() != instructions.resolve():
    print("CLAUDE.md must be a symlink to AGENTS.md")
    raise SystemExit(1)
