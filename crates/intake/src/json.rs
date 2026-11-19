//! JSON as the TypeScript intake reads it: `JSON.parse` over text decoded as
//! UTF-8 with replacement, into values whose numbers are IEEE 754 doubles.
//!
//! A parser of its own rather than `serde_json::Value`, because the answers
//! intake gives depend on `JSON.parse`'s: a number too large for a double is
//! `Infinity` (which the schemas then refuse as not finite) rather than a
//! syntax error, every number is a double, and a key written twice keeps its
//! first position and its last value.

use std::collections::HashMap;
use std::fmt;

/// A JSON value, with every number held as JavaScript holds it, a double.
///
/// An object keeps its keys in the order they were first written; a key
/// written twice keeps its first position and its last value. `JSON.parse`
/// gives integer-like keys (array indices) first and ascending, and the rest
/// in that order, so `{"b": 1, "1": 2}` lists `b` then `1` here and `1` then
/// `b` in JavaScript. Intake's answers do not depend on the order; a writer
/// that must list keys as JavaScript does orders them itself.
#[derive(Debug, Clone, PartialEq)]
pub enum JsonValue {
    /// `null`.
    Null,
    /// `true` or `false`.
    Bool(bool),
    /// A number, as the double JavaScript parses it to; it may be infinite.
    Number(f64),
    /// A string.
    String(String),
    /// An array.
    Array(Vec<JsonValue>),
    /// An object.
    Object(JsonObject),
}

impl JsonValue {
    /// The object this value is, if it is one.
    #[must_use]
    pub fn as_object(&self) -> Option<&JsonObject> {
        match self {
            Self::Object(object) => Some(object),
            _ => None,
        }
    }

    /// The string this value is, if it is one.
    #[must_use]
    pub fn as_str(&self) -> Option<&str> {
        match self {
            Self::String(text) => Some(text),
            _ => None,
        }
    }

    /// The number this value is, if it is one.
    #[must_use]
    pub fn as_f64(&self) -> Option<f64> {
        match self {
            Self::Number(number) => Some(*number),
            _ => None,
        }
    }

    /// The name of this value's type, as Zod reports a received type.
    #[must_use]
    pub fn type_name(&self) -> &'static str {
        match self {
            Self::Null => "null",
            Self::Bool(_) => "boolean",
            Self::Number(_) => "number",
            Self::String(_) => "string",
            Self::Array(_) => "array",
            Self::Object(_) => "object",
        }
    }
}

/// A JSON object: its entries, each key once, in the order first written.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct JsonObject {
    entries: Vec<(String, JsonValue)>,
}

impl JsonObject {
    /// The value under `key`, if the object has one.
    #[must_use]
    pub fn get(&self, key: &str) -> Option<&JsonValue> {
        self.entries
            .iter()
            .find_map(|(name, value)| (name == key).then_some(value))
    }

    /// Whether the object has the key `key`.
    #[must_use]
    pub fn contains_key(&self, key: &str) -> bool {
        self.entries.iter().any(|(name, _)| name == key)
    }

    /// The entries, in the order their keys were first written.
    pub fn iter(&self) -> impl ExactSizeIterator<Item = (&str, &JsonValue)> {
        self.entries
            .iter()
            .map(|(key, value)| (key.as_str(), value))
    }

    /// How many entries the object has.
    #[must_use]
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// Whether the object has no entries.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

impl FromIterator<(String, JsonValue)> for JsonObject {
    /// An object of these entries; a key given twice keeps its first position and its last value.
    fn from_iter<I: IntoIterator<Item = (String, JsonValue)>>(entries: I) -> Self {
        let mut builder = ObjectBuilder::default();
        for (key, value) in entries {
            builder.insert(key, value);
        }
        builder.finish()
    }
}

/// Why text is not JSON.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("{reason} at byte {offset}")]
pub struct JsonError {
    /// The byte offset into the text at which it stopped being JSON.
    pub offset: usize,
    /// What was wrong there.
    pub reason: &'static str,
}

/// How deeply arrays and objects may nest before the text is refused rather
/// than parsed, so a hostile file cannot exhaust the stack.
///
/// Parsing, the schemas, and cloning, comparing and dropping a value all
/// recurse, so the limit protects a thread with enough stack, not any: run
/// intake on a thread with at least 1 MiB of it (a tokio worker has 2 MiB).
/// `tests/robustness.rs` imports a file nested to this limit on 1 MiB, in a
/// debug build.
pub const MAX_DEPTH: usize = 512;

/// Text as a file read as UTF-8 gives it to the TypeScript intake: a malformed
/// sequence becomes U+FFFD and a byte order mark is kept.
#[must_use]
pub fn decode_text(bytes: &[u8]) -> std::borrow::Cow<'_, str> {
    String::from_utf8_lossy(bytes)
}

