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
 * `source` with an init directive choosing Mermaid's theme for `theme`, unless
 * the source chooses a theme of its own (`authored`), in its frontmatter or a
 * directive, which then stands. Mermaid's configuration is global, so the
 * theme travels with each diagram rather than with `initialize`. The directive
 * goes last: Mermaid reads a directive anywhere in a source, and frontmatter
 * only at its start.
 */
export const withTheme = (source: string, theme: DiagramTheme, authored: boolean): string => {
  if (authored) return source;
  const ended = source === '' || source.endsWith('\n') ? source : `${source}\n`;
  return `${ended}%%{init: {"theme": "${MERMAID_THEME[theme]}"}}%%\n`;
};

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

/* v8 ignore start -- drawn in a browser only: jsdom has no SVG layout for Mermaid to measure with. */
/**
 * Mermaid, fetched the first time a diagram is drawn rather than with the
 * application, and set up once with {@link MERMAID_SETTINGS}, again after a
 * failed fetch.
 */
const mermaid = loadOnce((): Promise<Mermaid> =>
  import('mermaid').then(({ default: library }) => {
    library.initialize(MERMAID_SETTINGS);
    return library;
  }),
);

/** The Mermaid library's drawing, which needs a browser's layout and so is not run under jsdom. */
export const renderWithMermaid: RenderDiagram = async (id, source, theme, container) => {
  const library = await mermaid();
  // Mermaid's own reading of the source's frontmatter and directives says
  // whether it chooses a theme; a source it cannot parse is left for `render`
  // to refuse in its own words.
  const parsed = await library.parse(source, { suppressErrors: true });
  const authored = parsed !== false && parsed.config.theme !== undefined;
  const { svg } = await library.render(id, withTheme(source, theme, authored), container);
  return svg;
};
/* v8 ignore stop */
