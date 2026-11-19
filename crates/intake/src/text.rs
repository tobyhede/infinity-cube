//! The string rules intake shares with the TypeScript one: JavaScript's
//! whitespace, a Resource's Title normalization (ADR 0083), and the order
//! strings are compared in.

use std::cmp::Ordering;

/// Whether `ch` is what JavaScript's `String.prototype.trim` removes: its
/// WhiteSpace (tab, vertical tab, form feed, U+FEFF and every space separator)
/// and its LineTerminators. Not Rust's `char::is_whitespace`, which adds U+0085
/// and leaves out U+FEFF.
#[must_use]
pub fn is_js_whitespace(ch: char) -> bool {
    matches!(
        ch,
        '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'
            ..='\u{200a}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202f}'
                | '\u{205f}'
                | '\u{3000}'
                | '\u{feff}'
    )
}

/// A Resource's Title as it is stored (ADR 0083): CRLF and a lone CR fold to
/// LF, every line loses its trailing whitespace, leading and trailing blank
/// lines are dropped, and interior blank lines are kept.
#[must_use]
pub fn normalize_title(title: &str) -> String {
    let folded = title.replace("\r\n", "\n").replace('\r', "\n");
    let lines: Vec<&str> = folded
        .split('\n')
        .map(|line| line.trim_end_matches(is_js_whitespace))
        .collect();
    let first = lines.iter().position(|line| !line.is_empty());
    let last = lines.iter().rposition(|line| !line.is_empty());
    match (first, last) {
        (Some(first), Some(last)) => lines.get(first..=last).unwrap_or_default().join("\n"),
        _ => String::new(),
    }
}

/// Whether `text` is unchanged by JavaScript's `trim`.
#[must_use]
pub fn is_js_trimmed(text: &str) -> bool {
    text.trim_matches(is_js_whitespace).len() == text.len()
}

/// Order two strings by UTF-16 code unit, as JavaScript's `<` does and as the
/// TypeScript intake's `compareOrdinal` orders directory and file names and a
/// Space's Resources (by Title, then id) in the Space reference cycle walk.
///
/// Not Rust's `str` order, which is by code point: the two differ where a
/// character from U+E000 to U+FFFF meets one beyond U+FFFF.
#[must_use]
pub fn compare_utf16(left: &str, right: &str) -> Ordering {
    left.encode_utf16().cmp(right.encode_utf16())
}

#[cfg(test)]
mod tests {
    use super::*;

    mod given_titles {
        use super::*;

        #[test]
        fn normalizes_as_the_typescript_intake_does() {
            assert_eq!(
                normalize_title("\n  \r\nName \t\r\n\r\n  Sub\u{feff}\r  \n"),
                "Name\n\n  Sub",
                "line endings fold, trailing whitespace and outer blank lines go, inner ones stay"
            );
            assert_eq!(normalize_title(" \n\t "), "", "whitespace alone is nothing");
            assert_eq!(
                normalize_title("A\u{85}"),
                "A\u{85}",
                "U+0085 is not JavaScript whitespace"
            );
        }
    }

    mod given_utf16_order {
        use super::*;

        #[test]
        fn orders_by_code_unit_not_code_point() {
            assert_eq!(
                compare_utf16("\u{ff61}", "\u{1f600}"),
                Ordering::Greater,
                "U+FF61 is a higher code unit than a surrogate"
            );
            assert_eq!(
                "\u{ff61}".cmp("\u{1f600}"),
                Ordering::Less,
                "while Rust's order is by code point"
            );
        }
    }
}
