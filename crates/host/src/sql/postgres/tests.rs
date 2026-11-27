//! `classify` over constructed errors (ADR 0177): through the pool, a refused
//! connection, `53300` and `57P03` arrive only as `PoolTimedOut`, so each
//! SQLSTATE and socket failure is held here rather than against a server.
//! And `connect_options`, one test per `sslmode` value, with the meaning ADR
//! 0177 gives it.

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

    /// The SQLSTATEs `UNAVAILABLE_SQLSTATES` lists in `source`.
    fn typescript_allowlist(source: &str) -> Vec<String> {
        let start = source
            .find("export const UNAVAILABLE_SQLSTATES = [")
            .expect("the TypeScript store declares UNAVAILABLE_SQLSTATES");
        let rest = &source[start..];
        let list = &rest[rest.find('[').unwrap() + 1..rest.find(']').unwrap()];
        list.split(',')
            .map(|entry| entry.trim().trim_matches('\'').to_owned())
            .filter(|entry| !entry.is_empty())
            .collect()
    }

    // Case: names the set ticket 31 records
    #[test]
    fn names_the_set_the_typescript_store_names() {
        let path =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../src/prisma/sql-store.ts");
        let mut typescript = typescript_allowlist(&std::fs::read_to_string(&path).unwrap());
        typescript.sort_unstable();
        let mut states = super::super::UNREACHABLE_STATES.map(str::to_owned).to_vec();
        states.sort_unstable();
        assert_eq!(states, typescript);
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
        connect_options(url, None).unwrap().get_ssl_mode()
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
        for query in ["ssl=true", "ssl=1", "sslcert=/client.pem"] {
            assert!(
                matches!(mode(&format!("{BASE}?{query}")), PgSslMode::VerifyFull),
                "{query}"
            );
        }
    }

    // pg-connection-string 2.14 turns `ssl=true` and `ssl=1` into `true`
    // and `ssl=0` into `false`; pg 8.22's `ConnectionParameters` turns `ssl=no-verify` into
    // `{ rejectUnauthorized: false }`, and any other non-empty string stays a
    // truthy `ssl`, which connects with TLS and checks the certificate.
    #[test]
    fn reads_every_ssl_value_as_pg_does() {
        let cases = [
            ("ssl=no-verify", PgSslMode::Require),
            ("ssl=false", PgSslMode::VerifyFull),
            ("ssl=require", PgSslMode::VerifyFull),
            ("ssl=yes", PgSslMode::VerifyFull),
            ("ssl=0", PgSslMode::Disable),
            ("ssl=", PgSslMode::Disable),
        ];
        for (query, expected) in cases {
            let read = mode(&format!("{BASE}?{query}"));
            assert_eq!(
                format!("{read:?}"),
                format!("{expected:?}"),
                "{query} should connect as pg connects"
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
            compat("sslmode=verify-full"),
            PgSslMode::VerifyFull
        ));
        // libpq has no `no-verify`, and `pg` leaves it checked under
        // `uselibpqcompat`.
        assert!(matches!(compat("sslmode=no-verify"), PgSslMode::VerifyFull));
        assert_eq!(
            connect_options(
                &format!("{BASE}?uselibpqcompat=true&sslmode=verify-ca"),
                None
            )
            .err(),
            Some(PostgresUrlError::VerifyCa)
        );
    }

    #[test]
    fn keeps_every_other_parameter_and_the_database() {
        let options = connect_options(
            &format!("{BASE}?sslmode=disable&application_name=cube&uselibpqcompat=false"),
            None,
        )
        .unwrap();
        assert_eq!(options.get_database(), Some("cube"));
        assert_eq!(options.get_host(), "127.0.0.1");
        assert_eq!(options.get_application_name(), Some("cube"));
    }

    // `pg` reads `PGSSLMODE` when the URL names no TLS setting (pg 8.22
    // `lib/connection-parameters.js`, `readSSLConfigFromEnvironment`):
    // `disable` and any value it does not know connect without TLS,
    // `no-verify` encrypts without checking, and `prefer`, `require`,
    // `verify-ca` and `verify-full` verify the certificate and host.
    #[test]
    fn follows_pgsslmode_when_the_url_names_no_tls() {
        let cases = [
            ("disable", PgSslMode::Disable),
            ("allow", PgSslMode::Disable),
            ("no-verify", PgSslMode::Require),
            ("prefer", PgSslMode::VerifyFull),
            ("require", PgSslMode::VerifyFull),
            ("verify-ca", PgSslMode::VerifyFull),
            ("verify-full", PgSslMode::VerifyFull),
        ];
        for (value, expected) in cases {
            for url in [BASE.to_owned(), format!("{BASE}?uselibpqcompat=true")] {
                let read = connect_options(&url, Some(value)).unwrap().get_ssl_mode();
                assert_eq!(
                    format!("{read:?}"),
                    format!("{expected:?}"),
                    "PGSSLMODE={value} with {url}"
                );
            }
        }
    }

    #[test]
    fn leaves_pgsslmode_unread_when_the_url_names_tls() {
        for query in [
            "sslmode=disable",
            "ssl=0",
            "ssl=true",
            "sslcert=/client.pem",
        ] {
            let url = format!("{BASE}?{query}");
            let read = connect_options(&url, Some("no-verify"))
                .unwrap()
                .get_ssl_mode();
            assert_eq!(format!("{read:?}"), format!("{:?}", mode(&url)), "{query}");
        }
    }

    // Storage ST-120: `serve --store postgres` refuses a URL that is not a
    // PostgreSQL URL before it takes a port.
    #[test]
    fn refuses_a_url_whose_scheme_is_not_postgres() {
        for url in [
            "https://db.example/cube",
            "mysql://cube@127.0.0.1/cube",
            "file:///cube",
        ] {
            assert!(
                matches!(
                    connect_options(url, None),
                    Err(PostgresUrlError::Invalid(_))
                ),
                "{url} should be refused as not a PostgreSQL URL"
            );
        }
        for url in [
            "postgres://cube@127.0.0.1/cube",
            "postgresql://cube@127.0.0.1/cube",
        ] {
            assert!(
                connect_options(url, None).is_ok(),
                "{url} should be read as a PostgreSQL URL"
            );
        }
    }

    // `sqlx` 0.9.1 adds a named CA file to the system's trusted roots
    // (`sqlx-core` `net/tls/tls_rustls.rs`, `import_root_certs` then
    // `cert_store.add`) rather than trusting it alone, as `pg` does, so a
    // certificate from any system-trusted CA would pass for a server pinned
    // to a private one. The URL is refused before the server takes a port,
    // under `pg`'s name and under `sqlx`'s two aliases, which `sqlx` reads
    // as the same file.
    #[test]
    fn refuses_a_named_root_certificate_in_every_mode() {
        for parameter in ["sslrootcert", "ssl-root-cert", "ssl-ca"] {
            for query in [
                format!("{parameter}=/ca.pem"),
                format!("sslmode=disable&{parameter}=/ca.pem"),
                format!("sslmode=verify-full&{parameter}=/ca.pem"),
                format!("uselibpqcompat=true&sslmode=require&{parameter}=/ca.pem"),
                format!("uselibpqcompat=true&sslmode=verify-ca&{parameter}=/ca.pem"),
                format!("{parameter}=/ca.pem&{parameter}="),
            ] {
                let read = connect_options(&format!("{BASE}?{query}"), None);
                assert_eq!(
                    read.as_ref().err(),
                    Some(&PostgresUrlError::RootCertificate(parameter.to_owned())),
                    "{query} should be refused naming {parameter}, not read as {read:?}"
                );
                let refusal = read.err().map(|refusal| refusal.to_string());
                assert!(
                    refusal
                        .as_deref()
                        .is_some_and(|words| words.contains(parameter)),
                    "{query}: the refusal names {parameter}: {refusal:?}"
                );
            }
        }
    }

    // With a named root certificate refused, libpq's `verify-ca` cannot be
    // met at all, so its refusal points to `verify-full` rather than asking
    // for the `sslrootcert` that would itself be refused.
    #[test]
    fn refuses_verify_ca_under_uselibpqcompat_pointing_to_verify_full() {
        let read = connect_options(
            &format!("{BASE}?uselibpqcompat=true&sslmode=verify-ca"),
            None,
        );
        let Err(refusal) = &read else {
            panic!("verify-ca should be refused, not read as {read:?}");
        };
        assert!(
            refusal.to_string().contains("verify-full"),
            "the refusal points to verify-full: {refusal}"
        );
    }

    // `pg` reads an empty `sslrootcert` as absent (pg-connection-string
    // 2.14 tests `if (config.sslrootcert)`), so it names no CA, asks for no
    // TLS by itself and is not refused as a named one; `sqlx`'s aliases,
    // empty, are left out as well.
    #[test]
    fn reads_an_empty_root_certificate_as_absent() {
        for parameter in ["sslrootcert", "ssl-root-cert", "ssl-ca"] {
            let read = connect_options(&format!("{BASE}?{parameter}="), None)
                .expect("an empty CA file parameter is not refused");
            assert!(
                matches!(read.get_ssl_mode(), PgSslMode::Disable),
                "an empty {parameter} asks for no TLS: {:?}",
                read.get_ssl_mode()
            );
            assert!(
                format!("{read:?}").contains("ssl_root_cert: Some(Inline([]))"),
                "an empty {parameter} names no file to sqlx: {read:?}"
            );
        }
        assert_eq!(
            connect_options(
                &format!("{BASE}?uselibpqcompat=true&sslmode=verify-ca&sslrootcert="),
                None
            )
            .err(),
            connect_options(
                &format!("{BASE}?uselibpqcompat=true&sslmode=verify-ca"),
                None
            )
            .err(),
            "verify-ca with an empty sslrootcert is refused as with none"
        );
    }

    // pg-connection-string 2.14 asks for TLS and reads a file only for a
    // truthy `sslcert` or `sslkey`, so an empty one is absent: `ssl=0`, the
    // URL's silence and `PGSSLMODE` decide, and `sqlx` is handed no file.
    #[test]
    fn reads_an_empty_client_certificate_or_key_as_absent() {
        for parameter in ["sslcert", "sslkey"] {
            for (rest, pgsslmode, expected) in [
                ("&ssl=0", None, PgSslMode::Disable),
                ("", None, PgSslMode::Disable),
                ("", Some("no-verify"), PgSslMode::Require),
            ] {
                let url = format!("{BASE}?{parameter}={rest}");
                let read = connect_options(&url, pgsslmode)
                    .expect("an empty client certificate parameter is not refused");
                assert_eq!(
                    format!("{:?}", read.get_ssl_mode()),
                    format!("{expected:?}"),
                    "{url} with PGSSLMODE={pgsslmode:?} connects as pg connects"
                );
                let described = format!("{read:?}");
                assert!(
                    described.contains("ssl_client_cert: None")
                        && described.contains("ssl_client_key: None"),
                    "{url} names no client file to sqlx: {described}"
                );
            }
        }
    }

    // `pg` reads the last of a repeated parameter, so an empty last
    // `sslcert` or `sslkey` is absent however many came before it, and
    // `sqlx`, which applies each in turn, is handed none of them.
    #[test]
    fn reads_a_client_certificate_or_key_absent_when_its_last_value_is_empty() {
        for parameter in ["sslcert", "sslkey"] {
            let url = format!("{BASE}?{parameter}=/a.pem&{parameter}=");
            let read = connect_options(&url, None).unwrap();
            assert!(
                matches!(read.get_ssl_mode(), PgSslMode::Disable),
                "{url} asks for no TLS: {:?}",
                read.get_ssl_mode()
            );
            let described = format!("{read:?}");
            assert!(
                described.contains("ssl_client_cert: None")
                    && described.contains("ssl_client_key: None"),
                "{url} names no client file to sqlx: {described}"
            );
        }
    }

    // `sqlx` 0.9.1 keeps a `hostaddr` apart from the host: it dials the
    // address and verifies TLS against the host, which the recovery proxies
    // in the PostgreSQL tests depend on.
    #[test]
    fn keeps_the_host_apart_from_a_hostaddr() {
        let read = connect_options(
            "postgresql://cube@db.example:5432/cube?sslmode=verify-full&hostaddr=127.0.0.1",
            None,
        )
        .unwrap();
        assert_eq!(read.get_host(), "db.example");
        assert!(
            format!("{read:?}").contains("hostaddr: Some(127.0.0.1)"),
            "the address is dialled: {read:?}"
        );
    }

    // `pg` never reads `PGSSLROOTCERT`; `sqlx` 0.9.1 reads it as a CA file
    // (`PgConnectOptions::new_without_pgpass`) and would add it to the
    // system's trusted roots, so the options name an empty PEM, which adds
    // no CA, in its place. Setting a variable is `unsafe`, which `unsafe_code`
    // = "forbid" rules out, and would race the other tests in this binary, so
    // the test runs itself again as a child process with the variable set.
    #[test]
    fn ignores_pgsslrootcert_as_pg_does() {
        const NAME: &str =
            "sql::postgres::tests::read_sslmode_as_pg_does::ignores_pgsslrootcert_as_pg_does";
        match std::env::var_os("PGSSLROOTCERT") {
            Some(_) => {
                for url in [BASE.to_owned(), format!("{BASE}?sslmode=verify-full")] {
                    let read = connect_options(&url, None).unwrap();
                    assert!(
                        format!("{read:?}").contains("ssl_root_cert: Some(Inline([]))"),
                        "PGSSLROOTCERT names no CA to sqlx for {url}: {read:?}"
                    );
                }
            }
            None => {
                let child = std::process::Command::new(std::env::current_exe().unwrap())
                    .args(["--exact", NAME, "--nocapture"])
                    .env("PGSSLROOTCERT", "/ca.pem")
                    .output()
                    .unwrap();
                let stdout = String::from_utf8_lossy(&child.stdout);
                assert!(
                    child.status.success() && stdout.contains("1 passed"),
                    "the child with PGSSLROOTCERT set passes: {stdout}{}",
                    String::from_utf8_lossy(&child.stderr)
                );
            }
        }
    }

    // `sqlx` 0.9.1 always sends `SSLRequest` first and has no direct TLS,
    // so a URL asking for `sslnegotiation=direct` is refused before the
    // server takes a port rather than negotiated another way; PostgreSQL's
    // own negotiation is still read.
    #[test]
    fn refuses_direct_negotiation_and_keeps_postgres_negotiation() {
        for query in [
            "sslnegotiation=direct",
            "sslmode=require&sslnegotiation=direct",
        ] {
            let read = connect_options(&format!("{BASE}?{query}"), None);
            let Err(refusal) = &read else {
                panic!("{query} should be refused, not read as {read:?}");
            };
            assert!(
                refusal.to_string().contains("sslnegotiation"),
                "{query}: the refusal names sslnegotiation: {refusal}"
            );
        }
        assert!(matches!(
            mode(&format!("{BASE}?sslmode=require&sslnegotiation=postgres")),
            PgSslMode::VerifyFull
        ));
    }

    #[test]
    fn refuses_what_is_not_a_url() {
        assert!(matches!(
            connect_options("not a url", None),
            Err(PostgresUrlError::Invalid(_))
        ));
    }
}
