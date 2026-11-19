import type { JsonValue } from './json-value';

/**
 * `text` parsed as JSON, refused as text that is not JSON when a string in it,
 * a key or a value at any depth, escapes a lone UTF-16 surrogate (ADR 0160).
 * `JSON.parse` reads `"\ud800"` into a string that is not well formed, which
 * no UTF-8 file or store can hold and the Rust intake cannot read, so every
 * door that reads JSON text an author or a client wrote reads it here.
 *
 * Text decoded from UTF-8 holds no lone surrogate of its own, so an escape is
 * the only way one arrives.
 *
 * @throws SyntaxError when `text` is not JSON, or holds such a string.
 */
export function parseJsonText(text: string): JsonValue {
  // `JSON.parse` calls the reviver once for every value, every array element
  // and the root (under the key `""`) included, so every key and every string
  // value passes through it. The root comes last, so the value it saw last is
  // what `JSON.parse` answers, typed, where its own answer is `any`.
  let root: JsonValue = null;
  JSON.parse(text, (key: string, value: JsonValue): JsonValue => {
    if (!key.isWellFormed() || (isString(value) && !value.isWellFormed())) {
      throw new SyntaxError('A JSON string escapes a lone UTF-16 surrogate');
    }
    root = value;
    return value;
  });
  return root;
}

const isString = (value: JsonValue): value is string => typeof value === 'string';
