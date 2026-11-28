//! `DATABASE_URL` as the PostgreSQL store is given it (ADR 0177): the
//! environment first, then the nearest `.env` at or above where the process
//! runs, trimmed and refused when blank. No server is needed.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

use std::fs;

use host::{DatabaseUrl, DatabaseUrlError, nearest_env_file};

mod given_a_starting_directory {
    use super::*;

    // Case: prefers the nearest .env above the starting directory
    #[test]
    fn prefers_the_nearest_env_above_the_starting_directory() {
        let root = tempfile::tempdir().unwrap();
        let start = root.path().join("packages/app/dist-http");
        fs::create_dir_all(&start).unwrap();
        fs::write(root.path().join(".env"), "DATABASE_URL=root\n").unwrap();
        let nearer = root.path().join("packages/app/.env");
        fs::write(&nearer, "DATABASE_URL=nearer\n").unwrap();
        assert_eq!(nearest_env_file(&start), Some(nearer));
        assert_eq!(
            DatabaseUrl::resolve(None, &start).unwrap().as_str(),
            "nearer"
        );
    }

    // Case: answers undefined rather than a path no file sits at
    #[test]
    fn answers_none_rather_than_a_path_no_file_sits_at() {
        let root = tempfile::tempdir().unwrap();
        let start = root.path().join("packages/app/dist-http");
        fs::create_dir_all(&start).unwrap();
        // The walk runs to the filesystem root and ends there.
        let found = nearest_env_file(&start);
        assert!(
            found
                .as_ref()
                .is_none_or(|path| !path.starts_with(root.path())),
            "{found:?}"
        );
        if found.is_none() {
            assert_eq!(
                DatabaseUrl::resolve(None, &start),
                Err(DatabaseUrlError::Unset)
            );
        }
    }
}

mod given_the_environment {
    use super::*;

    #[test]
    fn prefers_the_environments_value_to_the_env_files() {
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join(".env"), "DATABASE_URL=from-file\n").unwrap();
        assert_eq!(
            DatabaseUrl::resolve(Some("from-environment".to_owned()), root.path())
                .unwrap()
                .as_str(),
            "from-environment"
        );
    }

    // Case: trims a configured DATABASE_URL
    #[test]
    fn trims_the_value() {
        assert_eq!(
            DatabaseUrl::parse(Some("  postgresql://cube@host/db \n"))
                .unwrap()
                .as_str(),
            "postgresql://cube@host/db"
        );
        let root = tempfile::tempdir().unwrap();
        fs::write(
            root.path().join(".env"),
            "DATABASE_URL=\"  postgresql://cube@host/db  \"\n",
        )
        .unwrap();
        assert_eq!(
            DatabaseUrl::resolve(None, root.path()).unwrap().as_str(),
            "postgresql://cube@host/db"
        );
    }

    // JavaScript's `String.prototype.trim`, which `src/prisma/db.ts` applies,
    // removes U+FEFF and keeps U+0085; Rust's `str::trim` does the reverse.
    #[test]
    fn trims_what_javascript_trims_and_nothing_else() {
        assert_eq!(
            DatabaseUrl::parse(Some("\u{feff}postgresql://cube@host/db\u{feff}"))
                .map(|url| url.as_str().to_owned()),
            Ok("postgresql://cube@host/db".to_owned()),
            "a byte order mark either side is trimmed, as JavaScript trims it"
        );
        assert_eq!(
            DatabaseUrl::parse(Some("\u{feff}")),
            Err(DatabaseUrlError::Unset),
            "a byte order mark alone is blank, as JavaScript reads it"
        );
        assert_eq!(
            DatabaseUrl::parse(Some("\u{85}postgresql://cube@host/db\u{85}"))
                .map(|url| url.as_str().to_owned()),
            Ok("\u{85}postgresql://cube@host/db\u{85}".to_owned()),
            "U+0085 is kept, as JavaScript keeps it"
        );
        let root = tempfile::tempdir().unwrap();
        fs::write(
            root.path().join(".env"),
            "DATABASE_URL=\"\u{feff}postgresql://cube@host/db\"\n",
        )
        .unwrap();
        assert_eq!(
            DatabaseUrl::resolve(None, root.path()).map(|url| url.as_str().to_owned()),
            Ok("postgresql://cube@host/db".to_owned()),
            "a byte order mark inside a quoted .env value is trimmed too"
        );
    }

    #[test]
    fn refuses_an_unset_or_blank_value_naming_database_url() {
        for value in [None, Some(""), Some("   ")] {
            let refused = DatabaseUrl::parse(value).unwrap_err();
            assert_eq!(refused, DatabaseUrlError::Unset);
            assert_eq!(
                refused.to_string(),
                "DATABASE_URL must name the PostgreSQL database"
            );
        }
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join(".env"), "DATABASE_URL=   \n").unwrap();
        assert_eq!(
            DatabaseUrl::resolve(None, root.path()),
            Err(DatabaseUrlError::Unset),
            "a blank value in the .env is refused too"
        );
    }

    #[test]
    fn takes_nothing_but_database_url_from_the_env_file() {
        let root = tempfile::tempdir().unwrap();
        fs::write(
            root.path().join(".env"),
            "INFINITY_CUBE_UNRELATED=leaked\nDATABASE_URL=postgresql://cube@host/db\n",
        )
        .unwrap();
        let before = std::env::var_os("INFINITY_CUBE_UNRELATED");
        assert!(DatabaseUrl::resolve(None, root.path()).is_ok());
        assert_eq!(
            std::env::var_os("INFINITY_CUBE_UNRELATED"),
            before,
            "the process environment is not written"
        );
    }

    #[test]
    fn never_prints_the_url() {
        let url = DatabaseUrl::parse(Some("postgresql://cube:secret@host/db")).unwrap();
        assert!(!format!("{url:?}").contains("secret"));
    }
}

