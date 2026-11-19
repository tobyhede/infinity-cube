//! The identifiers intake reads: each a UUID spelled as written.
//!
//! A UUID is held as its 36 characters, not as 128 bits, because the
//! TypeScript intake compares ids as strings: `z.string().uuid()` accepts upper
//! and lower case alike, and a reference spelled in one case does not name an
//! entity spelled in the other.

use std::fmt;

/// The 36 characters of a UUID: eight, four, four, four and twelve hexadecimal
/// digits joined by hyphens, in either case, as Zod's `uuid()` accepts.
#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Uuid([u8; 36]);

impl Uuid {
    /// The UUID `text` spells, or `None` when it spells none.
    #[must_use]
    pub fn parse(text: &str) -> Option<Self> {
        let bytes: [u8; 36] = text.as_bytes().try_into().ok()?;
        let shaped = bytes.iter().enumerate().all(|(index, byte)| match index {
            8 | 13 | 18 | 23 => *byte == b'-',
            _ => byte.is_ascii_hexdigit(),
        });
        shaped.then_some(Self(bytes))
    }

    /// The UUID as written.
    #[must_use]
    pub fn as_str(&self) -> &str {
        // Every byte is an ASCII hexadecimal digit or a hyphen, checked by `parse`.
        std::str::from_utf8(&self.0).unwrap_or_default()
    }

    /// Whether it is written in lower case, as Export writes a Space's id.
    #[must_use]
    pub fn is_lower_case(&self) -> bool {
        !self.0.iter().any(u8::is_ascii_uppercase)
    }
}

impl fmt::Debug for Uuid {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl fmt::Display for Uuid {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl Uuid {
    /// The UUID whose 128 bits are `value`, spelled in lower case.
    #[must_use]
    pub fn from_u128(value: u128) -> Self {
        const HEX: &[u8; 16] = b"0123456789abcdef";
        let mut bytes = [b'-'; 36];
        let mut digit = 0u32;
        for (index, byte) in bytes.iter_mut().enumerate() {
            if matches!(index, 8 | 13 | 18 | 23) {
                continue;
            }
            let nibble = (value >> (124 - 4 * digit)) & 0xf;
            *byte = HEX.get(nibble as usize).copied().unwrap_or(b'0');
            digit += 1;
        }
        Self(bytes)
    }
}

macro_rules! uuid_id {
    ($(#[$doc:meta])* $name:ident) => {
        $(#[$doc])*
        #[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
        pub struct $name(Uuid);

        impl $name {
            /// The id `text` spells, or `None` when it is not a UUID.
            #[must_use]
            pub fn parse(text: &str) -> Option<Self> {
                Uuid::parse(text).map(Self)
            }

            /// The id as written.
            #[must_use]
            pub fn as_str(&self) -> &str {
                self.0.as_str()
            }

            /// The UUID it is.
            #[must_use]
            pub fn uuid(self) -> Uuid {
                self.0
            }
        }

        impl From<Uuid> for $name {
            fn from(uuid: Uuid) -> Self {
                Self(uuid)
            }
        }

        impl fmt::Debug for $name {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                write!(f, "{}({})", stringify!($name), self.0)
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                fmt::Display::fmt(&self.0, f)
            }
        }
    };
}

uuid_id!(
    /// What names a Space: its directory's name and its `space.json` `id`.
    SpaceId
);
uuid_id!(
    /// What names a Resource: its file's `id`, unique across the aggregate.
    ResourceId
);
uuid_id!(
    /// What names a Map within its Space.
    MapId
);
uuid_id!(
    /// What names a Graph, unique across its Space although one Map owns it.
    GraphId
);

/// A Resource's kind: a kind id, which a listed plugin draws or no plugin does.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Kind(Box<str>);

impl Kind {
    /// The kind `text` names, or `None` when it is not a kind id: a bare id, or
    /// a vendor kind's `vnd.<owner>.<name>`, each part ASCII letters, digits and
    /// hyphens starting with a letter or digit (ADR 0128).
    #[must_use]
    pub fn parse(text: &str) -> Option<Self> {
        is_kind_id(text).then(|| Self(text.into()))
    }

    /// The kind as written.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for Kind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

fn is_kind_part(part: &str) -> bool {
    let mut bytes = part.bytes();
    bytes
        .next()
        .is_some_and(|first| first.is_ascii_alphanumeric())
        && bytes.all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
}

/// Whether `text` is a well-formed kind id, a listed plugin's or not.
#[must_use]
pub fn is_kind_id(text: &str) -> bool {
    if is_kind_part(text) {
        return true;
    }
    let mut parts = text.split('.');
    matches!(
        (parts.next(), parts.next(), parts.next(), parts.next()),
        (Some("vnd"), Some(owner), Some(name), None) if is_kind_part(owner) && is_kind_part(name)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    mod given_uuids {
        use super::*;

        #[test]
        fn accepts_either_case_and_keeps_the_spelling() {
            let upper = Uuid::parse("ABCDEF00-0000-4000-8000-00000000000A").unwrap();
            assert_eq!(
                upper.as_str(),
                "ABCDEF00-0000-4000-8000-00000000000A",
                "spelling kept"
            );
            assert!(!upper.is_lower_case(), "upper case should be told");
            assert_ne!(
                Some(upper),
                Uuid::parse("abcdef00-0000-4000-8000-00000000000a"),
                "two spellings should be two ids, as strings are in TypeScript"
            );
        }

        #[test]
        fn accepts_any_version_as_zod_does() {
            assert!(
                Uuid::parse("00000000-0000-0000-0000-000000000000").is_some(),
                "Zod's uuid() checks only the shape"
            );
        }

        #[test]
        fn refuses_what_is_not_shaped_as_one() {
            for text in [
                "",
                "deep-dive",
                "00000000-0000-4000-8000-00000000000",
                "00000000-0000-4000-8000-0000000000000",
                "000000000000-4000-8000-0000-00000000",
                "g0000000-0000-4000-8000-000000000000",
            ] {
                assert!(Uuid::parse(text).is_none(), "{text:?} should not be a UUID");
            }
        }
    }

    mod given_128_bits {
        use super::*;

        #[test]
        fn spells_them_in_lower_case_most_significant_first() {
            assert_eq!(
                Uuid::from_u128(0xa123_4567_89ab_4cde_8fab_0123_4567_89ab).as_str(),
                "a1234567-89ab-4cde-8fab-0123456789ab",
                "every nibble in place"
            );
            assert_eq!(
                Uuid::from_u128(0).as_str(),
                "00000000-0000-0000-0000-000000000000",
                "zero"
            );
        }
    }

    mod given_kind_ids {
        use super::*;

        #[test]
        fn accepts_bare_and_vendor_kinds() {
            for text in [
                "ur",
                "markdown",
                "x-1",
                "9lives",
                "vnd.acme.widget",
                "vnd.a-b.c-d",
            ] {
                assert!(is_kind_id(text), "{text} should be a kind id");
            }
        }

        #[test]
        fn refuses_other_forms() {
            for text in [
                "",
                "-x",
                "a.b",
                "vnd.acme",
                "vnd.acme.widget.x",
                "vnd..x",
                "ü",
                "a b",
            ] {
                assert!(!is_kind_id(text), "{text:?} should not be a kind id");
            }
        }
    }
}
