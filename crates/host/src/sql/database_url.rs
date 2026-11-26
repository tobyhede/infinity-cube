//! `DATABASE_URL`, as the PostgreSQL store is given it (ADR 0177): read once
//! by `main` before the runtime starts, the process environment winning and
//! the nearest `.env` at or above the current directory filling it when it is
//! unset, trimmed, and refused naming the variable when unset or blank. The
//! store reads no environment.
//!
//! The `.env` is read without writing the process environment, and nothing
//! but `DATABASE_URL` is taken from it. It is parsed as Node's `dotenv`
//! 17.4.2 parses one (`parse` in its `lib/main.js`, which `src/prisma/db.ts`
//! reaches through `config()` with no `dotenv-expand`): no variable is
//! substituted and a line it does not match is skipped, as
//! `tests/postgres_url.rs` holds. TypeScript's search starts at its
//! module's directory (`src/prisma/db.ts`), which a binary has not, so this
//! one starts where it is run: an accepted difference.

use std::path::{Path, PathBuf};

/// The variable naming the database.
pub const DATABASE_URL: &str = "DATABASE_URL";

/// A database URL that names something: trimmed, and not blank.
#[derive(Clone, PartialEq, Eq)]
pub struct DatabaseUrl(String);

impl std::fmt::Debug for DatabaseUrl {
    // A URL may carry a password, so it is never printed.
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("DatabaseUrl(..)")
    }
}

/// Why no database URL was found.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum DatabaseUrlError {
    /// Neither the environment nor a `.env` names one, or it is blank.
    #[error("DATABASE_URL must name the PostgreSQL database")]
    Unset,
    /// The nearest `.env` could not be read.
    #[error("the .env file {} could not be read: {reason}", path.display())]
    Unreadable {
        /// The file.
        path: PathBuf,
        /// Why.
        reason: String,
    },
}

impl DatabaseUrl {
    /// The URL `variable` names, or failing that the one the nearest `.env`
    /// at or above `from` names, trimmed.
    ///
    /// # Errors
    ///
    /// [`DatabaseUrlError::Unset`] when neither names one that is not blank,
    /// and [`DatabaseUrlError::Unreadable`] when the `.env` is consulted and
    /// cannot be read.
    pub fn resolve(variable: Option<String>, from: &Path) -> Result<Self, DatabaseUrlError> {
        let value = match variable {
            Some(value) => Some(value),
            None => match nearest_env_file(from) {
                Some(path) => from_env_file(&path)?,
                None => None,
            },
        };
        Self::parse(value.as_deref())
    }

    /// The URL `value` names, trimmed as JavaScript's `trim` trims it.
    ///
    /// # Errors
    ///
    /// [`DatabaseUrlError::Unset`] when `value` is absent or blank.
    pub fn parse(value: Option<&str>) -> Result<Self, DatabaseUrlError> {
        match value.map(|text| text.trim_matches(is_space)) {
            Some(trimmed) if !trimmed.is_empty() => Ok(Self(trimmed.to_owned())),
            _ => Err(DatabaseUrlError::Unset),
        }
    }

