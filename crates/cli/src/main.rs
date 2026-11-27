//! `infinity-cube`: run or check an Aggregate directory with the Rust host
//! (ADR 0155), as `pnpm cube run` and `pnpm cube check` do.
//!
//! - `init <dir>` writes a new aggregate to a missing or empty directory.
//! - `run <dir> [--port <port>] [--no-open] [--built <dir>]` serves the
//!   directory on `127.0.0.1` and writes Edits back to it; it announces
//!   itself, or why it cannot run, as one JSON line on standard output
//!   (`conformance/http/README.md`), and writes everything else to standard
//!   error.
//! - `check <dir> [--json]` Imports the directory into a store that is then
//!   discarded and exits zero for an accepted one; `--json` writes the answer
//!   as one object shaped as the intake corpus's `expect`.
//! - `serve --store sqlite [--port <port>] [--built <dir>]` serves the
//!   migrated SQLite file `SQLITE_PATH` names on `127.0.0.1`, announcing
//!   itself as `run` does; it Imports, Exports and migrates nothing.
//!   `serve --store postgres` serves the migrated PostgreSQL database
//!   `DATABASE_URL` names alike.
//!
//! - `version` names the version and the commit the binary was built from.
//!
//! A usage error exits two.

mod arguments;
mod browser;
mod built;
mod check;
mod describe;
mod init;
mod listener;
mod output;
mod run;
mod serve;
mod signals;
mod version;

use std::process::ExitCode;

use anyhow::Context as _;

use crate::arguments::{Command, HELP, USAGE};

fn main() -> anyhow::Result<ExitCode> {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    let Some(command) = arguments::parse(&args) else {
        output::say(USAGE.trim_end());
        return Ok(ExitCode::from(2));
    };
    Ok(match command {
        Command::Help => {
            output::answer(HELP.trim_end());
            ExitCode::SUCCESS
        }
        Command::Version => {
            output::answer(&version::version());
            ExitCode::SUCCESS
        }
        Command::Init(directory) => tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .context("could not start the async runtime")?
            .block_on(init::init(&directory)),
        Command::Check(command) => tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .context("could not start the async runtime")?
            .block_on(check::check(&command)),
        Command::Run(command) => tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .context("could not start the async runtime")?
            .block_on(run::run(command)),
        Command::Serve(command) => match serve::database(command.store) {
            Err(refused) => refused,
            Ok(database) => {
                let runtime = tokio::runtime::Builder::new_multi_thread()
                    .enable_all()
                    .build()
                    .context("could not start the async runtime")?;
                let (code, deadline) = runtime.block_on(serve::serve(command, database));
                serve::shut_down(runtime, deadline);
                code
            }
        },
    })
}
