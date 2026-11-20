//! `version`: what this build is (ADR 0166). The Cargo version says whether
//! it is a preview build, and the commit is the one an Aggregate directory
//! it wrote is read back with (ADR 0152).

/// The commit the release workflow built from, or `None` for any other build.
const COMMIT: Option<&str> = option_env!("INFINITY_CUBE_COMMIT");

/// `infinity-cube <version> (<commit>)`, or `(local build)` with no commit.
pub(crate) fn version() -> String {
    let commit = COMMIT
        .filter(|commit| !commit.is_empty())
        .unwrap_or("local build");
    format!("infinity-cube {} ({commit})", env!("CARGO_PKG_VERSION"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_the_cargo_version_and_a_commit_in_brackets() {
        let shown = version();
        assert!(
            shown.starts_with(&format!("infinity-cube {} (", env!("CARGO_PKG_VERSION"))),
            "{shown}"
        );
        assert!(shown.ends_with(')'), "{shown}");
    }
}
