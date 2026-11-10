# 08 — Creation through the API

Status: ready-for-agent

**Blocked by:** 07 — The Space plugin.

**What to build:** `creates` on each plugin view and `host.create`, as [`spec.md`](../spec.md) sets out, replacing `KindCreation`, `kind-creation.ts` and each `app/kinds/` creation. The host owns placement from the gesture, Title continuation, single-flight, the availability re-check after a wait (today's `later()`), and a new Space's lifetime and two snapshots (ADR 0074, ADR 0089). Data matching is exact over wildcard, then build order.

**Paths:** Dock press for Markdown and Ur; create-and-connect, drawing an Edge to a new Resource; Image through the picker; Image from dropped files or a pasted URL; Space with a new Space; Space from an existing Space in the Resources list, pressed or dragged; Reference from its Target's menu.

**Acceptance:**

- Each path behaves as it does today, in one atomic Edit per press or drop.
- A cancelled picker creates nothing, and a Create withheld during the wait creates nothing.
- A plugin reaches a new Space only by asking for one.
- `app/kinds/` holds no creation.
- `CI passed` is green, including the PostgreSQL and SQLite jobs.