/// Parse `text` as `JSON.parse` does.
///
/// # Errors
///
/// Returns a [`JsonError`] when `text` is not one JSON value surrounded only by
/// JSON whitespace, when a string escapes a lone UTF-16 surrogate (which a Rust
/// string cannot hold), or when arrays and objects nest deeper than
/// [`MAX_DEPTH`].
pub fn parse(text: &str) -> Result<JsonValue, JsonError> {
    let mut parser = Parser {
        bytes: text.as_bytes(),
        text,
        at: 0,
    };
    parser.skip_whitespace();
    let value = parser.value(0)?;
    parser.skip_whitespace();
    if parser.at != parser.bytes.len() {
        return Err(parser.error("unexpected text after the value"));
    }
    Ok(value)
}

/// Collects an object's entries, keeping a key's first position and last value.
#[derive(Default)]
struct ObjectBuilder {
    entries: Vec<(String, JsonValue)>,
    /// Built once an object grows past a few keys, so a large one stays linear.
    index: Option<HashMap<String, usize>>,
}

impl ObjectBuilder {
    const INDEX_FROM: usize = 16;

    fn insert(&mut self, key: String, value: JsonValue) {
        let existing = match &self.index {
            Some(index) => index.get(&key).copied(),
            None => self.entries.iter().position(|(name, _)| *name == key),
        };
        if let Some(position) = existing {
            if let Some(entry) = self.entries.get_mut(position) {
                entry.1 = value;
            }
            return;
        }
        if let Some(index) = &mut self.index {
            index.insert(key.clone(), self.entries.len());
        } else if self.entries.len() >= Self::INDEX_FROM {
            let mut index: HashMap<String, usize> = self
                .entries
                .iter()
                .enumerate()
                .map(|(position, (name, _))| (name.clone(), position))
                .collect();
            index.insert(key.clone(), self.entries.len());
            self.index = Some(index);
        }
        self.entries.push((key, value));
    }

    fn finish(self) -> JsonObject {
        JsonObject {
            entries: self.entries,
        }
    }
}

struct Parser<'a> {
    bytes: &'a [u8],
    text: &'a str,
    at: usize,
}

