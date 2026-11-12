import { describe, expectTypeOf, it } from 'vitest';
import type { Resource as ApiResource } from '@project/resource-api/domain';
import type { KindId, Resource } from '../src/index';

/**
 * ADR 0142: the Resource API's `Resource<C>` is the one structure the core,
 * the stores, HTTP and plugins take. The core's Resource is that structure,
 * instantiated per kind with the registry's content, so a field added to,
 * renamed in or retyped in either is a compile error in the other.
 */
describe('the core Resource is the Resource API’s Resource<C>', () => {
  it('is the API structure for each kind, with that kind’s content', () => {
    type Ur = Extract<Resource, { kind: 'ur' }>;
    expectTypeOf<Ur>().toExtend<ApiResource<Ur['content']>>();
    expectTypeOf<Resource>().toExtend<ApiResource>();
    expectTypeOf<keyof Resource>().toEqualTypeOf<keyof ApiResource>();
    expectTypeOf<Resource['kind']>().toEqualTypeOf<KindId>();
  });

  it('defaults the API structure’s content to unknown', () => {
    expectTypeOf<ApiResource['content']>().toEqualTypeOf<unknown>();
  });
});
