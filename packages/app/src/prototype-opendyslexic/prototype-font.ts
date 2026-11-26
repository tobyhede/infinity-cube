// PROTOTYPE, throwaway: the OpenDyslexic dark-mode variants (see opendyslexic.css).
export const VARIANTS = [
  { id: 'A', name: 'System sans (control)' },
  { id: 'B', name: 'OpenDyslexic everywhere' },
  { id: 'C', name: 'OpenDyslexic on content' },
] as const;

export type VariantId = (typeof VARIANTS)[number]['id'];

const CONTROL: VariantId = VARIANTS[0].id;

export function readVariant(): VariantId {
  const asked = new URLSearchParams(window.location.search).get('font');
  return VARIANTS.find((variant) => variant.id === asked)?.id ?? CONTROL;
}

/** The bar shows only on a URL that asks for a variant, so the e2e suite never meets it. */
export function askedForPrototypeFont(): boolean {
  return new URLSearchParams(window.location.search).has('font');
}

export function setPrototypeFont(variant: VariantId): void {
  document.documentElement.setAttribute('data-prototype-font', variant);
}

const FACES = [
  { file: 'opendyslexic-latin-400-normal.woff2', weight: '400', style: 'normal' },
  { file: 'opendyslexic-latin-400-italic.woff2', weight: '400', style: 'italic' },
  { file: 'opendyslexic-latin-700-normal.woff2', weight: '700', style: 'normal' },
  { file: 'opendyslexic-latin-700-italic.woff2', weight: '700', style: 'italic' },
] as const;

const FACE_URLS: Record<(typeof FACES)[number]['file'], string> = {
  'opendyslexic-latin-400-normal.woff2': new URL(
    './fonts/opendyslexic-latin-400-normal.woff2',
    import.meta.url,
  ).href,
  'opendyslexic-latin-400-italic.woff2': new URL(
    './fonts/opendyslexic-latin-400-italic.woff2',
    import.meta.url,
  ).href,
  'opendyslexic-latin-700-normal.woff2': new URL(
    './fonts/opendyslexic-latin-700-normal.woff2',
    import.meta.url,
  ).href,
  'opendyslexic-latin-700-italic.woff2': new URL(
    './fonts/opendyslexic-latin-700-italic.woff2',
    import.meta.url,
  ).href,
};

/** Register the bundled faces and install the variant before the first frame. */
export function installPrototypeFont(): void {
  for (const face of FACES) {
    document.fonts.add(
      new FontFace('OpenDyslexic', `url(${FACE_URLS[face.file]}) format('woff2')`, {
        weight: face.weight,
        style: face.style,
        display: 'swap',
      }),
    );
  }
  setPrototypeFont(readVariant());
}
