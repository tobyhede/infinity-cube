//! Shape checking as the TypeScript intake's Zod 3 schemas do it.
//!
//! The corpus compares one refusal per Zod issue, by its path, so a schema
//! here has to raise the issues Zod raises, no more and no fewer. Three Zod
//! rules decide that, and this module holds them in one place:
//!
//! - A value's parse is **valid**, **dirty** (issues raised, but the value was
//!   read) or **aborted** (the value could not be read). A wrong type or a
//!   missing required value aborts; a failed check (`min`, `uuid`, `finite`, a
//!   refinement) or a strict object's unknown keys only dirties.
//! - An object or array aborts when any of its members aborts, and each
//!   member is checked whatever its siblings answer.
//! - A refinement runs unless what it refines aborted; a transform runs only
//!   when what it transforms is valid.

use crate::json::{JsonObject, JsonValue};
use crate::refusal::ShapeProblem;

/// How far a parse got: Zod's `valid`, `dirty` and `aborted`, in that order.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) enum Status {
    Valid,
    Dirty,
    Aborted,
}

impl Status {
    /// The parse this status answers, `value` when it is valid.
    pub(crate) fn parsed<T>(self, value: T) -> Parsed<T> {
        match self {
            Self::Valid => Parsed::Valid(value),
            Self::Dirty => Parsed::Dirty,
            Self::Aborted => Parsed::Aborted,
        }
    }
}

/// What one schema's parse answers: the value, when it is valid.
#[derive(Debug)]
pub(crate) enum Parsed<T> {
    Valid(T),
    Dirty,
    Aborted,
}

impl<T> Parsed<T> {
    pub(crate) fn status(&self) -> Status {
        match self {
            Self::Valid(_) => Status::Valid,
            Self::Dirty => Status::Dirty,
            Self::Aborted => Status::Aborted,
        }
    }

    pub(crate) fn map<U>(self, f: impl FnOnce(T) -> U) -> Parsed<U> {
        match self {
            Self::Valid(value) => Parsed::Valid(f(value)),
            Self::Dirty => Parsed::Dirty,
            Self::Aborted => Parsed::Aborted,
        }
    }

    /// `self` dirtied, keeping an abort.
    fn dirtied(self) -> Self {
        match self {
            Self::Aborted => Self::Aborted,
            _ => Self::Dirty,
        }
    }
}

/// One Zod issue: where, as a path from the root of the value checked, and what.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct Issue {
    /// Segments joined with `.`, an index in decimal; `None` at the root.
    pub(crate) field: Option<String>,
    pub(crate) problem: ShapeProblem,
}

#[derive(Debug, Clone, Copy)]
enum Segment<'a> {
    Key(&'a str),
    Index(usize),
}

/// The path being checked and the issues raised so far.
#[derive(Debug, Default)]
pub(crate) struct Checker<'a> {
    path: Vec<Segment<'a>>,
    issues: Vec<Issue>,
}

impl<'a> Checker<'a> {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    /// The issues raised, consuming the checker.
    pub(crate) fn into_issues(self) -> Vec<Issue> {
        self.issues
    }

    /// Raise `problem` at the current path.
    pub(crate) fn issue(&mut self, problem: ShapeProblem) {
        let field = if self.path.is_empty() {
            None
        } else {
            let mut joined = String::new();
            for (index, segment) in self.path.iter().enumerate() {
                if index > 0 {
                    joined.push('.');
                }
                match segment {
                    Segment::Key(key) => joined.push_str(key),
                    Segment::Index(position) => joined.push_str(&position.to_string()),
                }
            }
            Some(joined)
        };
        self.issues.push(Issue { field, problem });
    }

    /// Check under the key `key`.
    pub(crate) fn key<R>(&mut self, key: &'a str, check: impl FnOnce(&mut Self) -> R) -> R {
        self.path.push(Segment::Key(key));
        let result = check(self);
        self.path.pop();
        result
    }

