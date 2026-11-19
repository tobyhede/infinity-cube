//! The built browser application a run serves around the API: the one
//! `build.rs` embedded, a directory `--built` names, or, in a binary built
//! without one, a placeholder page that says so.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::{fs, io};

use bytes::Bytes;
use host::Shell;

include!(concat!(env!("OUT_DIR"), "/built.rs"));

/// The built files by the path a request names them with, `index.html` among them.
pub(crate) type BuiltFiles = BTreeMap<String, Bytes>;

const PAGE: &str = "index.html";

/// The page a binary built without the browser application serves.
const PLACEHOLDER_PAGE: &str = "<!doctype html>\n<html lang=\"en\">\n<meta charset=\"utf-8\">\n<title>InfinityCube</title>\n<p>This infinity-cube binary was built without the browser application. Rebuild it with <code>INFINITY_CUBE_BUILT_APPLICATION</code> naming the directory <code>pnpm build</code> writes, or run it with <code>--built &lt;dir&gt;</code>.</p>\n";

/// Where the application a run serves came from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum Origin {
    Embedded,
    Placeholder,
    Directory(PathBuf),
}

/// Why `--built` names no application.
#[derive(Debug, thiserror::Error)]
pub(crate) enum BuiltError {
    #[error("{0} could not be read: {1}")]
    Unreadable(PathBuf, io::Error),
    #[error("{0} holds no index.html")]
    NoPage(PathBuf),
}

/// Read every file below `directory` into `files`. `within` holds the real
/// directories the walk is inside, `directory`'s own last, so a link back to
/// one of them is not descended into again: a link such as `self -> .` would
/// otherwise be read as an endless tree of copies.
fn walk(
    root: &Path,
    directory: &Path,
    within: &mut Vec<PathBuf>,
    prefix: &str,
    files: &mut BuiltFiles,
) -> Result<(), BuiltError> {
    let unreadable = |path: &Path| {
        let path = path.to_owned();
        move |error| BuiltError::Unreadable(path, error)
    };
    for entry in fs::read_dir(directory).map_err(unreadable(directory))? {
        let path = entry.map_err(unreadable(directory))?.path();
        // A link is followed only while it stays inside the build.
        let Ok(real) = fs::canonicalize(&path) else {
            continue;
        };
        if !real.starts_with(root) {
            continue;
        }
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        let relative = format!("{prefix}{name}");
        if real.is_dir() {
            if within.contains(&real) {
                continue;
            }
            within.push(real);
            let walked = walk(root, &path, within, &format!("{relative}/"), files);
            let _left = within.pop();
            walked?;
        } else if real.is_file() {
            let bytes = fs::read(&real).map_err(unreadable(&path))?;
            let _earlier = files.insert(relative, Bytes::from(bytes));
        }
    }
    Ok(())
}

/// Every file of the build in `directory`.
fn read_directory(directory: &Path) -> Result<BuiltFiles, BuiltError> {
    let root = fs::canonicalize(directory)
        .map_err(|error| BuiltError::Unreadable(directory.to_owned(), error))?;
    let mut files = BuiltFiles::new();
    walk(&root, &root, &mut vec![root.clone()], "", &mut files)?;
    if !files.contains_key(PAGE) {
        return Err(BuiltError::NoPage(directory.to_owned()));
    }
    Ok(files)
}

/// The shell a run serves: from `directory` when given, else what the binary carries.
///
/// # Errors
///
/// [`BuiltError`] when `directory` cannot be read or holds no `index.html`.
pub(crate) fn load(directory: Option<&Path>) -> Result<(Shell<BuiltFiles>, Origin), BuiltError> {
    let (files, origin) = match (directory, EMBEDDED) {
        (Some(directory), _) => (
            read_directory(directory)?,
            Origin::Directory(directory.to_owned()),
        ),
        (None, Some(embedded)) => (
            embedded
                .iter()
                .map(|(name, bytes)| ((*name).to_owned(), Bytes::from_static(bytes)))
                .collect(),
            Origin::Embedded,
        ),
        (None, None) => {
            let page = Bytes::from_static(PLACEHOLDER_PAGE.as_bytes());
            return Ok((Shell::new(page, BuiltFiles::new()), Origin::Placeholder));
        }
    };
    let page = files.get(PAGE).cloned().unwrap_or_default();
    Ok((Shell::new(page, files), origin))
}

#[cfg(test)]
mod tests {
    use super::*;

    mod given_a_built_directory {
        use super::*;

        #[test]
        fn reads_every_file_below_it_by_its_request_path() {
            let temporary = tempfile::tempdir().unwrap();
            let root = temporary.path().join("built");
            fs::create_dir_all(root.join("assets")).unwrap();
            fs::write(root.join("index.html"), "<p>page</p>").unwrap();
            fs::write(root.join("assets/index-1.js"), "1").unwrap();
            fs::write(temporary.path().join("outside.txt"), "no").unwrap();
            #[cfg(unix)]
            std::os::unix::fs::symlink(temporary.path().join("outside.txt"), root.join("link.txt"))
                .unwrap();
            let files = read_directory(&root).unwrap();
            assert_eq!(
                files.keys().collect::<Vec<_>>(),
                vec!["assets/index-1.js", "index.html"],
                "the build's files, and no link out of it"
            );
        }

        #[cfg(unix)]
        #[test]
        fn reads_a_link_to_an_enclosing_directory_once_rather_than_looping() {
            let temporary = tempfile::tempdir().unwrap();
            let root = temporary.path().join("built");
            fs::create_dir_all(root.join("assets")).unwrap();
            fs::write(root.join("index.html"), "<p>page</p>").unwrap();
            fs::write(root.join("assets/index-1.js"), "1").unwrap();
            std::os::unix::fs::symlink(".", root.join("self")).unwrap();
            std::os::unix::fs::symlink("..", root.join("assets/up")).unwrap();
            std::os::unix::fs::symlink("assets", root.join("latest")).unwrap();
            let files = read_directory(&root).unwrap();
            assert_eq!(
                files.keys().collect::<Vec<_>>(),
                vec!["assets/index-1.js", "index.html", "latest/index-1.js"],
                "a link to a directory inside the build is read, one to a directory it is already in is not"
            );
        }

        #[test]
        fn refuses_one_with_no_page() {
            let temporary = tempfile::tempdir().unwrap();
            let error = read_directory(temporary.path()).unwrap_err();
            assert!(matches!(error, BuiltError::NoPage(_)), "no page: {error:?}");
        }
    }

    #[test]
    fn serves_the_placeholder_or_the_embedded_build_without_a_directory() {
        let (_shell, origin) = load(None).unwrap();
        let expected = if EMBEDDED.is_some() {
            Origin::Embedded
        } else {
            Origin::Placeholder
        };
        assert_eq!(origin, expected, "what the binary carries");
    }
}
