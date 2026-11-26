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
        assert!(DatabaseUrl::resolve(None, root.path()).is_ok());
        assert!(
            std::env::var("INFINITY_CUBE_UNRELATED").is_err(),
            "the process environment is not written"
        );
    }

    #[test]
    fn never_prints_the_url() {
        let url = DatabaseUrl::parse(Some("postgresql://cube:secret@host/db")).unwrap();
        assert!(!format!("{url:?}").contains("secret"));
    }
}
