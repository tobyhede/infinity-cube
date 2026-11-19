//! The command line: one directory, never an option or the empty string,
//! each option that takes a value at most once, `--json` at most once, and
//! any number of `--no-open`, or a usage error.

use std::ffi::{OsStr, OsString};
use std::path::PathBuf;

/// What a command line asks for.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum Command {
    Help,
    Run(RunCommand),
    Check(CheckCommand),
}

/// `run <dir> [--port <port>] [--no-open] [--built <dir>]`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct RunCommand {
    pub(crate) directory: PathBuf,
    /// The port `--port` names; without one the run takes the default or the next free one.
    pub(crate) port: Option<u16>,
    pub(crate) open: bool,
    /// A built application to serve from disk in place of the one embedded.
    pub(crate) built: Option<PathBuf>,
}

/// `check <dir> [--json]`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct CheckCommand {
    pub(crate) directory: PathBuf,
    /// Write the answer to standard output as one JSON object.
    pub(crate) json: bool,
}

pub(crate) const USAGE: &str = "Usage: infinity-cube <run|check|help> [arguments]\n";

pub(crate) const HELP: &str = "\
Usage: infinity-cube <verb> [arguments]

  run <dir> [--port <port>] [--no-open] [--built <dir>]
      Serve an Aggregate directory, writing edits back to it
  check <dir> [--json]
      Import an Aggregate directory as run does, serving and writing nothing
  help
      Show this help
";

/// Neither the empty string nor an option is a directory.
fn directory(argument: &OsStr) -> Option<PathBuf> {
    let bytes = argument.as_encoded_bytes();
    (!bytes.is_empty() && !bytes.starts_with(b"-")).then(|| PathBuf::from(argument))
}

fn port(value: Option<&OsString>) -> Option<u16> {
    let text = value?.to_str()?;
    if text.is_empty() || !text.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    // Leading zeros are digits too, as `/^\d+$/` reads them.
    let trimmed = text.trim_start_matches('0');
    let port: u32 = if trimmed.is_empty() {
        0
    } else if trimmed.len() > 5 {
        return None;
    } else {
        trimmed.parse().ok()?
    };
    u16::try_from(port).ok().filter(|port| *port > 0)
}

fn run(args: &[OsString]) -> Option<RunCommand> {
    let mut found: Option<PathBuf> = None;
    let mut chosen_port = None;
    let mut open = true;
    let mut built = None;
    let mut rest = args.iter();
    while let Some(argument) = rest.next() {
        match argument.to_str() {
            Some("--no-open") => open = false,
            Some("--port") => {
                if chosen_port.is_some() {
                    return None;
                }
                chosen_port = Some(port(rest.next())?);
            }
            Some("--built") => {
                if built.is_some() {
                    return None;
                }
                built = Some(directory(rest.next()?)?);
            }
            _ => {
                if found.is_some() {
                    return None;
                }
                found = Some(directory(argument)?);
            }
        }
    }
    Some(RunCommand {
        directory: found?,
        port: chosen_port,
        open,
        built,
    })
}

fn check(args: &[OsString]) -> Option<CheckCommand> {
    let mut found: Option<PathBuf> = None;
    let mut json = false;
    for argument in args {
        if argument == "--json" {
            if json {
                return None;
            }
            json = true;
        } else {
            if found.is_some() {
                return None;
            }
            found = Some(directory(argument)?);
        }
    }
    Some(CheckCommand {
        directory: found?,
        json,
    })
}

/// The command a command line (without the program's name) names, or
/// `None` for a usage error.
pub(crate) fn parse(args: &[OsString]) -> Option<Command> {
    let (verb, rest) = args.split_first()?;
    match verb.to_str()? {
        "help" | "--help" => rest.is_empty().then_some(Command::Help),
        "run" => run(rest).map(Command::Run),
        "check" => check(rest).map(Command::Check),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parsed(args: &[&str]) -> Option<Command> {
        let args: Vec<OsString> = args.iter().map(OsString::from).collect();
        parse(&args)
    }

    mod given_run {
        use super::*;

        #[test]
        fn reads_a_directory_alone_as_opening_on_the_default_port() {
            assert_eq!(
                parsed(&["run", "talk"]),
                Some(Command::Run(RunCommand {
                    directory: PathBuf::from("talk"),
                    port: None,
                    open: true,
                    built: None,
                })),
                "a directory alone"
            );
        }

        #[test]
        fn reads_every_option_in_any_order() {
            assert_eq!(
                parsed(&[
                    "run",
                    "--no-open",
                    "--port",
                    "5300",
                    "talk",
                    "--built",
                    "dist"
                ]),
                Some(Command::Run(RunCommand {
                    directory: PathBuf::from("talk"),
                    port: Some(5300),
                    open: false,
                    built: Some(PathBuf::from("dist")),
                })),
                "every option"
            );
        }

        #[test]
        fn refuses_a_port_outside_one_to_65535() {
            for bad in ["0", "65536", "-1", "80a", "", "999999"] {
                assert_eq!(
                    parsed(&["run", "talk", "--port", bad]),
                    None,
                    "port {bad:?}"
                );
            }
            assert!(
                parsed(&["run", "talk", "--port", "065535"]).is_some(),
                "a leading zero is still a port"
            );
        }

        #[test]
        fn refuses_a_second_directory_a_second_port_or_no_directory() {
            for args in [
                &["run", "a", "b"][..],
                &["run", "a", "--port", "1", "--port", "2"],
                &["run"],
                &["run", ""],
                &["run", "--port"],
                &["run", "-x"],
            ] {
                assert_eq!(parsed(args), None, "{args:?}");
            }
        }
    }

    mod given_check {
        use super::*;

        #[test]
        fn reads_a_directory_and_json() {
            assert_eq!(
                parsed(&["check", "--json", "talk"]),
                Some(Command::Check(CheckCommand {
                    directory: PathBuf::from("talk"),
                    json: true,
                })),
                "json"
            );
            assert_eq!(parsed(&["check", "talk", "--port", "1"]), None, "no port");
        }
    }

    #[test]
    fn refuses_an_unknown_verb_and_reads_help_alone() {
        assert_eq!(parsed(&["serve", "talk"]), None, "unknown verb");
        assert_eq!(parsed(&[]), None, "nothing");
        assert_eq!(parsed(&["help"]), Some(Command::Help), "help");
        assert_eq!(parsed(&["help", "x"]), None, "help with more");
    }
}
