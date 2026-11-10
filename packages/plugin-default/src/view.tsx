import type { CSSProperties } from 'react';
import { FileQuestionMark } from 'lucide-react';
import { definePluginView, Title, type PluginViewProps } from '@project/resource-api/view';
import { defaultPlugin } from './domain';

const FILL: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  padding: '8px 12px',
  overflow: 'hidden',
  textAlign: 'center',
};

const NOTE: CSSProperties = { margin: 0, fontSize: 12, opacity: 0.75 };

/**
 * A Resource whose kind names no plugin in this build: its Title, and that its
 * kind is not available, in a rectangle. It offers no authoring of its content
 * and has nothing on its rail; the canvas keeps every capability it has over
 * any Resource, and the Title renames as any does.
 */
function DefaultView({ surface }: PluginViewProps<unknown, unknown>) {
  return (
    <div style={FILL} data-missing-kind={surface.resource.kind}>
      <Title />
      <p style={NOTE}>{`“${surface.resource.kind}” is not available in this build.`}</p>
    </div>
  );
}

/** The default plugin's glyph. */
function DefaultGlyph({ size = 14 }: { readonly size?: number | undefined }) {
  return <FileQuestionMark size={size} />;
}

export const defaultPluginView = definePluginView(defaultPlugin, {
  View: DefaultView,
  Glyph: DefaultGlyph,
});
