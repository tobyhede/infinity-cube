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
//! each failed attempt is said on standard error, as is start-up's success
//! once the Meta Space is established. Start-up that stops on a
//! failure no wait cures says so and leaves the host serving those answers,
//! as the TypeScript database host does.
//!
//! The first stop signal stops accepting and lets each open connection finish
//! the request it is answering for at most [`listener::DRAIN_BOUND`]; every
//! commit is already in the store, so the host closes it and exits zero. The
//! close waits for the operations still under way until [`STOP_BOUND`] after
//! the first signal, which the drain shares (ADR 0177), then the host says it
//! stopped without them and exits zero all the same. The runtime's shutdown,
//! which waits for blocking work such as a hostname lookup, keeps to the
//! same deadline. Any signal after the first exits at once, one.

use std::ffi::OsStr;
use std::process::ExitCode;
use std::sync::Arc;
use std::time::Duration;

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

/// The database a `serve` names, read before the runtime starts: for
/// PostgreSQL, its URL (ADR 0177).
pub(crate) enum Database {
    /// The SQLite file `SQLITE_PATH` names, which `serve` reads itself.
    Sqlite,
    /// The PostgreSQL database this URL names.
    Postgres(DatabaseUrl),
}

/// The database `store` names, or the exit code of its refusal. `main` calls
/// it before it starts the runtime.
pub(crate) fn database(store: Store) -> Result<Database, ExitCode> {
    match store {
        Store::Sqlite => Ok(Database::Sqlite),
        Store::Postgres => database_url()
            .map(Database::Postgres)
            .map_err(|message| refuse(&message)),
    }
}

/// `DATABASE_URL` from the environment, then the nearest `.env` at or above
/// where the process runs, trimmed and refused when blank.
fn database_url() -> Result<DatabaseUrl, String> {
    let resolved = match std::env::var(DATABASE_URL) {
        Ok(value) => DatabaseUrl::parse(Some(&value)),
        Err(std::env::VarError::NotPresent) => {
            // Only the `.env` fallback asks where the process runs.
            let from = std::env::current_dir().map_err(|error| {
                format!("Could not read the directory to look for .env from: {error}")
            })?;
            DatabaseUrl::resolve(None, &from)
        }
        Err(std::env::VarError::NotUnicode(_)) => {
            return Err(format!("{DATABASE_URL} must be UTF-8"));
        }
    };
    resolved.map_err(|error| error.to_string())
}

/// What start-up says once it has established the Meta Space.
const ESTABLISHED: &str = "Established the Meta Space.";

/// How long after the first stop signal the stop may take: the connections'
/// drain, within its own [`listener::DRAIN_BOUND`], and then the store's
/// close share it (ADR 0177). Closing waits for every operation under way,
/// and an operation waiting on a database that does not answer, or on a lock
/// another session holds, has no bound of its own; ST-120 lets such a
/// database delay neither the announcement nor the stop.
const STOP_BOUND: Duration = Duration::from_secs(5);

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

/// Serve `database`, which `command` names, until a stop signal, answering
/// the exit code and, once a stop signal has come, the deadline the stop,
/// the runtime's shutdown among it, keeps to.
pub(crate) async fn serve(
    command: ServeCommand,
    database: Database,
) -> (ExitCode, Option<std::time::Instant>) {
    let signals = match Signals::install() {
        Ok(signals) => signals,
        Err(error) => {
            return (
                refuse(&format!("Could not take the stop signals: {error}")),
                None,
            );
        }
    };
    match database {
        Database::Sqlite => {
            let variable = std::env::var_os("SQLITE_PATH");
            let path = match sqlite_file(variable.as_deref()) {
                Ok(path) => path,
                Err(message) => return (refuse(&message), None),
            };
            let file = path.as_path().display().to_string();
            let store = SqliteSpaceRepository::open(&path);
            serving(command, signals, &file, store).await
        }
        Database::Postgres(url) => {
            let store = match PostgresSpaceRepository::open(&url) {
                Ok(store) => store,
                Err(error) => return (refuse(&error.to_string()), None),
            };
            let named = format!("the PostgreSQL database {DATABASE_URL} names");
            serving(command, signals, &named, store).await
        }
    }
}

