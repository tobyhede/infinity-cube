//! `classify` over constructed errors (ADR 0177): through the pool, a refused
//! connection, `53300` and `57P03` arrive only as `PoolTimedOut`, so each
//! SQLSTATE and socket failure is held here rather than against a server.
//! And `connect_options`, one test per `sslmode` value, as `pg` reads it.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

use std::borrow::Cow;
use std::error::Error as StdError;
use std::io;

use sqlx::error::{DatabaseError, ErrorKind};
use sqlx::postgres::PgSslMode;

use super::{PostgresUrlError, classify, connect_options};
use crate::repository::RepositoryError;

/// A database error: its SQLSTATE, if it carries one, and its words.
#[derive(Debug)]
struct Coded {
    code: Option<&'static str>,
    message: &'static str,
}

impl std::fmt::Display for Coded {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(self.message)
    }
}

impl StdError for Coded {}

impl DatabaseError for Coded {
    fn message(&self) -> &str {
        self.message
    }

    fn code(&self) -> Option<Cow<'_, str>> {
        self.code.map(Cow::Borrowed)
    }

    fn as_error(&self) -> &(dyn StdError + Send + Sync + 'static) {
        self
    }

    fn as_error_mut(&mut self) -> &mut (dyn StdError + Send + Sync + 'static) {
        self
    }

    fn into_error(self: Box<Self>) -> Box<dyn StdError + Send + Sync + 'static> {
        self
    }

    fn kind(&self) -> ErrorKind {
        ErrorKind::Other
    }
}

/// A failure on a statement carrying `code`.
fn database(code: &'static str) -> sqlx::Error {
    sqlx::Error::Database(Box::new(Coded {
        code: Some(code),
        message: "failed",
    }))
}

/// A socket failure of `kind`, as the operating system raises it.
fn socket(kind: io::ErrorKind) -> sqlx::Error {
    sqlx::Error::Io(io::Error::from(kind))
}

/// A socket failure of `kind` carrying words, as a driver that normalised
/// it would.
fn worded(kind: io::ErrorKind, words: &str) -> sqlx::Error {
    sqlx::Error::Io(io::Error::new(kind, words.to_owned()))
}

fn named(error: &sqlx::Error) -> &'static str {
    match classify(error) {
        RepositoryError::Unavailable(_) => "unreachable",
        RepositoryError::BrokenStoredState(_) => "invariant",
        RepositoryError::Unclassified(_) => "unclassified",
    }
}

/// One test per value, each asserting what `classify` names it.
macro_rules! each {
    ($answer:literal: $($name:ident => $error:expr),+ $(,)?) => {
        $(
            #[test]
            fn $name() {
                assert_eq!(named(&$error), $answer);
            }
        )+
    };
}

mod classify_a_failure {
    use super::*;

    // A dropped connection reads `UnexpectedEof`; the driver's `transient`
    // flag has no counterpart, and the words are not read.
    // Case: recognises %s whatever its transient flag says
    each!("unreachable":
        recognises_a_connection_the_server_dropped =>
            worded(io::ErrorKind::UnexpectedEof, "Connection terminated"),
        recognises_a_refused_connection_with_its_words =>
            worded(io::ErrorKind::ConnectionRefused, "connect ECONNREFUSED"),
    );

    // Case: recognises the socket failure %s the driver normalised
    each!("unreachable":
        recognises_econnrefused_with_its_words =>
            worded(io::ErrorKind::ConnectionRefused, "connect ECONNREFUSED"),
        recognises_econnreset_with_its_words =>
            worded(io::ErrorKind::ConnectionReset, "connect ECONNRESET"),
        recognises_etimedout_with_its_words =>
            worded(io::ErrorKind::TimedOut, "connect ETIMEDOUT"),
        recognises_ehostunreach_with_its_words =>
            worded(io::ErrorKind::HostUnreachable, "connect EHOSTUNREACH"),
    );

    // A name that does not resolve reaches `sqlx` with no OS error.
    // Case: leaves a host name that does not resolve unclassified when the driver normalised it
    each!("unclassified":
        leaves_a_host_name_that_does_not_resolve_unclassified => sqlx::Error::Io(io::Error::other(
            "failed to lookup address information: Name or service not known"
        )),
    );

    // Case: recognises SQLSTATE %s on a statement the driver normalised
    each!("unreachable":
        recognises_sqlstate_08000 => database("08000"),
        recognises_sqlstate_08001 => database("08001"),
        recognises_sqlstate_08003 => database("08003"),
        recognises_sqlstate_08004 => database("08004"),
        recognises_sqlstate_08006 => database("08006"),
        recognises_sqlstate_40001 => database("40001"),
        recognises_sqlstate_40p01 => database("40P01"),
        recognises_sqlstate_53300 => database("53300"),
        recognises_sqlstate_55p03 => database("55P03"),
        recognises_sqlstate_57p01 => database("57P01"),
        recognises_sqlstate_57p02 => database("57P02"),
        recognises_sqlstate_57p03 => database("57P03"),
    );

