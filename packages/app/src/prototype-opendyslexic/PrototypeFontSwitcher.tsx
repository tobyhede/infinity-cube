// PROTOTYPE, throwaway: the floating variant bar for the OpenDyslexic
// dark-mode prototype (see opendyslexic.css). Not production UI.
import { useEffect, useState } from 'react';

const VARIANTS = [
  { key: 'A', name: 'System sans (control)' },
  { key: 'B', name: 'OpenDyslexic everywhere' },
  { key: 'C', name: 'OpenDyslexic on content' },
] as const;

type VariantKey = (typeof VARIANTS)[number]['key'];

function readVariant(): VariantKey {
  const asked = new URLSearchParams(window.location.search).get('font');
  return VARIANTS.find((variant) => variant.key === asked)?.key ?? 'B';
}

/** Install the variant before the first frame, so a screenshot never catches the control. */
export function installPrototypeFont(): void {
  document.documentElement.dataset.prototypeFont = readVariant();
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

export function PrototypeFontSwitcher() {
  const [variant, setVariant] = useState<VariantKey>(readVariant);

  useEffect(() => {
    document.documentElement.dataset.prototypeFont = variant;
    const url = new URL(window.location.href);
    url.searchParams.set('font', variant);
    window.history.replaceState(window.history.state, '', url);
  }, [variant]);

  const step = (by: number) =>
    setVariant((current) => {
      const at = VARIANTS.findIndex((each) => each.key === current);
      const next = VARIANTS[(at + by + VARIANTS.length) % VARIANTS.length];
      return next?.key ?? current;
    });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.altKey || isTyping(event.target)) return;
      if (event.key === 'ArrowLeft') step(-1);
      if (event.key === 'ArrowRight') step(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const current = VARIANTS.find((each) => each.key === variant);
  return (
    <div
      data-prototype-switcher
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
        PROTOTYPE font {current?.key} ({current?.name}) · dark mode only · Alt+←/→
      </span>
      <button type="button" aria-label="Next font variant" onClick={() => step(1)}>
        ▶
      </button>
    </div>
  );
}
