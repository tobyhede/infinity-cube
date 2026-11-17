import type { Mermaid } from 'mermaid';

/** The canvas's colour scheme, which a diagram is drawn to match. */
export type DiagramTheme = 'light' | 'dark';

/**
 * Draw Mermaid source as SVG markup in `theme`, under `id`, which names the
 * diagram in the document while it is laid out. A source Mermaid cannot draw
 * rejects, with Mermaid's own words for why.
 */
export type RenderDiagram = (id: string, source: string, theme: DiagramTheme) => Promise<string>;

/** Mermaid's theme for each canvas colour scheme. */
const MERMAID_THEME = { light: 'neutral', dark: 'dark' } as const satisfies Record<
  DiagramTheme,
  string
>;

/** A leading YAML frontmatter block, which Mermaid reads only at the very start of a source. */
const FRONTMATTER = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/u;

/**
 * `source` with an init directive choosing Mermaid's theme for `theme`, set
 * after any frontmatter so that stays first. Mermaid's configuration is
 * global, so the theme travels with each diagram rather than with
 * `initialize`; a directive the source writes itself comes after this one and
 * so wins.
 */
export const withTheme = (source: string, theme: DiagramTheme): string => {
  const directive = `%%{init: {"theme": "${MERMAID_THEME[theme]}"}}%%\n`;
  const frontmatter = FRONTMATTER.exec(source)?.[0] ?? '';
  const joined =
    frontmatter === '' || frontmatter.endsWith('\n') ? frontmatter : `${frontmatter}\n`;
  return `${joined}${directive}${source.slice(frontmatter.length)}`;
};

/* v8 ignore start -- drawn in a browser only: jsdom has no SVG layout for Mermaid to measure with. */
let loaded: Promise<Mermaid> | undefined;

/**
 * Mermaid, fetched the first time a diagram is drawn rather than with the
 * application, and set up once: `strict` sanitises the SVG it answers and
 * runs nothing a source names (ADR 0158), and a source it cannot draw rejects
 * rather than leaving Mermaid's error drawing in the document.
 */
const mermaid = (): Promise<Mermaid> => {
  loaded ??= import('mermaid').then(({ default: library }) => {
    library.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
    });
    return library;
  });
  return loaded;
};

/** The Mermaid library's drawing, which needs a browser's layout and so is not run under jsdom. */
export const renderWithMermaid: RenderDiagram = async (id, source, theme) => {
  const { svg } = await (await mermaid()).render(id, withTheme(source, theme));
  return svg;
};
/* v8 ignore stop */
