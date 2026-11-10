import { titleLines } from '@project/core';

interface TitleLadderProps {
  readonly title: string;
}

/**
 * A Resource's Title drawn as its Title Lines (ADR 0083).
 *
 * The drawn Resource is the only surface that draws the ladder — everywhere else
 * shows the name, which is the first line — and it draws it identically whether
 * the Resource is Open or Closed and whatever kind the Resource is. A Title that
 * changed shape on Opening would teach an author that Opening edits it.
 *
 * Each line is **its own block element carrying its role**, and that is the
 * whole of the structure: the roles come from `titleLines`, which is where the
 * domain settles what an author's second line means, and the type ladder,
 * clamping and colour come from `canvas-resource.css`. Nothing here reads a
 * newline, because a `split('\n')` at a call site is exactly what ADR 0083
 * bought the named operation to prevent.
 *
 * The distinction the block-per-line is here for: a break the **author typed**
 * starts a rung and a break the **box chose** does not. Each element wraps
 * freely within its own role, so a subtitle that runs to two visual lines is
 * one subtitle rather than a subtitle and a caption, and a long single-line
 * Title draws entirely at the `title` role.
 *
 * Keyed by position because position *is* the identity here — it is what gives
 * a line its role — and two lines of a Title may legitimately read the same.
 */
function TitleLadder({ title }: TitleLadderProps) {
  return (
    <>
      {titleLines(title).map((line, index) => (
        <span key={index} className="canvas-resource__title-line" data-role={line.role}>
          {line.text}
        </span>
      ))}
    </>
  );
}

/**
 * The Resource's Title Lines, as the one heading the drawn Resource draws.
 *
 * A `span` and not a `div` or an `h2`: a `button`'s content model is phrasing
 * content, and this element sits inside ADR 0065's activation control whenever
 * the Title is editable. `role="heading"` with `aria-level` is the ARIA
 * spelling of what a native `h2` would say, taken because the native element
 * cannot legally go where this one has to.
 *
 * It carries no `aria-label`. Its name is the Title Lines it draws, which is
 * the whole reason the control wraps it rather than the other way round.
 */
export function TitleHeading({ title }: TitleLadderProps) {
  return (
    <span className="canvas-resource__title-heading" role="heading" aria-level={2}>
      <TitleLadder title={title} />
    </span>
  );
}

