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
  {
    url: new URL('./fonts/OpenDyslexic3-Regular.ttf', import.meta.url).href,
    weight: '400',
  },
  {
    url: new URL('./fonts/OpenDyslexic3-Bold.ttf', import.meta.url).href,
    weight: '700',
  },
];

/** Register the bundled faces and install the variant before the first frame. */
export function installPrototypeFont(): void {
  for (const face of FACES) {
    document.fonts.add(
      new FontFace('OpenDyslexic', `url(${face.url}) format('truetype')`, {
        weight: face.weight,
        display: 'swap',
      }),
    );
  }
  setPrototypeFont(readVariant());
}
