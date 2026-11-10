import { useLayoutEffect, useRef } from 'react';
import { useMapEmbedSlot, type MapEmbedRequest } from '@project/ui';

/** The border a measured footer is drawn above, which `embedBounds` adds back. */
const FOOTER_BORDER = 4;

/**
 * The Map embedding as the canvas draws it (ADR 0068, ADR 0142). The Map's
 * Resources are drawn by the canvas over the rect, as sibling nodes clipped to
 * the room the plugin gave the embedding, so this publishes what the plugin
 * asked for while it is drawn, reports how far that room stops short of the
 * rect's bottom, and draws what the host has to say in place of the Map.
 */
export function CanvasMapEmbed({ request }: { readonly request: MapEmbedRequest }) {
  const slot = useMapEmbedSlot();
  const publish = slot?.publish;
  const reportFooter = slot?.reportFooter;
  const room = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    publish?.(request);
  }, [publish, request]);
  useLayoutEffect(() => () => publish?.(null), [publish]);
  useLayoutEffect(() => {
    const element = room.current;
    const resource = element?.closest<HTMLElement>('.canvas-resource') ?? null;
    if (element === null || resource === null || reportFooter === undefined) return;
    const report = () => {
      const resourceBox = resource.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      // The canvas is drawn scaled: measure in the Resource's own units.
      const scale = resource.offsetHeight > 0 ? resourceBox.height / resource.offsetHeight : 1;
      if (scale <= 0) return;
      reportFooter((resourceBox.bottom - box.bottom) / scale - FOOTER_BORDER);
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    observer.observe(resource);
    return () => {
      observer.disconnect();
      reportFooter(null);
    };
  }, [reportFooter]);
  return (
    <div
      ref={room}
      className="resource-embedded-map"
      data-testid="embedded-map"
      data-claimed={request.claim !== undefined}
      style={{ position: 'absolute', inset: 0 }}
    >
      {slot?.note === undefined ? null : <p className="canvas-resource__space-note">{slot.note}</p>}
    </div>
  );
}
