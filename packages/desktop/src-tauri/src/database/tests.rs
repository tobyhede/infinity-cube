//! Tests of what a Space window on a database is keyed by, named by and
//! connected with (ADR 0181).

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

use super::*;

fn postgres(url: &str) -> PostgresDatabase {
    PostgresDatabase::from_form(url, "").unwrap()
}

fn key_of(url: &str) -> AggregateKey {
    Database::Postgres(postgres(url)).key()
}

mod given_a_sqlite_file {
    use super::*;

    #[test]
    fn is_keyed_by_the_sha256_of_sqlite_and_its_path() {
        // `printf 'sqlite:/spaces/cube.db' | shasum -a 256 | cut -c1-32`
        assert_eq!(
            Database::SqliteFile(PathBuf::from("/spaces/cube.db"))
                .key()
                .as_str(),
            "ec4beb130912c37a76a29117db6ec000",
            "the key is the hash of `sqlite:` and the file's canonical path"
        );
    }

    #[test]
    fn gets_another_origin_than_a_folder_at_the_same_path() {
        assert_ne!(
            Database::SqliteFile(PathBuf::from("/spaces/cube.db")).key(),
            AggregateKey::of(Path::new("/spaces/cube.db")),
            "a file and a folder at one path keep their `localStorage` apart"
        );
    }

    #[test]
    fn is_named_by_its_path_and_titled_by_its_file_name() {
        let file = Database::SqliteFile(PathBuf::from("/spaces/cube.db"));
        assert_eq!(file.named(), "the SQLite file /spaces/cube.db");
        assert_eq!(file.title(), "cube.db");
    }
}

mod given_a_postgresql_url {
    use super::*;

    #[test]
    fn is_keyed_by_postgres_and_its_user_host_port_and_database() {
        // `printf 'postgres:cube@db.example.com:5432/cube' | shasum -a 256 | cut -c1-32`
        assert_eq!(
            key_of("postgres://cube:secret@DB.Example.com/cube").as_str(),
            "6700a118f15446effd96ab87a4bdccac",
            "the host in lower case, port 5432 where none is named, and no password"
        );
    }

    #[test]
    fn keeps_its_key_when_the_password_or_a_tls_setting_changes() {
        let first = key_of("postgres://cube:secret@db.example.com:5432/cube");
        for other in [
            "postgres://cube:changed@db.example.com:5432/cube",
            "postgres://cube@db.example.com:5432/cube?sslmode=require",
            "postgresql://cube@db.example.com/cube?application_name=desk",
        ] {
            assert_eq!(key_of(other), first, "{other} names the same database");
        }
        assert_eq!(
            Database::Postgres(
                PostgresDatabase::from_form("postgres://cube@db.example.com/cube", "pw").unwrap()
            )
            .key(),
            first,
            "a password given in the form is no part of the key"
        );
    }

    #[test]
    fn another_user_host_port_or_database_is_another_origin() {
        let first = key_of("postgres://cube@db.example.com:5432/cube");
        for other in [
            "postgres://other@db.example.com:5432/cube",
            "postgres://cube@db2.example.com:5432/cube",
            "postgres://cube@db.example.com:5433/cube",
            "postgres://cube@db.example.com:5432/other",
        ] {
            assert_ne!(key_of(other), first, "{other} is another database");
        }
    }

    #[test]
    fn spells_its_identity_so_that_no_two_identities_share_a_key() {
        assert_ne!(
            key_of("postgres://a%40b@db.example.com/c"),
            key_of("postgres://a@b%40db.example.com/c"),
            "a user holding `@` is not read as part of the host"
        );
    }

    #[test]
    fn is_kept_and_named_without_its_password() {
        let database = postgres(
            "postgres://cube:secret@db.example.com:5433/cube?sslmode=require&password=other",
        );
        assert_eq!(
            database.kept_url(),
            "postgres://cube@db.example.com:5433/cube?sslmode=require",
            "the user-info password and every `password` parameter are dropped"
        );
        let named = Database::Postgres(database).named();
        assert_eq!(
            named,
            "the PostgreSQL database postgres://cube@db.example.com:5433/cube?sslmode=require"
        );
    }

    #[test]
    fn connects_with_the_password_the_form_gave_and_never_shows_it() {
        let database =
            PostgresDatabase::from_form("postgres://cube@db.example.com/cube?password=old", "p@ss")
                .unwrap();
        let connect = url::Url::parse(database.connect_url().as_str()).unwrap();
        assert_eq!(
            connect.password(),
            Some("p%40ss"),
            "the form's password is the one connected with"
        );
        assert!(
            connect.query_pairs().all(|(name, _)| name != "password"),
            "the form's password wins over one in the URL"
        );
        let shown = format!("{database:?} {}", database.kept_url());
        assert!(
            !shown.contains("p@ss") && !shown.contains("p%40ss") && !shown.contains("old"),
            "no password is shown: {shown}"
        );
    }

    #[test]
    fn is_titled_by_its_database_name() {
        assert_eq!(
            Database::Postgres(postgres("postgres://cube@db.example.com/slides")).title(),
            "slides"
        );
    }

    #[test]
    fn refuses_a_blank_url_or_one_that_is_not_postgresql_without_echoing_it() {
        assert_eq!(
            PostgresDatabase::from_form("  ", "").unwrap_err(),
            NotConnected::Blank
        );
        for url in [
            "mysql://cube:secret@db.example.com/cube",
            "postgres://cube:secret@db.example.com:notaport/cube",
        ] {
            let refused = PostgresDatabase::from_form(url, "")
                .unwrap_err()
                .to_string();
            assert!(
                !refused.contains("secret"),
                "{url} is refused without its password: {refused}"
            );
        }
    }
}
