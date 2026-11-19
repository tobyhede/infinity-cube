//! `check <dir>`: Import a directory as `run` does into a memory store that
//! is then discarded, serving and writing nothing (`checkAggregate` in
//! `src/run/run.ts`, `describeCheck` in `src/cli/run-refusal.ts`).

use std::path::Path;
use std::process::ExitCode;

use host::{ImportError, MemorySpaceRepository, RandomIds, TokioFilesystem, import_directory};
use serde_json::{Value, json};

use crate::arguments::CheckCommand;
use crate::describe::{empty, refusal_json, refused};
use crate::output::{answer, say};

/// What a check found.
enum Checked {
    Valid { absent: Vec<String> },
    Empty,
    Refused(intake::Refusals),
    Failed(String),
}

async fn checked(directory: &Path) -> Checked {
    let store = MemorySpaceRepository::new();
    match import_directory(&store, &TokioFilesystem, directory, &RandomIds).await {
        Ok(()) => match host::absent_assets(&store).await {
            Ok(absent) => Checked::Valid {
                absent: absent.iter().map(|hash| hash.as_str().to_owned()).collect(),
            },
            Err(error) => Checked::Failed(error.to_string()),
        },
        Err(ImportError::Empty) => Checked::Empty,
        Err(ImportError::Refused(refusals)) => Checked::Refused(refusals),
        Err(error) => Checked::Failed(error.to_string()),
    }
}

fn as_json(directory: &Path, checked: &Checked) -> Value {
    match checked {
        Checked::Valid { absent } => json!({ "outcome": "accepted", "absentAssets": absent }),
        Checked::Empty => json!({ "outcome": "empty", "message": empty(directory) }),
        Checked::Refused(refusals) => json!({
            "outcome": "refused",
            "refusals": refusals.as_slice().iter().map(refusal_json).collect::<Vec<_>>(),
        }),
        Checked::Failed(reason) => json!({ "outcome": "failed", "message": reason }),
    }
}

/// Check `command.directory`: zero for an accepted directory, one for any other.
pub(crate) async fn check(command: &CheckCommand) -> ExitCode {
    let directory =
        std::path::absolute(&command.directory).unwrap_or_else(|_| command.directory.clone());
    let checked = checked(&directory).await;
    let accepted = matches!(checked, Checked::Valid { .. });
    if command.json {
        answer(&as_json(&directory, &checked).to_string());
    } else {
        match &checked {
            Checked::Valid { absent } => {
                answer(&format!("{} is a valid aggregate.", directory.display()));
                // What a Resource reads from each is absent until it is written.
                for hash in absent {
                    answer(&format!(
                        "/assets/{hash} has no file: write its bytes to assets/{hash}.<extension>, such as assets/{hash}.md for Markdown text."
                    ));
                }
            }
            Checked::Empty => say(&empty(&directory)),
            Checked::Refused(refusals) => say(&refused(&directory, refusals)),
            Checked::Failed(reason) => {
                say(&format!(
                    "Could not check {}: {reason}",
                    directory.display()
                ));
            }
        }
    }
    if accepted {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}