/// The `.env` read as Node's `dotenv` 17.4.2 reads it (its `parse`, which
/// `src/prisma/db.ts` calls through `config()` with no `dotenv-expand`): no
/// variable is substituted, and a line its pattern does not match is skipped.
mod given_an_env_file_dotenv_reads {
    use super::*;

    fn resolved(contents: &str) -> Result<DatabaseUrl, DatabaseUrlError> {
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join(".env"), contents).unwrap();
        DatabaseUrl::resolve(None, root.path())
    }

    #[test]
    fn expands_no_variable_in_an_unquoted_value() {
        assert_eq!(
            resolved("DATABASE_URL=postgresql://u:pa$word@host/db\n")
                .unwrap()
                .as_str(),
            "postgresql://u:pa$word@host/db"
        );
    }

    #[test]
    fn expands_no_variable_in_a_double_quoted_value() {
        assert_eq!(
            resolved("DATABASE_URL=\"postgresql://u:${PASS}@host/db\"\n")
                .unwrap()
                .as_str(),
            "postgresql://u:${PASS}@host/db"
        );
    }

    #[test]
    fn skips_a_line_that_does_not_parse() {
        assert_eq!(
            resolved("FOO BAR\nDATABASE_URL=postgresql://u:p@host/db\n")
                .unwrap()
                .as_str(),
            "postgresql://u:p@host/db"
        );
    }

    #[test]
    fn skips_an_unterminated_quote_on_another_line() {
        assert_eq!(
            resolved("OTHER=\"never closed\nDATABASE_URL=postgresql://u:p@host/db\n")
                .unwrap()
                .as_str(),
            "postgresql://u:p@host/db"
        );
    }

    #[test]
    fn reads_an_export_prefix_and_drops_a_trailing_comment() {
        assert_eq!(
            resolved("export DATABASE_URL=postgresql://u:p@host/db # the local one\n")
                .unwrap()
                .as_str(),
            "postgresql://u:p@host/db"
        );
    }

    #[test]
    fn takes_a_single_quoted_value_literally() {
        assert_eq!(
            resolved("DATABASE_URL='postgresql://u:$p@host/db'\n")
                .unwrap()
                .as_str(),
            "postgresql://u:$p@host/db"
        );
    }

    // Each line's start is tried once and the scan moves on: a run of blank
    // lines after a line that does not parse is read in time proportional to
    // its length, not its square. Read quadratically, this input outruns the
    // ten-second bound below.
    #[test]
    fn reads_a_long_run_of_blank_lines_after_a_line_that_does_not_parse_in_linear_time() {
        let contents = format!(
            "DATABASE_URL=postgresql://u:p@host/db\n!!!\n{}",
            "\n".repeat(400_000)
        );
        let (sender, answer) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let _sent = sender.send(resolved(&contents).map(|url| url.as_str().to_owned()));
        });
        let read = answer
            .recv_timeout(std::time::Duration::from_secs(10))
            .expect("the .env is read within ten seconds");
        assert_eq!(read, Ok("postgresql://u:p@host/db".to_owned()));
    }

    #[test]
    fn takes_the_last_of_two_entries() {
        assert_eq!(
            resolved("DATABASE_URL=first\nDATABASE_URL=second\n")
                .unwrap()
                .as_str(),
            "second"
        );
    }
}
