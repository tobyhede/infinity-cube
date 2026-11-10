import { Suspense, useCallback, useEffect, useRef } from 'react';
import type { RenderedMarkdownProps, SourceEditorProps } from '@project/resource-api/view';
import { Kbd, KbdGroup } from './components/kbd';
import { RenderedMarkdown } from './RenderedMarkdown';
import { MarkdownSourceEditor } from './markdown-source-editor-lazy';
import type { MarkdownSourceEditorHandle } from './MarkdownSourceEditor';
import { cn } from './lib/utils';
import './markdown-resource-body.css';

/**
 * The text components every Resource surface provides a plugin through the
 * Resource API (ADR 0142): Markdown rendered by the one parser and sanitiser
 * (`RenderedMarkdown`), and the source editor (`MarkdownSourceEditor`), so a
 * plugin reaches neither CodeMirror nor a parser of its own, and the same text
 * reads the same on the Map and on the Stage.
 */

/** Markdown as a Resource surface renders it. */
export function HostRenderedMarkdown({ markdown, drawnName, className }: RenderedMarkdownProps) {
  return (
    <RenderedMarkdown
      markdown={markdown}
      drawnName={drawnName}
      className={cn('markdown-resource-body__rendered resource__body', className)}
    />
  );
}

/**
 * The source editor as a Resource surface draws it, with the two keys it
 * leaves to the plugin named below it.
 *
 * **The keys are the two the editor withholds from CodeMirror** (ADR 0063,
 * `PANE_OWNED_KEYS`): `Escape` and `Mod-Enter` reach the element a plugin
 * wraps around this, which ends its edit. A focus that leaves ends nothing
 * (ADR 0064). `nodrag` stops a text selection dragging the Resource and `nopan`
 * stops a click-drag panning the canvas; the wheel stays the canvas's.
 */
export function HostSourceEditor({
  value,
  onValueChange,
  ariaLabel,
  autoFocus = false,
  className,
}: SourceEditorProps) {
  const handle = useRef<MarkdownSourceEditorHandle | null>(null);
  /**
   * Whether the caret is still to be placed. The editor may arrive behind
   * `lazy`, so the request outlives the render that made it: the effect takes
   * it when the handle is already there, and `receive` when it arrives.
   */
  const wantsCaret = useRef(false);
  const receive = useCallback((next: MarkdownSourceEditorHandle | null) => {
    handle.current = next;
    if (next !== null && wantsCaret.current) {
      wantsCaret.current = false;
      next.focus();
    }
  }, []);
  useEffect(() => {
    if (!autoFocus) return;
    if (handle.current === null) wantsCaret.current = true;
    else handle.current.focus();
  }, [autoFocus]);
  return (
    <div
      className={cn(
        'markdown-resource-body markdown-resource-body--editing nodrag nopan',
        className,
      )}
    >
      <Suspense fallback={<div className="markdown-resource-body__pending" aria-hidden="true" />}>
        <MarkdownSourceEditor
          ref={receive}
          className="markdown-resource-body__source"
          value={value}
          ariaLabel={ariaLabel}
          onValueChange={onValueChange}
        />
      </Suspense>
      <div className="markdown-resource-body__shortcut-hint" aria-hidden="true">
        <span className="markdown-resource-body__shortcut">
          <KbdGroup className="markdown-resource-body__shortcut-keys">
            <Kbd keyName="modifier" />+<Kbd>&#8629;</Kbd>
          </KbdGroup>
          Save
        </span>
        <span className="markdown-resource-body__shortcut">
          <KbdGroup className="markdown-resource-body__shortcut-keys">
            <Kbd>Esc</Kbd>
          </KbdGroup>
          Cancel
        </span>
      </div>
    </div>
  );
}
