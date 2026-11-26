//! `serve --store <sqlite|postgres>`: serve a database, as `pnpm dev:sqlite`
//! and `pnpm dev` serve it, on `127.0.0.1` behind the listener and `Host`
//! check `run` uses, announcing itself as `run` does. It runs no Import and
//! no Export, takes no directory lock, and migrates nothing: the database is
//! one `pnpm db:migrate:sqlite` or `pnpm db:migrate` has migrated.
//!
//! `--store sqlite` serves the file `SQLITE_PATH` names, which is refused
//! before any port is taken, by the host's rules (Storage ST-126) and by the
//! CLI's own: a file that does not exist is refused, naming the migration,
//! and nothing is created there. `--store postgres` serves the database
//! `DATABASE_URL` names, read from the environment and then from the nearest
//! `.env` (ADR 0177), trimmed, and refused before any port is taken when
//! unset or blank; the URL is never written out.
//!
//! Start-up (ST-10) runs once the host is announced, so a store that is not
//! answering never delays the announcement: until the Meta Space is
//! established each request is answered as the store answers it, 503 while
//! the store is not answering or the root while it is uninitialized, and
//! each failed attempt is said on standard error. Start-up that stops on a
//! failure no wait cures says so and leaves the host serving those answers,
//! as the TypeScript database host does.
//!
//! The first stop signal stops accepting and lets each open connection finish
//! the request it is answering for at most [`listener::DRAIN_BOUND`]; every
//! commit is already in the store, so the host closes it and exits zero. Any
//! signal after the first exits at once, one.

use std::ffi::OsStr;
use std::process::ExitCode;
use std::sync::Arc;

use host::{
    Application, DATABASE_URL, DatabaseUrl, PostgresSpaceRepository, RandomIds, SpaceRepository,
    SqlitePath, SqliteSpaceRepository, TokioClock,
};

use crate::arguments::{ServeCommand, Store};
use crate::built;
use crate::listener::{self, bind, own_host, serve as serve_on};
use crate::output::{announce_listening, refuse, say};
use crate::signals::Signals;

/// The file `SQLITE_PATH` names, by the host's rules, which must exist and be
/// a regular file: the CLI's rules, a missing file in the TypeScript CLI's
/// words (`src/sqlite/db.ts`). A value that is not UTF-8 is refused rather
/// than read lossily, which could name another file.
fn sqlite_file(value: Option<&OsStr>) -> Result<SqlitePath, String> {
    let value = value
        .map(|value| {
            value
                .to_str()
                .ok_or_else(|| format!("SQLITE_PATH must be UTF-8: {}", value.display()))
        })
        .transpose()?;
    let path = SqlitePath::from_variable(value).map_err(|error| error.to_string())?;
    match std::fs::metadata(path.as_path()) {
        Ok(metadata) if metadata.is_file() => Ok(path),
        Ok(_) => Err(format!(
            "SQLITE_PATH must name a regular file: {}",
            path.as_path().display()
        )),
        Err(_) => Err(format!(
            "SQLite database file does not exist: {}. Run pnpm db:migrate:sqlite first.",
            path.as_path().display()
        )),
    }
}

/// `DATABASE_URL` from the environment, then the nearest `.env` at or above
/// where the process runs, trimmed and refused when blank.
fn database_url() -> Result<DatabaseUrl, String> {
    let variable = match std::env::var(DATABASE_URL) {
        Ok(value) => Some(value),
        Err(std::env::VarError::NotPresent) => None,
        Err(std::env::VarError::NotUnicode(_)) => {
            return Err(format!("{DATABASE_URL} must be UTF-8"));
        }
    };
    let from = std::env::current_dir()
        .map_err(|error| format!("Could not read the directory to look for .env from: {error}"))?;
    DatabaseUrl::resolve(variable, &from).map_err(|error| error.to_string())
}

/// A store `serve` can close once it has drained.
trait Closing: SpaceRepository {
    fn shut(&self) -> impl Future<Output = ()> + Send;
}

impl Closing for SqliteSpaceRepository {
    fn shut(&self) -> impl Future<Output = ()> + Send {
        self.close()
    }
}

impl Closing for PostgresSpaceRepository {
    fn shut(&self) -> impl Future<Output = ()> + Send {
        self.close()
    }
}

/// Serve the store `command` names until a stop signal, answering the exit code.
pub(crate) async fn serve(command: ServeCommand) -> ExitCode {
    let signals = match Signals::install() {
        Ok(signals) => signals,
        Err(error) => return refuse(&format!("Could not take the stop signals: {error}")),
    };
    match command.store {
        Store::Sqlite => {
            let variable = std::env::var_os("SQLITE_PATH");
            let path = match sqlite_file(variable.as_deref()) {
                Ok(path) => path,
                Err(message) => return refuse(&message),
            };
            let file = path.as_path().display().to_string();
            serving(command, signals, &file, || {
                SqliteSpaceRepository::open(&path)
            })
            .await
        }
        Store::Postgres => {
            let url = match database_url() {
                Ok(url) => url,
                Err(message) => return refuse(&message),
            };
            let store = match PostgresSpaceRepository::open(&url) {
                Ok(store) => store,
                Err(error) => return refuse(&error.to_string()),
            };
            let named = format!("the PostgreSQL database {DATABASE_URL} names");
            serving(command, signals, &named, move || store).await
        }
    }
}

/// Serve the store `open` opens, which `named` describes, once a port is
/// taken.
async fn serving<R: Closing>(
    command: ServeCommand,
    mut signals: Signals,
    named: &str,
    open: impl FnOnce() -> R,
) -> ExitCode {
    let (shell, origin) = match built::load(command.built.as_deref()) {
        Ok(loaded) => loaded,
        Err(error) => return refuse(&format!("Could not serve the built application: {error}")),
    };
    let listener = match bind(command.port).await {
        Ok(listener) => listener,
        Err(error) => {
            let tried = listener::ports_tried(command.port);
            return refuse(&format!("Could not serve {named} on {tried}: {error}"));
        }
    };
    let port = match listener.local_addr() {
        Ok(address) => address.port(),
        Err(error) => return refuse(&format!("Could not serve {named}: {error}")),
    };
    if signals.pending().await {
        say(&format!("Stopped before serving {named}."));
        return ExitCode::SUCCESS;
    }

    let repository = Arc::new(open());
    let application = Arc::new(
        Application::new(Arc::clone(&repository), RandomIds, shell)
            .on_error(|context, error| say(&format!("{context}: {error}"))),
    );
    announce_listening(port);
    let own = own_host(port);
    built::say_if_placeholder(&origin);
    say(&format!(
        "Serving {named} at http://{own}/\nPress Ctrl-C to stop."
    ));

    let establishing = {
        let repository = Arc::clone(&repository);
        tokio::spawn(async move {
            let established =
                host::keep_establishing(repository.as_ref(), &RandomIds, &TokioClock, |error| {
                    say(&format!(
                        "Failed to establish the Meta Space at startup: {error}"
                    ))
                })
                .await;
            if let Err(error) = established {
                say(&format!(
                    "Gave up establishing the Meta Space; restart the host once it is fixable: {error}"
                ));
            }
        })
    };

    let draining = serve_on(listener, application, own, signals.next()).await;
    drop(tokio::spawn(async move {
        signals.next().await;
        say("Exiting without waiting for open requests.");
        std::process::exit(1);
    }));
    establishing.abort();
    if !draining.finish(listener::DRAIN_BOUND).await {
        say("Dropped the connections still open after waiting for them.");
    }
    repository.shut().await;
    say(&format!("Stopped; {named} holds every edit."));
    ExitCode::SUCCESS
}
