# Plugins read the app's theme, and Mermaid's default follows it

Status: agreed as a follow-up PR after #481 merges (decided 2026-11-19). Branch from main.

## Problem

A plugin has no stylesheet and no way to read the app's colours. Each styles itself inline and inherits
text colour. The Mermaid plugin reads only its rect's `color-scheme` and picks Mermaid's stock `neutral`
or `dark` theme (`packages/plugin-mermaid/src/mermaid.ts`, `settingsIn`), so a diagram does not look
like the app.

The app's colours are CSS custom properties on the root (`--card`, `--foreground`, `--border`,
`--primary`, `--muted-foreground`, ... in `packages/app/src/tailwind.css` and `theme-dark.css`).
ADR 0142 lets a plugin reach the host only through `@project/resource-api`.

## Proposal

1. The Resource API hands a plugin a small set of the app's theme colours and its font (a hook in
   `/view`, provided by the host through `ResourceHostProvider`). New ADR; update Rendering, UI and
   Space and Resources.
2. The Mermaid plugin builds its default from them with Mermaid's `base` theme and `themeVariables`,
   set in the settings before each draw. A source that chooses its own theme still wins (ADR 0158).

## Open questions

- Mermaid's docs say `themeVariables` take hex colours only. Check what it accepts before choosing the
  format the API hands over (the app uses hex, `oklch()` and `hsl()`).
- Which colours: keep the set small (surface, text, muted text, border, accent, font family).
- Whether a change of theme is delivered by the hook, replacing the plugin's own `color-scheme` watcher.
