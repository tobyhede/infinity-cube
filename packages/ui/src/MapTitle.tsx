import { createContext, useContext } from 'react';
import { titleName } from '@project/core';
import type { TitleProps } from '@project/resource-api/view';
import { Button } from './Button';
import { CardTitle } from './components/card';
import { InlineTitleEditor } from './InlineTitleEditor';
import { TitleHeading } from './ResourceTitleHeading';

/** The Title as the Map draws it, and the rename it offers (ADR 0065, ADR 0083). */
export interface MapTitle {
  readonly title: string;
  readonly readOnly: boolean;
  readonly onBeginTitleEdit?: (() => void) | undefined;
  readonly editor?:
    | {
        readonly onComplete: (title: string) => string | null;
        readonly onCancel: () => void;
      }
    | undefined;
  readonly onReturnFocus: () => void;
}

/**
 * The Title the Map draws, read from context rather than closed over, so the
 * host hands the plugin one Title component for the surface's lifetime and a
 * rename's caret survives every render of the Resource around it.
 */
export const MapTitleContext = createContext<MapTitle | null>(null);

export function MapTitleView({ className }: TitleProps) {
  const props = useContext(MapTitleContext);
  if (props === null) return null;
  const name = titleName(props.title);
  const titleClass = ['canvas-resource__title', className].filter(Boolean).join(' ');
  if (props.editor !== undefined && !props.readOnly) {
    return (
      <InlineTitleEditor
        title={props.title}
        label="Resource title"
        variant="resource"
        multiline
        onComplete={props.editor.onComplete}
        onCancel={props.editor.onCancel}
        onReturnFocus={props.onReturnFocus}
      />
    );
  }
  const begin = props.readOnly ? undefined : props.onBeginTitleEdit;
  return (
    <CardTitle className={titleClass} data-editable={begin !== undefined}>
      {begin === undefined ? (
        <TitleHeading title={props.title} />
      ) : (
        <Button
          variant="ghost"
          className="canvas-resource__title-control nodrag nopan"
          aria-label={`Edit Title ${name}`}
          onClick={(event) => {
            event.stopPropagation();
            begin();
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <TitleHeading title={props.title} />
        </Button>
      )}
    </CardTitle>
  );
}
