import { describe, expectTypeOf, it } from 'vitest';
import type { Resource as ApiResource } from '@project/resource-api/domain';
import type { JsonValue, Resource } from '../src/index';

/**
 * ADR 0142: the Resource API's `Resource<C>` is the one structure the core,
 * the stores, HTTP and plugins take. The core's Resource is that structure,
 * its content JSON the host carries unread, so a field added to, renamed in
 * or retyped in either is a compile error in the other.
 */
describe('the core Resource is the Resource API’s Resource<C>', () => {
  it('is the API structure with JSON content', () => {
    expectTypeOf<Resource>().toExtend<ApiResource<JsonValue>>();
    expectTypeOf<Resource>().toExtend<ApiResource>();
    expectTypeOf<keyof Resource>().toEqualTypeOf<keyof ApiResource>();
    // No kind is named in the host: a kind is whatever string a plugin draws (ADR 0142).
    expectTypeOf<Resource['kind']>().toEqualTypeOf<string>();
    expectTypeOf<Resource['content']>().toEqualTypeOf<JsonValue>();
  });

  it('defaults the API structure’s content to unknown', () => {
    expectTypeOf<ApiResource['content']>().toEqualTypeOf<unknown>();
  });
});
