// PROTOTYPE, throwaway: the OpenDyslexic dark-mode variants (see opendyslexic.css).
export const VARIANTS = [
  { id: 'A', name: 'System sans (control)' },
  { id: 'B', name: 'OpenDyslexic everywhere' },
  { id: 'C', name: 'OpenDyslexic on content' },
] as const;

export type VariantId = (typeof VARIANTS)[number]['id'];

const CONTROL: VariantId = VARIANTS[0].id;
const REMEMBERED = 'prototype-opendyslexic-font';

function asked(): string | null {
  return new URLSearchParams(window.location.search).get('font');
}

// The variant is kept in sessionStorage because navigation rewrites the URL
// without its query, which would drop `?font=`.
function remembered(): string | null {
  try {
    return window.sessionStorage.getItem(REMEMBERED);
  } catch {
    return null;
  }
}

export function readVariant(): VariantId {
  const wanted = asked() ?? remembered();
  return VARIANTS.find((variant) => variant.id === wanted)?.id ?? CONTROL;
}

/** The prototype runs only when a URL in this tab asked for a variant, so the e2e suite never meets it. */
export function askedForPrototypeFont(): boolean {
  return asked() !== null || remembered() !== null;
}

export function setPrototypeFont(variant: VariantId): void {
  document.documentElement.setAttribute('data-prototype-font', variant);
  try {
    window.sessionStorage.setItem(REMEMBERED, variant);
  } catch {
    // Without storage the variant lasts until the next navigation.
  }
}
