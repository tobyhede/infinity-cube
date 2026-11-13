import { pluginCreations } from '@project/ui';

/**
 * The kind Add creates, on the canvas and in the Dock (ADR 0142): the first
 * plugin in the build's list order that offers a Dock creation. No kind is a
 * default; the list's order decides, and it puts Markdown first.
 */
export const ADD_KIND: string = (() => {
  const first = pluginCreations().find(({ creation }) => creation.from === 'dock');
  if (first === undefined) throw new Error('No plugin in this build offers a Dock creation.');
  return first.kind;
})();
