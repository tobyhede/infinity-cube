import type { RailCommand } from '@project/resource-api/view';
import { ChoiceMenu, ChoiceMenuTrigger } from './ChoiceMenu';
import { ToolbarButton } from './components/toolbar';

export interface RailChoiceMenuProps {
  /** A plugin's choice command (ADR 0142). */
  readonly command: Extract<RailCommand, { readonly kind: 'choice' }>;
}

/**
 * A plugin's choice command on a Resource's rail, as an Ur Resource's Shape is
 * chosen (ADR 0121, ADR 0142).
 *
 * The shared `ChoiceMenu`: the radio list, the mark on the current choice, the
 * keyboard and the dismissal are the primitive's. The trigger's face is the
 * chosen member, so the list is uncaptioned — the face already says what the
 * set is — and each row is the member's glyph and its name.
 *
 * The trigger is a `ToolbarButton`, so it takes its place in the rail's one
 * roving tab stop (ADR 0073). `nokey nodrag nopan` and the click and
 * pointer-down stops are what every other rail control carries: a press opens
 * the list rather than panning or dragging the canvas, and the portalled popup
 * carries `nokey` itself because it is outside the Resource.
 */
export function RailChoiceMenu({ command }: RailChoiceMenuProps) {
  const choices = command.choices.map((choice) => ({
    id: choice.id,
    title: choice.label,
    icon: choice.icon,
  }));
  const chosen = command.choices.find((choice) => choice.id === command.chosen);
  return (
    <ChoiceMenu<string>
      label={command.label}
      captioned={false}
      choices={choices}
      chosen={chosen === undefined ? null : chosen.id}
      onChoose={command.choose}
      align="start"
      className="nokey w-40"
      trigger={
        <ChoiceMenuTrigger
          render={<ToolbarButton size="compact" />}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          className="nokey nodrag nopan gap-1 px-1.5"
          aria-label={
            chosen === undefined ? command.label : `${command.label}: ${chosen.label}`
          }
          icon={chosen?.icon}
        />
      }
    />
  );
}