/// Serve `repository`, which `named` describes, once a port is taken,
/// answering as [`serve`] does.
async fn serving<R: Closing>(
    command: ServeCommand,
    mut signals: Signals,
    named: &str,
    repository: R,
) -> (ExitCode, Option<std::time::Instant>) {
    let (shell, origin) = match built::load(command.built.as_deref()) {
        Ok(loaded) => loaded,
        Err(error) => {
            return (
                refuse(&format!("Could not serve the built application: {error}")),
                None,
            );
        }
    };
    let listener = match bind(command.port).await {
        Ok(listener) => listener,
        Err(error) => {
            let tried = listener::ports_tried(command.port);
            return (
                refuse(&format!("Could not serve {named} on {tried}: {error}")),
                None,
            );
        }
    };
    let port = match listener.local_addr() {
        Ok(address) => address.port(),
        Err(error) => return (refuse(&format!("Could not serve {named}: {error}")), None),
    };
    if signals.pending().await {
        say(&format!("Stopped before serving {named}."));
        return (
            ExitCode::SUCCESS,
            Some(std::time::Instant::now() + STOP_BOUND),
        );
    }

    let repository = Arc::new(repository);
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
            match established {
                Ok(_) => say(ESTABLISHED),
                Err(error) => say(&format!(
                    "Gave up establishing the Meta Space; restart the host once it is fixable: {error}"
                )),
            }
        })
    };

    let draining = serve_on(listener, application, own, signals.next()).await;
    let deadline = tokio::time::Instant::now() + STOP_BOUND;
    drop(tokio::spawn(async move {
        signals.next().await;
        say("Exiting without waiting for open requests.");
        std::process::exit(1);
    }));
    establishing.abort();
    let drain =
        listener::DRAIN_BOUND.min(deadline.saturating_duration_since(tokio::time::Instant::now()));
    if !draining.finish(drain).await {
        say("Dropped the connections still open after waiting for them.");
    }
    if tokio::time::timeout_at(deadline, repository.shut())
        .await
        .is_err()
    {
        say(&format!(
            "Stopped without waiting for the operations still under way on {named}."
        ));
        return (ExitCode::SUCCESS, Some(deadline.into_std()));
    }
    say(&format!("Stopped; {named} holds every edit."));
    (ExitCode::SUCCESS, Some(deadline.into_std()))
}

/// Shut `runtime` down once `serve` has answered, by the stop's `deadline`
/// when it names one: dropping a runtime waits for every blocking task, and
/// a hostname lookup still running on the blocking pool has no bound of its
/// own (ADR 0177, ST-120).
pub(crate) fn shut_down(runtime: tokio::runtime::Runtime, deadline: Option<std::time::Instant>) {
    match deadline {
        Some(deadline) => {
            runtime.shutdown_timeout(deadline.saturating_duration_since(std::time::Instant::now()));
        }
        None => drop(runtime),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ADR 0177, ST-120: the stop is bounded. Dropping a runtime waits for
    // every blocking task, a hostname lookup among them, without a bound.
    #[test]
    fn shuts_the_runtime_down_by_the_deadline_however_long_a_blocking_task_runs() {
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(1)
            .build()
            .unwrap();
        let (started, running) = std::sync::mpsc::channel();
        drop(runtime.spawn_blocking(move || {
            started.send(()).unwrap();
            std::thread::sleep(Duration::from_secs(30));
        }));
        running.recv().unwrap();
        let begun = std::time::Instant::now();
        shut_down(runtime, Some(begun + Duration::from_millis(200)));
        let took = begun.elapsed();
        assert!(
            took < Duration::from_secs(1),
            "the shutdown took {took:?}, past the deadline"
        );
    }
}
