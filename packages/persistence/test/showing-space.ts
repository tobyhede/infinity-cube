import { spaceResourceMaker } from '@project/plugins/testing';

/**
 * A Space Resource lifecycle input carrying the document the Space plugin
 * makes: a Space Resource titled as the input is, showing the Space unframed.
 */
export const showingSpace = <Input extends { readonly title: string }>(input: Input) => ({
  ...input,
  document: spaceResourceMaker(input.title),
});
