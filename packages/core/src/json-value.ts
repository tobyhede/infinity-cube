/* v8 ignore next -- V8 attributes ESM module initialization to this import as a function. */
import { z } from 'zod';

/**
 * A value JSON can carry. Map content is held as one (ADR 0142): the host
 * stores, compares and carries it whole without reading it, and only the
 * plugin's own schema says what it means.
 */
export type JsonValue = string | number | boolean | null | JsonArray | JsonObject;

/**
 * A JSON array. An interface, so the type is recursive by name, and mutable,
 * so it is its own image under Hono's `JSONParsed` and the HTTP application's
 * inferred contract still names the snapshot type itself
 * (`packages/http/test/space-http-app-types.test.ts`).
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- recursive by name, see above
export interface JsonArray extends Array<JsonValue> {}

/** A JSON object, mutable for the same reason. */
export interface JsonObject {
  [key: string]: JsonValue;
}

/**
 * The parser of a JSON value, finite numbers only, so it encodes back as read.
 * An object with an own `__proto__` key is refused rather than parsed, since a
 * record parse would drop that key and the value would not encode back as read.
 */
export const jsonValueSchema: z.ZodType<JsonValue, z.ZodTypeDef, unknown> = z.lazy(() =>
  z
    .unknown()
    .superRefine((value, context) => {
      if (value instanceof Object && Object.hasOwn(value, '__proto__')) {
        context.addIssue({ code: 'custom', message: 'A JSON object with no __proto__ key.' });
      }
    })
    .pipe(
      z.union([
        z.string(),
        z.number().finite(),
        z.boolean(),
        z.null(),
        z.array(jsonValueSchema),
        z.record(jsonValueSchema),
      ]),
    ),
);

/**
 * Whether two JSON values are the same value, key order aside: an Edit that
 * writes the value a Map entry already holds is `unchanged`.
 */
export function sameJsonValue(left: JsonValue, right: JsonValue): boolean {
  if (left === right) return true;
  if (left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    const rightItems: readonly JsonValue[] = right;
    return (
      left.length === rightItems.length &&
      left.every((item: JsonValue, index) => {
        const other = rightItems[index];
        return other !== undefined && sameJsonValue(item, other);
      })
    );
  }
  if (!isJsonObject(left) || !isJsonObject(right)) return false;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => {
    const leftValue = left[key];
    const rightValue = right[key];
    return (
      leftValue !== undefined && rightValue !== undefined && sameJsonValue(leftValue, rightValue)
    );
  });
}

/**
 * `value` with every object's keys inserted in code-unit order, at every
 * depth: the one canonical form of a JSON value nothing here reads. A
 * JavaScript object still lists integer-like keys first, ascending, so that
 * is the order such keys are written in. A store need not keep key order —
 * PostgreSQL's `jsonb` does not — so a value Export writes unread would
 * otherwise come back in whatever order its store answered.
 */
export function canonicalJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  return isJsonObject(value) ? canonicalJsonObject(value) : value;
}

/** A JSON object in {@link canonicalJsonValue}'s form. */
export const canonicalJsonObject = (value: JsonObject): JsonObject =>
  Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => [key, canonicalJsonValue(entry)]),
  );

const isJsonObject = (value: JsonValue): value is JsonObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
