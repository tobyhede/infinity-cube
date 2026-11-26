// PROTOTYPE, throwaway: the floating variant bar for the OpenDyslexic
// dark-mode prototype (see opendyslexic.css). Not production UI.
import { useEffect, useState } from 'react';
import { readVariant, setPrototypeFont, VARIANTS, type VariantId } from './prototype-font';

export function PrototypeFontBar() {
  const [variant, setVariant] = useState<VariantId>(readVariant);

  useEffect(() => {
    setPrototypeFont(variant);
    const url = new URL(window.location.href);
    url.searchParams.set('font', variant);
    window.history.replaceState(window.history.state, '', url);
  }, [variant]);

  const step = (by: number) =>
    setVariant((current) => {
      const at = VARIANTS.findIndex((each) => each.id === current);
      const next = VARIANTS[(at + by + VARIANTS.length) % VARIANTS.length];
      return next?.id ?? current;
    });

  const current = VARIANTS.find((each) => each.id === variant);
  return (
    <div
      data-prototype-font-bar
      style={{
        position: 'fixed',
        bottom: 12,
        right: 12,
        zIndex: 2147483647,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        borderRadius: 999,
        background: '#ffe600',
        color: '#000',
        font: '600 12px ui-sans-serif, system-ui, sans-serif',
        boxShadow: '0 2px 10px rgb(0 0 0 / 0.4)',
      }}
    >
      <button type="button" aria-label="Previous font variant" onClick={() => step(-1)}>
        ◀
      </button>
      <span>
        PROTOTYPE font {current?.id} ({current?.name}) · dark mode only
      </span>
      <button type="button" aria-label="Next font variant" onClick={() => step(1)}>
        ▶
      </button>
    </div>
  );
}
