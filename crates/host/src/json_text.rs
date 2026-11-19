//! JSON text as JavaScript writes it: `JSON.stringify`, compact for the wire
//! and indented by two spaces for a file, with every number written as
//! `Number.prototype.toString` writes it.
//!
//! Export's bytes are held to the TypeScript Export's byte for byte, so the
//! number spelling (`1e+21`, `1e-7`, `-0` as `0`), the string escapes and the
//! layout of an empty object or array are JavaScript's, not `serde_json`'s.

use std::fmt::Write as _;

use intake::json::JsonValue;

/// `value` as `JSON.stringify(value)` writes it.
#[must_use]
pub(crate) fn compact(value: &JsonValue) -> String {
    let mut out = String::new();
    write_value(&mut out, value, None, 0);
    out
}

/// `value` as `JSON.stringify(value, null, 2)` writes it, and a closing
/// newline: the form of every file Export writes.
#[must_use]
pub(crate) fn file_text(value: &JsonValue) -> String {
    let mut out = String::new();
    write_value(&mut out, value, Some(2), 0);
    out.push('\n');
    out
}

fn newline(out: &mut String, indent: Option<usize>, depth: usize) {
    if let Some(width) = indent {
        out.push('\n');
        out.extend(std::iter::repeat_n(' ', width * depth));
    }
}

fn write_value(out: &mut String, value: &JsonValue, indent: Option<usize>, depth: usize) {
    match value {
        JsonValue::Null => out.push_str("null"),
        JsonValue::Bool(true) => out.push_str("true"),
        JsonValue::Bool(false) => out.push_str("false"),
        JsonValue::Number(number) => write_number(out, *number),
        JsonValue::String(text) => write_string(out, text),
        JsonValue::Array(items) => {
            if items.is_empty() {
                out.push_str("[]");
                return;
            }
            out.push('[');
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                newline(out, indent, depth + 1);
                write_value(out, item, indent, depth + 1);
            }
            newline(out, indent, depth);
            out.push(']');
        }
        JsonValue::Object(object) => {
            if object.is_empty() {
                out.push_str("{}");
                return;
            }
            out.push('{');
            for (index, (key, item)) in object.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                newline(out, indent, depth + 1);
                write_string(out, key);
                out.push(':');
                if indent.is_some() {
                    out.push(' ');
                }
                write_value(out, item, indent, depth + 1);
            }
            newline(out, indent, depth);
            out.push('}');
        }
    }
}

/// A string as `JSON.stringify` quotes it: `"` and `\` escaped, the five
/// short control escapes, every other control character as `\u00xx`, and
/// nothing else escaped.
fn write_string(out: &mut String, text: &str) {
    out.push('"');
    for ch in text.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            control if u32::from(control) < 0x20 => {
                let _ = write!(out, "\\u{:04x}", u32::from(control));
            }
            other => out.push(other),
        }
    }
    out.push('"');
}

/// A number as `Number.prototype.toString` writes it (ECMA-262
/// `Number::toString`), from the shortest digits that read back as it.
/// `JSON.stringify` writes a non-finite number as `null`.
fn write_number(out: &mut String, number: f64) {
    if !number.is_finite() {
        out.push_str("null");
        return;
    }
    if number == 0.0 {
        out.push('0');
        return;
    }
    if number < 0.0 {
        out.push('-');
    }
    let (digits, exponent) = shortest_digits(number.abs());
    let k = i64::try_from(digits.len()).unwrap_or(i64::MAX);
    let n = exponent + 1;
    if k <= n && n <= 21 {
        out.push_str(&digits);
        out.extend(std::iter::repeat_n(
            '0',
            usize::try_from(n - k).unwrap_or_default(),
        ));
    } else if 0 < n && n <= 21 {
        let point = usize::try_from(n).unwrap_or_default();
        out.push_str(digits.get(..point).unwrap_or_default());
        out.push('.');
        out.push_str(digits.get(point..).unwrap_or_default());
    } else if -6 < n && n <= 0 {
        out.push_str("0.");
        out.extend(std::iter::repeat_n(
            '0',
            usize::try_from(-n).unwrap_or_default(),
        ));
        out.push_str(&digits);
    } else {
        let (first, rest) = digits.split_at(1.min(digits.len()));
        out.push_str(first);
        if !rest.is_empty() {
            out.push('.');
            out.push_str(rest);
        }
        let shown = n - 1;
        let _ = write!(out, "e{}{}", if shown < 0 { '-' } else { '+' }, shown.abs());
    }
}

