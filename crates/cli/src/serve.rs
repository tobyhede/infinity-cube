//! `serve --store sqlite`: serve the SQLite file `SQLITE_PATH` names, as
//! `pnpm dev:sqlite` serves it, on `127.0.0.1` behind the listener and `Host`
//! check `run` uses, announcing itself as `run` does. It runs no Import and
//! no Export, takes no directory lock, and migrates nothing: the file is one
//! `pnpm db:migrate:sqlite` has migrated.
//!
//! `SQLITE_PATH` is refused before any port is taken, by the host's rules
//! (Storage ST-126) and by the CLI's own: a file that does not exist is
//! refused, naming the migration, and nothing is created there.
//!
//! Start-up (ST-10) runs once the host is announced, so a store that is not
//! answering never delays the announcement: until the Meta Space is
//! established each request is answered as the store answers it, 503 while
//! the file is held or the root while it is uninitialized, and each failed
//! attempt is said on standard error. Start-up that stops on a failure no
//! wait cures says so and leaves the host serving those answers, as the
//! TypeScript database host does.
//!
//! The first stop signal stops accepting and lets each open connection finish
//! the request it is answering for at most [`listener::DRAIN_BOUND`]; every
//! commit is already in the file, so the host closes it and exits zero. Any
//! signal after the first exits at once, one.

use std::ffi::OsStr;
use std::process::ExitCode;
use std::sync::Arc;

use host::{Application, RandomIds, SqlitePath, SqliteSpaceRepository, TokioClock};

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

/// The repository `serve` opens over `path`: the host's, waiting five
/// seconds on another holder's lock (ST-127).
fn repository(path: &SqlitePath) -> SqliteSpaceRepository {
    SqliteSpaceRepository::open(path)
}

/// Serve the store `command` names until a stop signal, answering the exit code.
pub(crate) async fn serve(command: ServeCommand) -> ExitCode {
    let Store::Sqlite = command.store;
    let mut signals = match Signals::install() {
        Ok(signals) => signals,
        Err(error) => return refuse(&format!("Could not take the stop signals: {error}")),
    };
    let variable = std::env::var_os("SQLITE_PATH");
    let path = match sqlite_file(variable.as_deref()) {
        Ok(path) => path,
        Err(message) => return refuse(&message),
    };
    let (shell, origin) = match built::load(command.built.as_deref()) {
        Ok(loaded) => loaded,
        Err(error) => return refuse(&format!("Could not serve the built application: {error}")),
    };
    let file = path.as_path().display().to_string();

    let listener = match bind(command.port).await {
        Ok(listener) => listener,
        Err(error) => {
            let tried = listener::ports_tried(command.port);
            return refuse(&format!("Could not serve {file} on {tried}: {error}"));
        }
    };
    let port = match listener.local_addr() {
        Ok(address) => address.port(),
        Err(error) => return refuse(&format!("Could not serve {file}: {error}")),
    };
    if signals.pending().await {
        say(&format!("Stopped before serving {file}."));
        return ExitCode::SUCCESS;
    }

    let repository = Arc::new(repository(&path));
    let application = Arc::new(
        Application::new(Arc::clone(&repository), RandomIds, shell)
            .on_error(|context, error| say(&format!("{context}: {error}"))),
    );
    announce_listening(port);
    let own = own_host(port);
    built::say_if_placeholder(&origin);
    say(&format!(
        "Serving {file} at http://{own}/\nPress Ctrl-C to stop."
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
    repository.close().await;
    say(&format!("Stopped; {file} holds every edit."));
    ExitCode::SUCCESS
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn opens_the_file_waiting_five_seconds_on_another_holders_lock() {
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("cube.db");
        std::fs::File::create(&file).unwrap();
        let path = SqlitePath::from_variable(file.to_str()).unwrap();
        let repository = repository(&path);
        let settings = repository.connection_settings().await.unwrap();
        assert_eq!(settings.busy_timeout_ms, 5_000);
        repository.close().await;
    }
}
