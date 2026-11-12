import { spaceKind, type ResourceDocument } from '@project/core';
import type { ShownSpace } from '@project/persistence';

/**
 * A Space Resource lifecycle input carrying the document the Space plugin
 * makes: a Space Resource titled as the input is, showing the Space unframed.
 */
export const showingSpace = <Input extends { readonly title: string }>(input: Input) => ({
  ...input,
  document: (shown: ShownSpace): ResourceDocument => ({
    title: input.title,
    kind: spaceKind.id,
    content: shown,
  }),
});