    // Case: names the set ticket 31 records
    #[test]
    fn names_the_set_the_typescript_store_names() {
        let mut states = super::super::UNREACHABLE_STATES;
        states.sort_unstable();
        assert_eq!(
            states,
            [
                "08000", "08001", "08003", "08004", "08006", "40001", "40P01", "53300", "55P03",
                "57P01", "57P02", "57P03",
            ]
        );
    }

    // Case: recognises the socket failure %s
    each!("unreachable":
        recognises_the_socket_failure_econnrefused => socket(io::ErrorKind::ConnectionRefused),
        recognises_the_socket_failure_econnreset => socket(io::ErrorKind::ConnectionReset),
        recognises_the_socket_failure_etimedout => socket(io::ErrorKind::TimedOut),
        recognises_the_socket_failure_ehostunreach => socket(io::ErrorKind::HostUnreachable),
        recognises_the_socket_failure_enetunreach => socket(io::ErrorKind::NetworkUnreachable),
    );

    // The accepted difference (ADR 0177): a resolver that failed for now
    // (`EAI_AGAIN`) reaches `sqlx` as a name that does not resolve does, with
    // no OS error, so Rust leaves it unclassified where TypeScript names it
    // unreachable.
    // Case: recognises the socket failure %s
    each!("unclassified":
        leaves_a_resolver_that_failed_for_now_unclassified => sqlx::Error::Io(io::Error::other(
            "failed to lookup address information: Temporary failure in name resolution"
        )),
    );

    // Case: leaves the error code %s unclassified
    each!("unclassified":
        leaves_enotfound_unclassified => sqlx::Error::Io(io::Error::other(
            "failed to lookup address information: Name or service not known"
        )),
        leaves_eacces_unclassified => socket(io::ErrorKind::PermissionDenied),
        leaves_eproto_unclassified => sqlx::Error::Io(io::Error::other("Protocol error")),
        leaves_an_invalid_argument_unclassified => socket(io::ErrorKind::InvalidInput),
    );

    // `sqlx` keeps no cause chain: a failure is classified by itself, so an
    // error nested inside another is never walked into, and there is no chain
    // to loop on.
    // Case: terminates on a cyclic cause chain
    each!("unclassified":
        reads_a_failure_by_itself_and_not_what_it_wraps => sqlx::Error::Io(io::Error::other(
            io::Error::from(io::ErrorKind::ConnectionRefused)
        )),
    );

    // Case: leaves a defect, an unknown code and a code named only in prose unclassified
    each!("unclassified":
        leaves_a_unique_violation_unclassified => database("23505"),
        leaves_sqlites_catch_all_unclassified => database("HY000"),
        leaves_a_cancelled_statement_unclassified => database("57014"),
        leaves_an_unknown_sqlstate_unclassified => database("XX999"),
        leaves_a_code_named_only_in_a_database_errors_words_unclassified =>
            sqlx::Error::Database(Box::new(Coded {
                code: None,
                message: "deadlock detected (40P01)",
            })),
        leaves_a_code_named_in_words_beside_another_code_unclassified =>
            sqlx::Error::Database(Box::new(Coded {
                code: Some("XX999"),
                message: "40P01",
            })),
        leaves_a_code_named_only_in_a_protocol_failure_unclassified =>
            sqlx::Error::Protocol("deadlock detected (40P01)".into()),
        leaves_a_socket_failure_named_only_in_words_unclassified =>
            sqlx::Error::Io(io::Error::other("connect ECONNREFUSED 127.0.0.1:5432")),
    );

    #[test]
    fn answers_a_rejected_password_a_missing_database_and_others_unclassified() {
        for code in [
            "28P01", "28000", "3D000", "23505", "22P05", "22P02", "57014", "XX000", "08P01",
        ] {
            assert_eq!(named(&database(code)), "unclassified", "{code}");
        }
    }

    #[test]
    fn answers_a_missing_table_as_an_invariant_failure() {
        assert_eq!(named(&database("42P01")), "invariant");
    }

    #[test]
    fn answers_each_socket_failure_unreachable() {
        for kind in [
            io::ErrorKind::ConnectionRefused,
            io::ErrorKind::ConnectionReset,
            io::ErrorKind::ConnectionAborted,
            io::ErrorKind::NotConnected,
            io::ErrorKind::BrokenPipe,
            io::ErrorKind::UnexpectedEof,
            io::ErrorKind::TimedOut,
            io::ErrorKind::HostUnreachable,
            io::ErrorKind::NetworkUnreachable,
        ] {
            assert_eq!(named(&socket(kind)), "unreachable", "{kind:?}");
        }
    }

