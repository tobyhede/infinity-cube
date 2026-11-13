import { describe, expect, it } from 'vitest';
import { kindFlags, PLUGIN_KINDS } from '@project/core';
import { BUILD_CATALOG, kindNaming } from '../src';

describe('each listed plugin’s view half', () => {
  it('is in the build’s catalogue in list order', () => {
    expect(BUILD_CATALOG.entries.map(({ kind }) => kind)).toEqual(PLUGIN_KINDS);
  });

  it.each(PLUGIN_KINDS)(
    'names a Reference to a %s Resource exactly when one may be a Target',
    (kind) => {
      expect(kindNaming(kind).referenceName !== null).toBe(kindFlags(kind).mayBeTarget);
    },
  );
});