    /// The URL, as text.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// The nearest `.env` at or above `from`, or `None` when no directory on the
/// way to the filesystem root holds one (`repositoryEnvPath`).
#[must_use]
pub fn nearest_env_file(from: &Path) -> Option<PathBuf> {
    from.ancestors()
        .map(|directory| directory.join(".env"))
        .find(|candidate| candidate.is_file())
}

/// `DATABASE_URL` as the `.env` at `path` names it, if it does: the last
/// entry naming it, as `dotenv` keeps the last.
fn from_env_file(path: &Path) -> Result<Option<String>, DatabaseUrlError> {
    let bytes = std::fs::read(path).map_err(|error| DatabaseUrlError::Unreadable {
        path: path.to_path_buf(),
        reason: error.to_string(),
    })?;
    // Node decodes the file as UTF-8, replacing what is not.
    let source = String::from_utf8_lossy(&bytes);
    Ok(dotenv_entries(&source)
        .into_iter()
        .filter(|(key, _)| key == DATABASE_URL)
        .map(|(_, value)| value)
        .next_back())
}

/// The entries `dotenv` 17.4.2's `parse` reads from `source`, in order.
///
/// `parse` runs one regular expression, global and multiline, over the
/// source with its line breaks made `\n`:
///
/// ```text
/// (?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)
/// ```
///
/// This scanner answers what that expression matches, without a regular
/// expression engine. Once the separator has matched, the rest of the
/// expression always matches (the value is optional and an empty one is
/// followed by a `#`, a line break or the end), so a match is decided by its
/// key and separator, and only a quoted value backtracks.
fn dotenv_entries(source: &str) -> Vec<(String, String)> {
    let text: Vec<char> = source
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .chars()
        .collect();
    let mut entries = Vec::new();
    let mut at = 0;
    while at <= text.len() {
        if !starts_line(&text, at) {
            at += 1;
            continue;
        }
        if let Some((key, raw, end)) = entry_at(&text, at) {
            entries.push((key, value_of(&raw)));
            at = end;
        } else {
            // A match starting anywhere in the whitespace `\s*` skips from
            // here would skip to the same character and fail as this one
            // did, so the scan goes on from that character: each run of
            // whitespace is skipped once, which keeps the scan linear.
            at = skip_space(&text, at).max(at + 1);
        }
    }
    entries
}

/// The key, the raw value and where the match ends, for a match starting at
/// `start`, a line's start.
fn entry_at(text: &[char], start: usize) -> Option<(String, String, usize)> {
    let first = skip_space(text, start);
    let (key, value_start) =
        exported_key(text, first).or_else(|| key_and_separator(text, first))?;
    let (raw, end) = value_at(text, value_start);
    Some((span(text, key.0, key.1), raw, end))
}

/// `export\s+` and then a key, when the source has them at `at`.
fn exported_key(text: &[char], at: usize) -> Option<((usize, usize), usize)> {
    let word: Vec<char> = "export".chars().collect();
    let after = at + word.len();
    if text.get(at..after)? != word.as_slice() || !text.get(after).copied().is_some_and(is_space) {
        return None;
    }
    key_and_separator(text, skip_space(text, after))
}

/// `([\w.-]+)(?:\s*=\s*?|:\s+?)` at `at`: the key's bounds and where the
/// value may start. The lazy whitespace matches as little as it may, since
/// what follows always matches.
fn key_and_separator(text: &[char], at: usize) -> Option<((usize, usize), usize)> {
    let mut end = at;
    while text.get(end).copied().is_some_and(is_key) {
        end += 1;
    }
    if end == at {
        return None;
    }
    let equals = skip_space(text, end);
    if text.get(equals) == Some(&'=') {
        return Some(((at, end), equals + 1));
    }
    if text.get(end) == Some(&':') && text.get(end + 1).copied().is_some_and(is_space) {
        return Some(((at, end), end + 2));
    }
    None
}

/// The value's raw text from `at` and where the match ends: a quoted value,
/// tried in the expression's order, else the unquoted rest of the line, else
/// none.
fn value_at(text: &[char], at: usize) -> (String, usize) {
    for quote in ['\'', '"', '`'] {
        let open = skip_space(text, at);
        if text.get(open) != Some(&quote) {
            continue;
        }
        for close in closing_quotes(text, open, quote).into_iter().rev() {
            if let Some(end) = rest_of_line(text, close + 1) {
                return (span(text, at, close + 1), end);
            }
        }
    }
    let unquoted = first_from(text, at, |c| matches!(c, '#' | '\r' | '\n'));
    let end = rest_of_line(text, unquoted).unwrap_or(unquoted);
    (span(text, at, unquoted), end)
}

/// Where `(?:\\q|[^q])*q` may close a body opened at `open`, nearest first:
/// each quote after a backslash, which the expression may take as escaped or
/// as closing, up to the first quote after none, where it must close.
fn closing_quotes(text: &[char], open: usize, quote: char) -> Vec<usize> {
    let mut closes = Vec::new();
    for at in open + 1..text.len() {
        if char_at(text, at) == Some(quote) {
            closes.push(at);
            if !(at > open + 1 && char_at(text, at - 1) == Some('\\')) {
                break;
            }
        }
    }
    closes
}

/// `\s*(?:#.*)?(?:$|$)` at `at`, the greedy whitespace giving back one
/// character at a time: where the match ends, or `None` when it cannot.
fn rest_of_line(text: &[char], at: usize) -> Option<usize> {
    let furthest = skip_space(text, at);
    (at..=furthest).rev().find_map(|end| match text.get(end) {
        Some('#') => Some(first_from(text, end, ends_line)),
        Some(&c) if ends_line(c) => Some(end),
        None => Some(end),
        Some(_) => None,
    })
}

/// The value `parse` stores for `raw`: trimmed, its surrounding quotes
/// removed, and `\n` and `\r` made line breaks when it began with `"`.
fn value_of(raw: &str) -> String {
    let trimmed = raw.trim_matches(is_space);
    let stripped = strip_quotes(trimmed);
    if trimmed.starts_with('"') {
        stripped.replace("\\n", "\n").replace("\\r", "\r")
    } else {
        stripped
    }
}

/// `value.replace(/^(['"`])([\s\S]*)\1$/mg, '$2')`.
fn strip_quotes(value: &str) -> String {
    let text: Vec<char> = value.chars().collect();
    let mut stripped = String::new();
    let mut at = 0;
    while let Some(quote) = char_at(&text, at) {
        let close = (starts_line(&text, at) && matches!(quote, '\'' | '"' | '`'))
            .then(|| {
                (at + 1..text.len()).rev().find(|&close| {
                    char_at(&text, close) == Some(quote)
                        && char_at(&text, close + 1).is_none_or(ends_line)
                })
            })
            .flatten();
        match close {
            Some(close) => {
                stripped.push_str(&span(&text, at + 1, close));
                at = close + 1;
            }
            None => {
                stripped.push(quote);
                at += 1;
            }
        }
    }
    stripped
}

fn char_at(text: &[char], at: usize) -> Option<char> {
    text.get(at).copied()
}

/// The text from `from` up to `to`.
fn span(text: &[char], from: usize, to: usize) -> String {
    text.get(from..to)
        .map(|chars| chars.iter().collect())
        .unwrap_or_default()
}

/// The first position at or after `from` holding a character `stop` takes,
/// or the end.
fn first_from(text: &[char], from: usize, stop: impl Fn(char) -> bool) -> usize {
    (from..text.len())
        .find(|&at| char_at(text, at).is_some_and(&stop))
        .unwrap_or(text.len())
}

fn skip_space(text: &[char], mut at: usize) -> usize {
    while text.get(at).copied().is_some_and(is_space) {
        at += 1;
    }
    at
}

/// `^` in a multiline JavaScript expression.
fn starts_line(text: &[char], at: usize) -> bool {
    at == 0 || text.get(at - 1).copied().is_some_and(ends_line)
}

/// A JavaScript line terminator, which `$` stops before and `.` does not
/// match.
fn ends_line(c: char) -> bool {
    matches!(c, '\n' | '\r' | '\u{2028}' | '\u{2029}')
}

/// `[\w.-]`.
fn is_key(c: char) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '-')
}

/// JavaScript's `\s`, which is also what `String.prototype.trim` removes.
fn is_space(c: char) -> bool {
    matches!(
        c,
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
