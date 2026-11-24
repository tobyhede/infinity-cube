//! `init <dir>`: write a new aggregate to a missing or empty directory, as
//! `pnpm cube init` does (Storage ST-11, ST-70), with the host's
//! `init_directory`.

use std::process::ExitCode;

use host::{Initialized, NEW_SPACE_TITLE, RandomIds, TokioFilesystem, init_directory};

use crate::describe::shell_word;
use crate::output::{answer, say};

/// Write the new aggregate: zero once written, one for a directory holding
/// anything but dot-entries or a write that failed.
pub(crate) async fn init(directory: &std::path::Path) -> ExitCode {
    let directory = std::path::absolute(directory).unwrap_or_else(|_| directory.to_path_buf());
    let shown = directory.display().to_string();
    match init_directory(&TokioFilesystem, &directory, NEW_SPACE_TITLE, &RandomIds).await {
        Ok(Initialized::Written) => {
            answer(&format!(
                "Created a new aggregate; run it with: infinity-cube run {}",
                shell_word(&shown)
            ));
            ExitCode::SUCCESS
        }
        Ok(_) => {
            say(&format!(
                "{shown} is not empty; init writes only to a missing or empty directory."
            ));
            ExitCode::FAILURE
        }
        Err(error) => {
            say(&format!("Could not init {shown}: {error}"));
            ExitCode::FAILURE
        }
    }
}