    /// Check under the index `index`.
    pub(crate) fn index<R>(&mut self, index: usize, check: impl FnOnce(&mut Self) -> R) -> R {
        self.path.push(Segment::Index(index));
        let result = check(self);
        self.path.pop();
        result
    }

    /// Raise the issue for a value of the wrong type, or absent, and abort.
    pub(crate) fn wrong_type<T>(
        &mut self,
        expected: &'static str,
        found: Option<&JsonValue>,
    ) -> Parsed<T> {
        self.issue(ShapeProblem::InvalidType {
            expected,
            received: found.map_or("undefined", JsonValue::type_name),
        });
        Parsed::Aborted
    }

    /// `z.string()`.
    pub(crate) fn string(&mut self, value: Option<&'a JsonValue>) -> Parsed<&'a str> {
        match value {
            Some(JsonValue::String(text)) => Parsed::Valid(text),
            other => self.wrong_type("string", other),
        }
    }

    /// `z.string().min(1)`.
    pub(crate) fn non_empty_string(&mut self, value: Option<&'a JsonValue>) -> Parsed<&'a str> {
        let parsed = self.string(value);
        self.refine(
            parsed,
            |text| !text.is_empty(),
            || ShapeProblem::TooSmall {
                of: "string",
                minimum: 1.0,
            },
        )
    }

    /// `z.string().uuid()`, answering the id it spells.
    pub(crate) fn uuid<T>(
        &mut self,
        value: Option<&'a JsonValue>,
        parse: impl FnOnce(&str) -> Option<T>,
    ) -> Parsed<T> {
        match self.string(value) {
            Parsed::Valid(text) => parse(text).map_or_else(
                || {
                    self.issue(ShapeProblem::InvalidUuid);
                    Parsed::Dirty
                },
                Parsed::Valid,
            ),
            Parsed::Dirty => Parsed::Dirty,
            Parsed::Aborted => Parsed::Aborted,
        }
    }

    /// `z.number()` with its checks, each run and each raising its own issue.
    pub(crate) fn number(
        &mut self,
        value: Option<&JsonValue>,
        checks: &[NumberCheck],
    ) -> Parsed<f64> {
        let Some(JsonValue::Number(number)) = value else {
            return self.wrong_type("number", value);
        };
        let mut parsed = Parsed::Valid(*number);
        for check in checks {
            let problem = match *check {
                NumberCheck::Finite if !number.is_finite() => Some(ShapeProblem::NotFinite),
                NumberCheck::Positive if *number <= 0.0 => Some(ShapeProblem::NotPositive),
                NumberCheck::Min(minimum) if *number < minimum => Some(ShapeProblem::TooSmall {
                    of: "number",
                    minimum,
                }),
                _ => None,
            };
            if let Some(problem) = problem {
                self.issue(problem);
                parsed = Parsed::Dirty;
            }
        }
        parsed
    }

    /// `z.boolean()`.
    pub(crate) fn boolean(&mut self, value: Option<&JsonValue>) -> Parsed<bool> {
        match value {
            Some(JsonValue::Bool(flag)) => Parsed::Valid(*flag),
            other => self.wrong_type("boolean", other),
        }
    }

    /// `z.enum(options)`, answering the option's index.
    pub(crate) fn one_of(
        &mut self,
        value: Option<&JsonValue>,
        options: &'static [&'static str],
    ) -> Parsed<usize> {
        let Some(JsonValue::String(text)) = value else {
            return self.wrong_type("string", value);
        };
        options
            .iter()
            .position(|option| option == text)
            .map_or_else(
                || {
                    self.issue(ShapeProblem::InvalidEnumValue { options });
                    Parsed::Aborted
                },
                Parsed::Valid,
            )
    }

    /// `.refine(holds, problem)` over a parse: run unless it aborted.
    pub(crate) fn refine<T>(
        &mut self,
        parsed: Parsed<T>,
        holds: impl FnOnce(&T) -> bool,
        problem: impl FnOnce() -> ShapeProblem,
    ) -> Parsed<T> {
        match &parsed {
            Parsed::Valid(value) if !holds(value) => {
                self.issue(problem());
                parsed.dirtied()
            }
            _ => parsed,
        }
    }

    /// The object `value` is, for a schema declaring `keys`: aborted when it is
    /// no object, and dirtied with one issue naming every undeclared key when
    /// the schema is strict.
    pub(crate) fn object(
        &mut self,
        value: Option<&'a JsonValue>,
        keys: &[&str],
        strictness: Strictness,
    ) -> Option<ObjectParse<'a>> {
        let Some(JsonValue::Object(object)) = value else {
            let _: Parsed<()> = self.wrong_type("object", value);
            return None;
        };
        let mut status = Status::Valid;
        if strictness == Strictness::Strict {
            let unknown: Vec<String> = object
                .iter()
                .filter(|(key, _)| !keys.contains(key))
                .map(|(key, _)| key.to_owned())
                .collect();
            if !unknown.is_empty() {
                self.issue(ShapeProblem::UnrecognizedKeys(unknown));
                status = Status::Dirty;
            }
        }
        Some(ObjectParse { object, status })
    }