impl Parser<'_> {
    fn error(&self, reason: &'static str) -> JsonError {
        JsonError {
            offset: self.at,
            reason,
        }
    }

    fn peek(&self) -> Option<u8> {
        self.bytes.get(self.at).copied()
    }

    fn skip_whitespace(&mut self) {
        while let Some(b' ' | b'\t' | b'\n' | b'\r') = self.peek() {
            self.at += 1;
        }
    }

    fn expect_word(&mut self, word: &[u8], value: JsonValue) -> Result<JsonValue, JsonError> {
        if self.bytes.get(self.at..self.at + word.len()) == Some(word) {
            self.at += word.len();
            Ok(value)
        } else {
            Err(self.error("unexpected token"))
        }
    }

    fn value(&mut self, depth: usize) -> Result<JsonValue, JsonError> {
        match self.peek() {
            Some(b'{') => self.object(depth + 1),
            Some(b'[') => self.array(depth + 1),
            Some(b'"') => self.string().map(JsonValue::String),
            Some(b't') => self.expect_word(b"true", JsonValue::Bool(true)),
            Some(b'f') => self.expect_word(b"false", JsonValue::Bool(false)),
            Some(b'n') => self.expect_word(b"null", JsonValue::Null),
            Some(b'-' | b'0'..=b'9') => self.number(),
            Some(_) => Err(self.error("unexpected token")),
            None => Err(self.error("unexpected end of text")),
        }
    }

    fn array(&mut self, depth: usize) -> Result<JsonValue, JsonError> {
        if depth > MAX_DEPTH {
            return Err(self.error("nested too deeply"));
        }
        self.at += 1;
        let mut items = Vec::new();
        self.skip_whitespace();
        if self.peek() == Some(b']') {
            self.at += 1;
            return Ok(JsonValue::Array(items));
        }
        loop {
            self.skip_whitespace();
            items.push(self.value(depth)?);
            self.skip_whitespace();
            match self.peek() {
                Some(b',') => self.at += 1,
                Some(b']') => {
                    self.at += 1;
                    return Ok(JsonValue::Array(items));
                }
                Some(_) => return Err(self.error("expected , or ]")),
                None => return Err(self.error("unexpected end of text")),
            }
        }
    }

    fn object(&mut self, depth: usize) -> Result<JsonValue, JsonError> {
        if depth > MAX_DEPTH {
            return Err(self.error("nested too deeply"));
        }
        self.at += 1;
        let mut builder = ObjectBuilder::default();
        self.skip_whitespace();
        if self.peek() == Some(b'}') {
            self.at += 1;
            return Ok(JsonValue::Object(builder.finish()));
        }
        loop {
            self.skip_whitespace();
            if self.peek() != Some(b'"') {
                return Err(self.error("expected a string key"));
            }
            let key = self.string()?;
            self.skip_whitespace();
            if self.peek() != Some(b':') {
                return Err(self.error("expected :"));
            }
            self.at += 1;
            self.skip_whitespace();
            let value = self.value(depth)?;
            builder.insert(key, value);
            self.skip_whitespace();
            match self.peek() {
                Some(b',') => self.at += 1,
                Some(b'}') => {
                    self.at += 1;
                    return Ok(JsonValue::Object(builder.finish()));
                }
                Some(_) => return Err(self.error("expected , or }")),
                None => return Err(self.error("unexpected end of text")),
            }
        }
    }

    fn digits(&mut self) -> usize {
        let start = self.at;
        while let Some(b'0'..=b'9') = self.peek() {
            self.at += 1;
        }
        self.at - start
    }

    fn number(&mut self) -> Result<JsonValue, JsonError> {
        let start = self.at;
        if self.peek() == Some(b'-') {
            self.at += 1;
        }
        match self.peek() {
            Some(b'0') => self.at += 1,
            Some(b'1'..=b'9') => {
                self.digits();
            }
            _ => return Err(self.error("expected a digit")),
        }
        if self.peek() == Some(b'.') {
            self.at += 1;
            if self.digits() == 0 {
                return Err(self.error("expected a digit after the decimal point"));
            }
        }
        if let Some(b'e' | b'E') = self.peek() {
            self.at += 1;
            if let Some(b'+' | b'-') = self.peek() {
                self.at += 1;
            }
            if self.digits() == 0 {
                return Err(self.error("expected a digit in the exponent"));
            }
        }
        // Rust's parse is correctly rounded, as JavaScript's is, and answers an
        // infinity for a magnitude beyond the largest double, as JavaScript does.
        self.text
            .get(start..self.at)
            .and_then(|literal| literal.parse::<f64>().ok())
            .map(JsonValue::Number)
            .ok_or(JsonError {
                offset: start,
                reason: "not a number",
            })
    }

    fn hex4(&mut self) -> Result<u32, JsonError> {
        let mut code = 0u32;
        for _ in 0..4 {
            let digit = match self.peek() {
                Some(byte @ b'0'..=b'9') => u32::from(byte - b'0'),
                Some(byte @ b'a'..=b'f') => u32::from(byte - b'a') + 10,
                Some(byte @ b'A'..=b'F') => u32::from(byte - b'A') + 10,
                _ => return Err(self.error("expected four hexadecimal digits")),
            };
            code = code * 16 + digit;
            self.at += 1;
        }
        Ok(code)
    }

    fn string(&mut self) -> Result<String, JsonError> {
        self.at += 1;
        let mut out = String::new();
        let mut run = self.at;
        loop {
            match self.peek() {
                None => return Err(self.error("unterminated string")),
                Some(b'"') => {
                    out.push_str(self.text.get(run..self.at).unwrap_or_default());
                    self.at += 1;
                    return Ok(out);
                }
                Some(0..=0x1f) => return Err(self.error("control character in string")),
                Some(b'\\') => {
                    out.push_str(self.text.get(run..self.at).unwrap_or_default());
                    self.at += 1;
                    self.escape(&mut out)?;
                    run = self.at;
                }
                Some(_) => self.at += 1,
            }
        }
    }

    fn escape(&mut self, out: &mut String) -> Result<(), JsonError> {
        let byte = self
            .peek()
            .ok_or_else(|| self.error("unterminated string"))?;
        self.at += 1;
        let ch = match byte {
            b'"' => '"',
            b'\\' => '\\',
            b'/' => '/',
            b'b' => '\u{8}',
            b'f' => '\u{c}',
            b'n' => '\n',
            b'r' => '\r',
            b't' => '\t',
            b'u' => return self.unicode_escape(out),
            _ => return Err(self.error("invalid escape")),
        };
        out.push(ch);
        Ok(())
    }

    fn unicode_escape(&mut self, out: &mut String) -> Result<(), JsonError> {
        let first = self.hex4()?;
        let code = match first {
            0xD800..=0xDBFF => {
                if self.bytes.get(self.at..self.at + 2) != Some(b"\\u") {
                    return Err(self.error("lone surrogate"));
                }
                self.at += 2;
                let second = self.hex4()?;
                if !(0xDC00..=0xDFFF).contains(&second) {
                    return Err(self.error("lone surrogate"));
                }
                0x10000 + ((first - 0xD800) << 10) + (second - 0xDC00)
            }
            0xDC00..=0xDFFF => return Err(self.error("lone surrogate")),
            code => code,
        };
        let ch = char::from_u32(code).ok_or_else(|| self.error("lone surrogate"))?;
        out.push(ch);
        Ok(())
    }
}