/// A positive finite number's digits and exponent as `d.ddd × 10^exponent`,
/// chosen as ECMA-262 `Number::toString` chooses them: the fewest digits
/// that read back as the number, and of those the closest to it, a tie going
/// to the even last digit.
///
/// `{:e}` finds the fewest digits, but breaks a tie upward, so
/// `1000000000000000.25` would be written `…0.3` where JavaScript writes
/// `…0.2`. Rounding the number's exact value to that many digits (`{:.*e}`,
/// which rounds half to even) gives the closest; it is taken whenever it
/// reads back as the number, which it can fail to only where the number's
/// lower neighbour is nearer than its upper, at a power of two.
fn shortest_digits(number: f64) -> (String, i64) {
    let split = |scientific: &str| -> (String, i64) {
        let (mantissa, exponent) = scientific.split_once('e').unwrap_or((scientific, "0"));
        let digits: String = mantissa.chars().filter(char::is_ascii_digit).collect();
        (digits, exponent.parse().unwrap_or_default())
    };
    let shortest = format!("{number:e}");
    let (digits, exponent) = split(&shortest);
    let closest = format!("{number:.*e}", digits.len().saturating_sub(1));
    if closest != shortest && closest.parse::<f64>() == Ok(number) {
        let (closest_digits, closest_exponent) = split(&closest);
        let trimmed = closest_digits.trim_end_matches('0');
        let kept = if trimmed.is_empty() { "0" } else { trimmed };
        return (kept.to_owned(), closest_exponent);
    }
    (digits, exponent)
}

#[cfg(test)]
mod tests {
    use super::*;
    use intake::json::parse;

    fn number(value: f64) -> String {
        compact(&JsonValue::Number(value))
    }

    mod given_a_number {
        use super::*;

        #[test]
        fn writes_it_as_javascript_does() {
            for (value, expected) in [
                (0.0, "0"),
                (-0.0, "0"),
                (1.0, "1"),
                (-12.5, "-12.5"),
                (320.0, "320"),
                (0.1, "0.1"),
                (1.0 / 3.0, "0.3333333333333333"),
                (123_456_789_012_345_680_000.0, "123456789012345680000"),
                (1e21, "1e+21"),
                (1.5e21, "1.5e+21"),
                (0.000_001, "0.000001"),
                (1e-7, "1e-7"),
                (-2.5e-8, "-2.5e-8"),
                (f64::MAX, "1.7976931348623157e+308"),
                (5e-324, "5e-324"),
            ] {
                assert_eq!(number(value), expected, "{value:e} as JavaScript writes it");
            }
        }

        /// Each value lies exactly between two shortest spellings; each expected
        /// text is `JSON.stringify(value)` in Node 26.
        #[test]
        fn breaks_a_shortest_spelling_tie_to_the_even_digit() {
            for (value, expected) in [
                // A whole part and a fraction, each exact, as is their sum.
                (1e15 + 0.25, "1000000000000000.2"),
                (1e15 + 0.75, "1000000000000000.8"),
                (-(871_442_882_650_757.0 + 0.25), "-871442882650757.2"),
                (268_343_000_470_873.0 + 0.625, "268343000470873.62"),
                (24_741_265_280_724.0 + 0.8125, "24741265280724.812"),
                (1_748_830_814_480.0 + 0.781_25, "1748830814480.7812"),
            ] {
                assert_eq!(number(value), expected, "{value:e} as JavaScript writes it");
            }
        }
    }

    mod given_a_string {
        use super::*;

        #[test]
        fn escapes_it_as_json_stringify_does() {
            let value = JsonValue::String("q\"b\\\u{8}\u{c}\n\r\t\u{1}/é\u{2028}".into());
            assert_eq!(
                compact(&value),
                r#""q\"b\\\b\f\n\r\t\u0001/é ""#.replace("\\u2028", "\u{2028}"),
                "only quotes, backslashes and control characters are escaped"
            );
        }
    }

    mod given_a_file {
        use super::*;

        #[test]
        fn indents_it_by_two_spaces_with_a_closing_newline() {
            let value = parse(r#"{"a":[],"b":{},"c":[1,{"d":true}],"e":null}"#).unwrap();
            assert_eq!(
                file_text(&value),
                "{\n  \"a\": [],\n  \"b\": {},\n  \"c\": [\n    1,\n    {\n      \"d\": true\n    }\n  ],\n  \"e\": null\n}\n",
                "JSON.stringify(value, null, 2) and a newline"
            );
            assert_eq!(
                compact(&value),
                r#"{"a":[],"b":{},"c":[1,{"d":true}],"e":null}"#,
                "JSON.stringify(value)"
            );
        }
    }
}