    #[test]
    fn answers_a_pool_that_timed_out_or_closed_unreachable() {
        assert_eq!(named(&sqlx::Error::PoolTimedOut), "unreachable");
        assert_eq!(named(&sqlx::Error::PoolClosed), "unreachable");
    }

    #[test]
    fn answers_tls_protocol_and_configuration_failures_unclassified() {
        assert_eq!(named(&sqlx::Error::Tls("refused".into())), "unclassified");
        assert_eq!(named(&sqlx::Error::Protocol("odd".into())), "unclassified");
        assert_eq!(
            named(&sqlx::Error::Configuration("bad".into())),
            "unclassified"
        );
        assert_eq!(named(&sqlx::Error::RowNotFound), "unclassified");
    }

    #[test]
    fn keeps_the_sqlstate_with_the_words() {
        let RepositoryError::Unclassified(words) = classify(&database("28P01")) else {
            panic!("unclassified");
        };
        assert!(words.contains("SQLSTATE 28P01"), "{words}");
    }
}

mod read_sslmode_as_pg_does {
    use super::*;

    fn mode(url: &str) -> PgSslMode {
        connect_options(url).unwrap().get_ssl_mode()
    }

    const BASE: &str = "postgresql://cube:secret@127.0.0.1:55432/cube";

    #[test]
    fn connects_without_tls_when_no_sslmode_is_named() {
        assert!(matches!(mode(BASE), PgSslMode::Disable));
    }

    #[test]
    fn connects_without_tls_for_disable() {
        assert!(matches!(
            mode(&format!("{BASE}?sslmode=disable")),
            PgSslMode::Disable
        ));
    }

    #[test]
    fn verifies_the_certificate_and_host_for_prefer_require_and_verify_ca() {
        for value in ["prefer", "require", "verify-ca", "allow", "anything"] {
            assert!(
                matches!(
                    mode(&format!("{BASE}?sslmode={value}")),
                    PgSslMode::VerifyFull
                ),
                "{value}"
            );
        }
    }

    #[test]
    fn verifies_the_certificate_and_host_for_verify_full() {
        assert!(matches!(
            mode(&format!("{BASE}?sslmode=verify-full")),
            PgSslMode::VerifyFull
        ));
    }

    #[test]
    fn encrypts_without_checking_for_no_verify() {
        assert!(matches!(
            mode(&format!("{BASE}?sslmode=no-verify")),
            PgSslMode::Require
        ));
    }

    #[test]
    fn asks_for_tls_when_a_certificate_or_ssl_true_is_named() {
        for query in ["ssl=true", "ssl=1", "sslrootcert=/ca.pem"] {
            assert!(
                matches!(mode(&format!("{BASE}?{query}")), PgSslMode::VerifyFull),
                "{query}"
            );
        }
    }

    #[test]
    fn reads_libpq_meanings_under_uselibpqcompat_without_a_plaintext_fallback() {
        let compat = |rest: &str| mode(&format!("{BASE}?uselibpqcompat=true&{rest}"));
        assert!(matches!(compat("sslmode=disable"), PgSslMode::Disable));
        assert!(matches!(compat("sslmode=prefer"), PgSslMode::Require));
        assert!(matches!(compat("sslmode=require"), PgSslMode::Require));
        assert!(matches!(
            compat("sslmode=require&sslrootcert=/ca.pem"),
            PgSslMode::VerifyCa
        ));
        assert!(matches!(
            compat("sslmode=verify-ca&sslrootcert=/ca.pem"),
            PgSslMode::VerifyCa
        ));
        assert!(matches!(
            compat("sslmode=verify-full"),
            PgSslMode::VerifyFull
        ));
        assert_eq!(
            connect_options(&format!("{BASE}?uselibpqcompat=true&sslmode=verify-ca")).err(),
            Some(PostgresUrlError::VerifyCaWithoutRoot)
        );
    }

    #[test]
    fn keeps_every_other_parameter_and_the_database() {
        let options = connect_options(&format!(
            "{BASE}?sslmode=disable&application_name=cube&uselibpqcompat=false"
        ))
        .unwrap();
        assert_eq!(options.get_database(), Some("cube"));
        assert_eq!(options.get_host(), "127.0.0.1");
    }

    #[test]
    fn refuses_what_is_not_a_url() {
        assert!(matches!(
            connect_options("not a url"),
            Err(PostgresUrlError::Invalid(_))
        ));
    }
}