    /// `z.array(item)`, with `min` items at least.
    pub(crate) fn array<T>(
        &mut self,
        value: Option<&'a JsonValue>,
        min: usize,
        mut item: impl FnMut(&mut Self, &'a JsonValue) -> Parsed<T>,
    ) -> Parsed<Vec<T>> {
        let Some(JsonValue::Array(items)) = value else {
            return self.wrong_type("array", value);
        };
        let mut status = Status::Valid;
        if items.len() < min {
            self.issue(ShapeProblem::TooSmall {
                of: "array",
                minimum: min as f64,
            });
            status = Status::Dirty;
        }
        let mut parsed = Vec::with_capacity(items.len());
        for (position, element) in items.iter().enumerate() {
            match self.index(position, |checker| item(checker, element)) {
                Parsed::Valid(value) => parsed.push(value),
                Parsed::Dirty => status = status.max(Status::Dirty),
                Parsed::Aborted => status = Status::Aborted,
            }
        }
        finish(status, || Some(parsed))
    }

    /// `jsonValueSchema`: any JSON value, its numbers finite, no object with an
    /// own `__proto__` key (which is not descended into). Never aborts.
    pub(crate) fn json_value(&mut self, value: &'a JsonValue) -> Status {
        match value {
            JsonValue::Number(number) if !number.is_finite() => {
                self.issue(ShapeProblem::NotFinite);
                Status::Dirty
            }
            JsonValue::Array(items) => {
                let mut status = Status::Valid;
                for (position, item) in items.iter().enumerate() {
                    status = status.max(self.index(position, |checker| checker.json_value(item)));
                }
                status
            }
            JsonValue::Object(object) if object.contains_key("__proto__") => {
                self.issue(ShapeProblem::Custom("A JSON object with no __proto__ key."));
                Status::Dirty
            }
            JsonValue::Object(object) => {
                let mut status = Status::Valid;
                for (key, item) in object.iter() {
                    status = status.max(self.key(key, |checker| checker.json_value(item)));
                }
                status
            }
            _ => Status::Valid,
        }
    }

    /// `jsonValueSchema` where the value may be absent: absent is no JSON value.
    pub(crate) fn required_json_value(&mut self, value: Option<&'a JsonValue>) -> Status {
        match value {
            Some(value) => self.json_value(value),
            None => {
                self.issue(ShapeProblem::InvalidUnion);
                Status::Aborted
            }
        }
    }
}

/// A check `z.number()` carries.
#[derive(Debug, Clone, Copy)]
pub(crate) enum NumberCheck {
    Finite,
    Positive,
    Min(f64),
}

/// Whether an object schema refuses keys it does not declare.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Strictness {
    Strict,
    Strip,
}

/// An object being parsed member by member.
#[derive(Debug)]
pub(crate) struct ObjectParse<'a> {
    object: &'a JsonObject,
    status: Status,
}

