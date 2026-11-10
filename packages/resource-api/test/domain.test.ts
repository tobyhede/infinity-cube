import { z } from 'zod';
import {
  API_VERSION,
  assetRefSchema,
  definePlugin,
  PluginListError,
  pluginList,
  pluginListProblem,
} from '@project/resource-api/domain';
import { createRailStore, type RailCommand } from '@project/resource-api/view';

const plugin = <const V extends number, const K extends string>(apiVersion: V, kind: K) =>
  definePlugin({
    apiVersion,
    kind,
    name: 'Thing',
    listName: 'Things',
    referenceName: null,
    content: z.object({}).strict(),
    mapContent: { schema: z.object({}).strict(), default: {} },
  });

describe('the build-time plugin list', () => {
  it('loads plugins written for this API version', () => {
    const list = pluginList([plugin(API_VERSION, 'one'), plugin(API_VERSION, 'two')]);
    expect(list.map(({ kind }) => kind)).toEqual(['one', 'two']);
  });

  it('refuses a plugin written for another API version, at the type and when it loads', () => {
    // @ts-expect-error -- a plugin for another API version is not a list element.
    expect(() => pluginList([plugin(API_VERSION + 1, 'future')])).toThrow(PluginListError);
    expect(pluginListProblem([plugin(2, 'future')])).toMatch(/version 2/u);
  });

  it('refuses a kind listed twice or one that is not a kind id', () => {
    expect(pluginListProblem([plugin(1, 'one'), plugin(1, 'one')])).toMatch(/twice/u);
    expect(pluginListProblem([plugin(1, 'not a kind')])).toMatch(/not a Resource kind id/u);
    expect(pluginListProblem([plugin(1, 'vnd.acme.widget')])).toBeUndefined();
  });
});

describe('an asset reference', () => {
  const ref = `/assets/${'A'.repeat(43)}`;
  it('is /assets/ and 43 characters of unpadded base64url, as a whole string', () => {
    expect(assetRefSchema.safeParse(ref).success).toBe(true);
    expect(assetRefSchema.safeParse(`/assets/${'-_'.repeat(21)}a`).success).toBe(true);
    expect(assetRefSchema.safeParse(`${ref}=`).success).toBe(false);
    expect(assetRefSchema.safeParse(` ${ref}`).success).toBe(false);
    expect(assetRefSchema.safeParse(`/assets/${'A'.repeat(42)}`).success).toBe(false);
  });
});

describe('a rail store', () => {
  const command = (id: string): RailCommand => ({
    kind: 'action',
    id,
    label: id,
    icon: null,
    run: () => undefined,
  });

  it('keeps each source’s commands in the order the sources first published', () => {
    const store = createRailStore();
    const first = Symbol('first');
    const second = Symbol('second');
    const heard: number[] = [];
    store.subscribe(() => heard.push(store.commands().length));
    store.publish(first, [command('a')]);
    store.publish(second, [command('b'), command('c')]);
    store.publish(first, [command('d')]);
    expect(store.commands().map(({ id }) => id)).toEqual(['d', 'b', 'c']);
    store.withdraw(first);
    expect(store.commands().map(({ id }) => id)).toEqual(['b', 'c']);
    expect(heard).toEqual([1, 3, 3, 2]);
  });

  it('tells no one when the same commands are published again or nothing is withdrawn', () => {
    const store = createRailStore();
    const source = Symbol('source');
    const commands = [command('a')];
    let heard = 0;
    store.subscribe(() => {
      heard += 1;
    });
    store.publish(source, commands);
    store.publish(source, commands);
    store.withdraw(Symbol('other'));
    expect(heard).toBe(1);
  });
});
