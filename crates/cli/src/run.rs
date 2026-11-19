//! `run <dir>`: run an Aggregate directory (ADR 0117) by Storage ST-120,
//! with the announcement the HTTP conformance suite reads.
//!
//! Import first, refusing a directory it cannot run before any port is
//! taken; then listen, announce, and serve until a stop signal. The first
//! signal stops accepting, lets each open connection finish the request it
//! is answering for at most [`listener::DRAIN_BOUND`] and then drops those
//! still open, so a stalled client cannot hold the write; it then writes
//! any Edit not yet on disk and exits zero, or one if that write failed;
//! any signal after it exits at once, one. A signal before the run serves
//! exits zero, since nothing can have been committed, and is checked again
//! once the port is taken, so a run stopped by then announces nothing and
//! opens no browser.
//!
//! No launcher stands between the terminal and the process, so every signal
//! here is one the author sent and none is dropped as a repeat.

use std::path::Path;
use std::process::ExitCode;
use std::sync::Arc;

use host::{ImportError, RandomIds, Run, RunEvent, RunStopped, TokioClock};

use crate::arguments::RunCommand;
use crate::built::{self, Origin};
use crate::describe::{empty, refused};
use crate::listener::{bind, own_host, serve};
use crate::output::{announce_listening, announce_refused, say};
use crate::signals::Signals;
use crate::{browser, listener};

/// Announce why the directory cannot run, say so in full, and exit one.
fn refuse(message: &str) -> ExitCode {
    say(message);
    announce_refused(message);
    ExitCode::FAILURE
}

fn import_refusal(directory: &Path, error: &ImportError) -> String {
    match error {
        ImportError::Empty => empty(directory),
        ImportError::Refused(refusals) => refused(directory, refusals),
        other => format!("Could not start a run on {}: {other}", directory.display()),
    }
}

fn report(event: &RunEvent<'_>) {
    if let RunEvent::WriteFailed(error) = event {
        say(&format!("Could not write the directory: {error}"));
    }
}

/// Run `command.directory` until a stop signal, answering the exit code.
pub(crate) async fn run(command: RunCommand) -> ExitCode {
    let mut signals = match Signals::install() {
        Ok(signals) => signals,
        Err(error) => return refuse(&format!("Could not take the stop signals: {error}")),
    };
    let directory =
        std::path::absolute(&command.directory).unwrap_or_else(|_| command.directory.clone());
    let (shell, origin) = match built::load(command.built.as_deref()) {
        Ok(loaded) => loaded,
        Err(error) => return refuse(&format!("Could not serve the built application: {error}")),
    };

    let starting = Run::builder()
        .directory(&directory)
        .ids(RandomIds)
        .clock(TokioClock)
        .on_event(report)
        .on_error(|context, error| say(&format!("{context}: {error}")))
        .start(shell);
    let run = tokio::select! {
        started = starting => match started {
            Ok(run) => run,
            Err(error) => return refuse(&import_refusal(&directory, &error)),
        },
        () = signals.next() => {
            say(&format!("Stopped before serving {}.", directory.display()));
            return ExitCode::SUCCESS;
        }
    };

    let listener = match bind(command.port).await {
        Ok(listener) => listener,
        Err(error) => {
            let tried = match command.port {
                Some(port) => format!("port {port}"),
                None => format!("a port from {} up", listener::DEFAULT_PORT),
            };
            // Nothing can have been committed, so the stop writes nothing.
            let _stopped = run.stop().await;
            return refuse(&format!(
                "Could not serve {} on {tried}: {error}",
                directory.display()
            ));
        }
    };
    let port = match listener.local_addr() {
        Ok(address) => address.port(),
        Err(error) => {
            let _stopped = run.stop().await;
            return refuse(&format!("Could not serve {}: {error}", directory.display()));
        }
    };

    if signals.pending().await {
        drop(listener);
        let _stopped = run.stop().await;
        say(&format!("Stopped before serving {}.", directory.display()));
        return ExitCode::SUCCESS;
    }

    announce_listening(port);
    let own = own_host(port);
    let url = format!("http://{own}/");
    if origin == Origin::Placeholder {
        say(
            "This binary carries no built application, so it serves a placeholder page: \
             rebuild it with INFINITY_CUBE_BUILT_APPLICATION naming the directory `pnpm build` \
             writes, or pass --built <dir>.",
        );
    }
    say(&format!(
        "Running {} at {url}\nPress Ctrl-C to stop.",
        directory.display()
    ));
    if command.open {
        browser::open(&url);
    }

    let draining = serve(listener, Arc::clone(run.application()), own, signals.next()).await;
    say("Stopping: writing any edit not yet on disk…");
    drop(tokio::spawn(async move {
        signals.next().await;
        say("Exiting without waiting for the last write.");
        std::process::exit(1);
    }));
    if !draining.finish(listener::DRAIN_BOUND).await {
        say("Dropped the connections still open after waiting for them.");
    }
    match run.stop().await {
        RunStopped::Stopped => {
            say(&format!(
                "Stopped; {} holds every edit.",
                directory.display()
            ));
            ExitCode::SUCCESS
        }
        RunStopped::Unwritten(error) => {
            say(&format!(
                "Stopped, but the last edits were not written: {error}"
            ));
            ExitCode::FAILURE
        }
        other => {
            say(&format!(
                "Stopped, but the run ended unexpectedly: {other:?}"
            ));
            ExitCode::FAILURE
        }
    }
}
