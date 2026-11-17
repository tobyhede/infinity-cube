import type { Mermaid } from 'mermaid';

/**
 * Draw Mermaid source as SVG markup, under `id`, which names the drawing in
 * the document while it is laid out. A source Mermaid cannot draw rejects,
 * with Mermaid's own words for why.
 */
export type RenderMermaid = (id: string, source: string) => Promise<string>;

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
      theme: 'neutral',
    });
    return library;
  });
  return loaded;
};

/** The Mermaid library's drawing, which needs a browser's layout and so is not run under jsdom. */
export const renderWithMermaid: RenderMermaid = async (id, source) => {
  const { svg } = await (await mermaid()).render(id, source);
  return svg;
};
/* v8 ignore stop */
