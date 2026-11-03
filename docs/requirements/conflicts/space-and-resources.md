# Conflicts: Space and Resources

These are places where the sources and the code disagree, or a source's reason has lapsed, and [../DECISIONS.md](../DECISIONS.md) does not settle the question. Every rule an open conflict touches has the status **undecided (Cn)** in [../space-and-resources.md](../space-and-resources.md). Conflict ids are never reused. Paths that start with `test/` are at the repo root; all others are under `packages/`.

## C1. Does an Image Resource keep recording its natural size?

- **Rules.** SR-26 (undecided) and the Data model's `naturalSize` row. Related: SR-22, SR-23 and SR-39, which point to SR-26 rather than state the measurement.
- **Disagreement.** 0106 measures a picture when its URL is set and records its natural size, for one reader: the first Open, which sized the Resource from it. 0122 removed first-Open sizes, so nothing reads the field any more. The code still measures at creation and Replace and writes `naturalSize` (`app/src/image-creation.ts`, `app/src/image-replacement.ts`, `app/src/space-authoring.ts`), and Replace still bounds the measurement at 10 seconds (0126). Drafting rule 1 does not remove the rule, because no later ADR says to stop recording; the reason alone has lapsed.
- **Options.** (a) Keep recording it as image metadata a later reader may use, and state SR-26 as **built**. (b) Stop measuring and drop `naturalSize` from the Image content schema, rolling fixtures forward; Replace then compares only the URL, as it already does.
- **Recommended: (b).** A measured field with no reader is a cost on every creation and Replace (an extra load and a timeout) and a schema field to keep honest. Choose (a) only if a reader is planned.
- **Evidence.** `core/src/kinds/image.ts` (`imageNaturalSizeSchema`: "no size rule reads it"); `app/test/image-replacement.test.ts` › "records no natural size when the new picture does not load", "answers unchanged for the same URL even with a different size"; `app/test/image-creation.test.ts` › "creates one with no size when the picture does not load".
