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

/// A database error carrying one SQLSTATE.
#[derive(Debug)]
struct Coded(&'static str);

impl std::fmt::Display for Coded {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "SQLSTATE {}", self.0)
    }
}

impl StdError for Coded {}

impl DatabaseError for Coded {
    fn message(&self) -> &str {
        self.0
    }

    fn code(&self) -> Option<Cow<'_, str>> {
        Some(Cow::Borrowed(self.0))
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

fn database(code: &'static str) -> sqlx::Error {
    sqlx::Error::Database(Box::new(Coded(code)))
}

fn named(error: &sqlx::Error) -> &'static str {
    match classify(error) {
        RepositoryError::Unavailable(_) => "unreachable",
        RepositoryError::BrokenStoredState(_) => "invariant",
        RepositoryError::Unclassified(_) => "unclassified",
    }
}

mod classify_a_failure {
    use super::*;

    #[test]
    fn answers_every_sqlstate_of_the_typescript_allowlist_unreachable() {
        for code in [
            "08000", "08001", "08003", "08004", "08006", "40001", "40P01", "53300", "55P03",
            "57P01", "57P02", "57P03",
        ] {
            assert_eq!(named(&database(code)), "unreachable", "{code}");
        }
    }

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
            assert_eq!(
                named(&sqlx::Error::Io(io::Error::from(kind))),
                "unreachable",
                "{kind:?}"
            );
        }
    }

    // A name that does not resolve, and a resolver that failed for now
    // (`EAI_AGAIN`), both reach `sqlx` as an uncategorised failure with no
    // OS error, so neither is Unreachable: the accepted difference.
    #[test]
    fn answers_other_io_failures_and_an_unresolved_name_unclassified() {
        for kind in [
            io::ErrorKind::PermissionDenied,
            io::ErrorKind::InvalidData,
            io::ErrorKind::Other,
        ] {
            assert_eq!(
                named(&sqlx::Error::Io(io::Error::from(kind))),
                "unclassified",
                "{kind:?}"
            );
        }
        assert_eq!(
            named(&sqlx::Error::Io(io::Error::other(
                "failed to lookup address information: Temporary failure in name resolution"
            ))),
            "unclassified"
        );
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
