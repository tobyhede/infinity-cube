import { describe, expect, it, vi } from 'vitest';
import { dockCreates } from '../src/dock-chrome';
import { NOTHING_CREATING } from '../src/resource-placement';

/** The Creates the Command Dock draws, one per plugin creation offered there (ADR 0142). */

const current = () => true;

describe('the Dock’s Creates', () => {
  it('draws one per Dock creation, in the registry’s order', () => {
    const createFromDock = vi.fn();
    const creates = dockCreates({ createFromDock, creating: NOTHING_CREATING }, true, current);

    expect(creates.map(({ kind }) => kind)).toEqual(['markdown', 'space', 'image', 'ur']);
    expect(creates.every(({ disabled }) => !disabled)).toBe(true);
  });

  it('runs the creation of the pressed kind, with the availability to ask again', () => {
    const createFromDock = vi.fn();
    const creates = dockCreates({ createFromDock, creating: NOTHING_CREATING }, true, current);

    creates.find(({ kind }) => kind === 'image')?.create();

    expect(createFromDock).toHaveBeenCalledWith('image', current);
  });

  it('withholds every Create while Add Resource is withheld', () => {
    const createFromDock = vi.fn();
    const creates = dockCreates({ createFromDock, creating: NOTHING_CREATING }, false, current);

    for (const create of creates) create.create();

    expect(creates.every(({ disabled }) => disabled)).toBe(true);
    expect(createFromDock).not.toHaveBeenCalled();
  });

  it('withholds only the Create whose kind is being created', () => {
    const createFromDock = vi.fn<(kind: string) => void>();
    const creates = dockCreates({ createFromDock, creating: new Set(['space']) }, true, current);

    for (const create of creates) create.create();

    expect(creates.filter(({ disabled }) => disabled).map(({ kind }) => kind)).toEqual(['space']);
    expect(createFromDock.mock.calls.map(([kind]) => kind)).toEqual(['markdown', 'image', 'ur']);
  });
});
