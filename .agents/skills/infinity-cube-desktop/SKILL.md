---
name: infinity-cube-desktop
description: Maintain InfinityCube’s Tauri desktop shell when changing Space window lifecycle, custom URI scheme handling, native command permissions, desktop packaging or updates.
---

# InfinityCube desktop

Identify which window makes the request and who owns the result. The home window opens an Aggregate directory. A Space window runs the shared browser application against the in-process Rust host. A close question belongs to the shell. Read the [project vocabulary](../../../CONTEXT.md) and the relevant rules in [Storage and hosts](../../../docs/requirements/storage.md), checking the snapshot marker for newer accepted ADRs.

- For opening a folder, saving an Edit, closing a Space window or quitting, follow [Window lifecycle](references/window-lifecycle.md).
- For an invoke command, a window capability or a custom URI scheme request, follow [Permissions and requests](references/permissions.md).
- For a missing bundled asset, a platform build, a preview DMG or an available update, follow [Builds and updates](references/releases.md).

For changes to the React application inside a Space window, follow the shared [UI workflow](../../../.agents/skills/shadcn-first-ui/SKILL.md). A defect visible on both desktop and web usually belongs to the shared application or host contract. Reproduce at that boundary before changing the shell.
