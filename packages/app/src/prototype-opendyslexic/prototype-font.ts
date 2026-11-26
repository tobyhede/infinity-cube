// PROTOTYPE, throwaway: the OpenDyslexic dark-mode variants (see opendyslexic.css).
export const VARIANTS = [
  { key: 'A', name: 'System sans (control)' },
  { key: 'B', name: 'OpenDyslexic everywhere' },
  { key: 'C', name: 'OpenDyslexic on content' },
] as const;

export type VariantKey = (typeof VARIANTS)[number]['key'];

export function readVariant(): VariantKey {
  const asked = new URLSearchParams(window.location.search).get('font');
  return VARIANTS.find((variant) => variant.key === asked)?.key ?? 'B';
}

/** Install the variant before the first frame, so a screenshot never catches the control. */
export function installPrototypeFont(): void {
  setPrototypeFont(readVariant());
}

export function setPrototypeFont(variant: VariantKey): void {
  document.documentElement.setAttribute('data-prototype-font', variant);
}
