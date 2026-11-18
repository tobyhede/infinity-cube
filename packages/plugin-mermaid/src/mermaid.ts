import type { Mermaid, MermaidConfig } from 'mermaid';

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

/**
 * How Mermaid is set up: `strict` encodes the HTML tags a source writes in its
 * text and turns off the clicks it names (ADR 0158), and a source it cannot
 * draw rejects rather than leaving Mermaid's error drawing in the document.
 */
export const MERMAID_SETTINGS = {
  startOnLoad: false,
  securityLevel: 'strict',
  suppressErrorRendering: true,
} as const satisfies MermaidConfig;

/**
 * Mermaid's settings for a diagram drawn in `theme`: the theme of a source
 * that chooses none. One that chooses its own, in its frontmatter or a
 * directive, keeps it, since Mermaid reads a source's own configuration over
 * these.
 */
export const settingsIn = (theme: DiagramTheme): MermaidConfig => ({
  ...MERMAID_SETTINGS,
  theme: MERMAID_THEME[theme],
});

/* v8 ignore start -- drawn in a browser only: jsdom has no SVG layout for Mermaid to measure with. */
/** Mermaid, fetched the first time a diagram is drawn rather than with the application, and again after a failed fetch. */
const mermaid = loadOnce((): Promise<Mermaid> =>
  import('mermaid').then(({ default: library }) => library),
);

/**
 * The Mermaid library's drawing, which needs a browser's layout and so is not
 * run under jsdom. The source is drawn as written. Mermaid's settings are the
 * page's rather than a diagram's, so they are set before each draw, with no
 * wait between setting them and asking for the drawing.
 */
export const renderWithMermaid: RenderDiagram = async (id, source, theme, container) => {
  const library = await mermaid();
  library.initialize(settingsIn(theme));
  const { svg } = await library.render(id, source, container);
  return svg;
};
/* v8 ignore stop */
