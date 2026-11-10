/**
 * A Resource's name, the first line of its Title (ADR 0083). It is published
 * here so a plugin, which imports only this API (ADR 0142), names its Resource
 * as every other surface does; `@project/core` re-exports it as its own.
 */
export const titleName = (title: string): string => {
  const firstBreak = title.indexOf('\n');
  return firstBreak === -1 ? title : title.slice(0, firstBreak);
};
