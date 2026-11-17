import type { Mermaid } from 'mermaid';

/** The canvas's colour scheme, which a diagram is drawn to match. */
export type DiagramTheme = 'light' | 'dark';

/**
 * Draw Mermaid source as SVG markup in `theme`, under `id`, which names the
 * diagram while it is laid out in `container`, an unseen element of the
 * plugin's own. A source Mermaid cannot draw rejects, with Mermaid's own words
 * for why.
 */
export type RenderDiagram = (
  id: string,
  source: string,
  theme: DiagramTheme,
  container: HTMLElement,
) => Promise<string>;

/**
 * `load`, run once and its answer kept while it holds, and run again on the
 * next call after it rejects, so one failed fetch is not kept for the life of
 * the page.
 */
export const loadOnce = <T>(load: () => Promise<T>): (() => Promise<T>) => {
  let loaded: Promise<T> | undefined;
  const attempt = async (): Promise<T> => {
    try {
      return await load();
    } catch (error) {
      loaded = undefined;
      throw error;
    }
  };
  return () => {
    loaded ??= attempt();
    return loaded;
  };
};

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
 * `initialize`.
 */
export const withTheme = (source: string, theme: DiagramTheme): string => {
  const directive = `%%{init: {"theme": "${MERMAID_THEME[theme]}"}}%%\n`;
  const frontmatter = FRONTMATTER.exec(source)?.[0] ?? '';
  const joined =
    frontmatter === '' || frontmatter.endsWith('\n') ? frontmatter : `${frontmatter}\n`;
  return `${joined}${directive}${source.slice(frontmatter.length)}`;
};

/* v8 ignore start -- drawn in a browser only: jsdom has no SVG layout for Mermaid to measure with. */
/**
 * Mermaid, fetched the first time a diagram is drawn rather than with the
 * application, and set up once, again after a failed fetch: `strict` encodes
 * the HTML tags a source writes in its text and turns off the clicks it names
 * (ADR 0158), and a source it cannot draw rejects rather than leaving
 * Mermaid's error drawing in the document.
 */
const mermaid = loadOnce((): Promise<Mermaid> =>
  import('mermaid').then(({ default: library }) => {
    library.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
    });
    return library;
  }),
);

/** The Mermaid library's drawing, which needs a browser's layout and so is not run under jsdom. */
export const renderWithMermaid: RenderDiagram = async (id, source, theme, container) => {
  const { svg } = await (await mermaid()).render(id, withTheme(source, theme), container);
  return svg;
};
/* v8 ignore stop */