impl<'a> ObjectParse<'a> {
    /// The member under `key`, `None` when absent.
    pub(crate) fn get(&self, key: &str) -> Option<&'a JsonValue> {
        self.object.get(key)
    }

    /// The object itself.
    pub(crate) fn object(&self) -> &'a JsonObject {
        self.object
    }

    /// Fold a member's parse into the object's, answering its value when valid.
    pub(crate) fn take<T>(&mut self, parsed: Parsed<T>) -> Option<T> {
        self.status = self.status.max(parsed.status());
        match parsed {
            Parsed::Valid(value) => Some(value),
            _ => None,
        }
    }

    /// The object's parse, built when every member was valid.
    pub(crate) fn finish<T>(self, build: impl FnOnce() -> Option<T>) -> Parsed<T> {
        finish(self.status, build)
    }

    /// The object's status so far.
    pub(crate) fn status(&self) -> Status {
        self.status
    }
}

fn finish<T>(status: Status, build: impl FnOnce() -> Option<T>) -> Parsed<T> {
    match status {
        Status::Valid => build().map_or(Parsed::Aborted, Parsed::Valid),
        Status::Dirty => Parsed::Dirty,
        Status::Aborted => Parsed::Aborted,
    }
}

/// `schema.optional()`: absent is valid and answers `None`.
pub(crate) fn optional<'a, T>(
    checker: &mut Checker<'a>,
    value: Option<&'a JsonValue>,
    parse: impl FnOnce(&mut Checker<'a>, &'a JsonValue) -> Parsed<T>,
) -> Parsed<Option<T>> {
    match value {
        None => Parsed::Valid(None),
        Some(value) => parse(checker, value).map(Some),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json::parse;

    fn fields(issues: &[Issue]) -> Vec<Option<&str>> {
        issues.iter().map(|issue| issue.field.as_deref()).collect()
    }

    mod given_a_strict_object {
        use super::*;

        #[test]
        fn raises_one_issue_for_every_unknown_key_and_still_checks_members() {
            let value = parse(r#"{"a": 1, "x": 2, "y": 3}"#).unwrap();
            let mut checker = Checker::new();
            let mut object = checker
                .object(Some(&value), &["a"], Strictness::Strict)
                .unwrap();
            let a = object.get("a");
            let parsed = checker.key("a", |c| c.string(a));
            object.take(parsed);
            assert_eq!(
                object.status(),
                Status::Aborted,
                "a wrong-typed member aborts"
            );
            let issues = checker.into_issues();
            assert_eq!(fields(&issues), vec![None, Some("a")], "one issue each");
            assert_eq!(
                issues.first().map(|issue| &issue.problem),
                Some(&ShapeProblem::UnrecognizedKeys(vec![
                    "x".into(),
                    "y".into()
                ])),
                "the unknown keys are named in one issue"
            );
        }
    }

    mod given_numbers {
        use super::*;

        #[test]
        fn raises_an_issue_for_each_failed_check() {
            let mut checker = Checker::new();
            let parsed = checker.number(
                Some(&JsonValue::Number(f64::NEG_INFINITY)),
                &[NumberCheck::Finite, NumberCheck::Min(260.0)],
            );
            assert_eq!(parsed.status(), Status::Dirty, "failed checks dirty");
            assert_eq!(
                checker.into_issues().len(),
                2,
                "-Infinity fails both checks"
            );
        }
    }

    mod given_json_values {
        use super::*;

        #[test]
        fn raises_issues_for_infinite_numbers_and_proto_keys() {
            let value = parse(r#"{"a": [1, 1e400], "b": {"__proto__": {"c": 1e400}}}"#).unwrap();
            let mut checker = Checker::new();
            assert_eq!(checker.json_value(&value), Status::Dirty, "issues dirty");
            assert_eq!(
                fields(&checker.into_issues()),
                vec![Some("a.1"), Some("b")],
                "the infinity, and the __proto__ object, which is not descended into"
            );
        }
    }
}