impl fmt::Display for JsonValue {
    /// The value as compact JSON, for messages; not the bytes Export writes.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Null => f.write_str("null"),
            Self::Bool(value) => write!(f, "{value}"),
            Self::Number(value) => write!(f, "{value}"),
            Self::String(value) => write!(f, "{value:?}"),
            Self::Array(items) => {
                f.write_str("[")?;
                for (index, item) in items.iter().enumerate() {
                    if index > 0 {
                        f.write_str(",")?;
                    }
                    write!(f, "{item}")?;
                }
                f.write_str("]")
            }
            Self::Object(object) => {
                f.write_str("{")?;
                for (index, (key, value)) in object.iter().enumerate() {
                    if index > 0 {
                        f.write_str(",")?;
                    }
                    write!(f, "{key:?}:{value}")?;
                }
                f.write_str("}")
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn number(text: &str) -> f64 {
        parse(text).unwrap().as_f64().unwrap()
    }

    mod given_numbers {
        use super::*;

        #[test]
        fn reads_every_number_as_a_double() {
            assert_eq!(number("1.0"), 1.0, "1.0 should be the double 1");
            assert_eq!(
                number("9007199254740993"),
                9_007_199_254_740_992.0,
                "an integer beyond 2^53 should round as JavaScript rounds it"
            );
        }

        #[test]
        fn reads_an_overflowing_number_as_infinity() {
            assert_eq!(number("1e400"), f64::INFINITY, "1e400 should be Infinity");
            assert_eq!(
                number("-1e400"),
                f64::NEG_INFINITY,
                "-1e400 should be -Infinity"
            );
        }

        #[test]
        fn refuses_what_json_parse_refuses() {
            for text in ["01", "-", "1.", ".5", "1e", "+1", "0x10", "NaN", "Infinity"] {
                assert!(parse(text).is_err(), "{text} should not be JSON");
            }
        }
    }

    mod given_strings {
        use super::*;

        #[test]
        fn decodes_escapes_and_surrogate_pairs() {
            let parsed = parse(r#""a\né😀\/""#).unwrap();
            assert_eq!(parsed.as_str(), Some("a\né😀/"), "escapes should decode");
        }

        #[test]
        fn refuses_a_lone_surrogate_and_a_raw_control_character() {
            assert!(
                parse(r#""\ud800""#).is_err(),
                "a lone surrogate should be refused"
            );
            assert!(
                parse("\"a\u{1}\"").is_err(),
                "a raw control character should be refused"
            );
        }
    }

    mod given_objects {
        use super::*;

        #[test]
        fn keeps_a_repeated_key_at_its_first_position_with_its_last_value() {
            let parsed = parse(r#"{"a":1,"b":2,"a":3}"#).unwrap();
            let entries: Vec<_> = parsed
                .as_object()
                .unwrap()
                .iter()
                .map(|(key, value)| (key.to_owned(), value.as_f64()))
                .collect();
            assert_eq!(
                entries,
                vec![("a".to_owned(), Some(3.0)), ("b".to_owned(), Some(2.0))],
                "a repeated key should keep its first position and last value"
            );
        }

        #[test]
        fn keeps_a_repeated_key_in_a_large_object_at_its_first_position() {
            let body: Vec<String> = (0..40).map(|n| format!("\"k{n}\":{n}")).collect();
            let text = format!("{{{},\"k3\":99}}", body.join(","));
            let parsed = parse(&text).unwrap();
            let object = parsed.as_object().unwrap();
            assert_eq!(object.len(), 40, "the repeat should not add an entry");
            assert_eq!(
                object.get("k3").and_then(JsonValue::as_f64),
                Some(99.0),
                "last value wins"
            );
            assert_eq!(
                object.iter().nth(3).map(|(key, _)| key),
                Some("k3"),
                "first position kept"
            );
        }

        #[test]
        fn refuses_trailing_commas_and_trailing_text() {
            for text in ["{\"a\":1,}", "[1,]", "{} x", "\u{feff}{}"] {
                assert!(parse(text).is_err(), "{text:?} should not be JSON");
            }
        }
    }

    mod given_deep_nesting {
        use super::*;

        #[test]
        fn refuses_beyond_the_limit_rather_than_exhausting_the_stack() {
            let deep = format!("{}{}", "[".repeat(MAX_DEPTH + 1), "]".repeat(MAX_DEPTH + 1));
            assert!(
                parse(&deep).is_err(),
                "nesting past the limit should be refused"
            );
            let fits = format!("{}{}", "[".repeat(MAX_DEPTH), "]".repeat(MAX_DEPTH));
            assert!(parse(&fits).is_ok(), "nesting at the limit should parse");
        }
    }
}
