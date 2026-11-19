//! The built application served from a directory: its `index.html` is read
//! once, when the directory is opened, and every other file when a request
//! names it, so a file other than the page changed on disk is served as
//! changed, and a rebuilt directory, whose page names other files, needs the
//! directory opened again.

use std::path::{Path, PathBuf};

use bytes::Bytes;

use crate::shell::BuiltFiles;

const PAGE: &str = "index.html";

/// Why a directory names no built application.
#[derive(Debug, thiserror::Error)]
pub enum BuiltApplicationError {
    /// The directory, or its `index.html`, could not be read.
    #[error("{0} could not be read: {1}")]
    Unreadable(PathBuf, std::io::Error),
    /// The directory holds no `index.html`.
    #[error("{0} holds no index.html")]
    NoPage(PathBuf),
}

/// The built application's files, read from the directory that holds them. A
/// link, the page's included, is followed only while it stays inside the
/// directory. A file that cannot be read when a request names it, for want of
/// permission or otherwise, is answered as no such file, so the request gets
/// the page, as `builtFiles` in `src/desktop/static-files.ts` answers it, which
/// `test/unit/desktop-static-files.test.ts` › "answers nothing for a file whose
/// permissions forbid reading it" holds.
#[derive(Debug, Clone)]
pub struct BuiltApplicationDirectory {
    root: PathBuf,
}

impl BuiltApplicationDirectory {
    /// The built application in `directory`: its `index.html`, read now and
    /// not again, as the page for [`Shell::new`], and the files beside it,
    /// read on request.
    ///
    /// # Errors
    ///
    /// [`BuiltApplicationError::NoPage`] when `directory` holds no
    /// `index.html` inside it, and [`BuiltApplicationError::Unreadable`] when
    /// `directory` or its `index.html` cannot be read for any other reason,
    /// such as `directory` not being a directory.
    pub fn open(directory: &Path) -> Result<(Bytes, Self), BuiltApplicationError> {
        let root = std::fs::canonicalize(directory)
            .map_err(|error| BuiltApplicationError::Unreadable(directory.to_owned(), error))?;
        // Asked here, since a page looked for below a regular file is not
        // found on Windows and not a directory elsewhere.
        if !root.is_dir() {
            let error = std::io::Error::from(std::io::ErrorKind::NotADirectory);
            return Err(BuiltApplicationError::Unreadable(
                directory.to_owned(),
                error,
            ));
        }
        let page_path = root.join(PAGE);
        let no_page = || BuiltApplicationError::NoPage(directory.to_owned());
        // A page that is a link out of the directory is no page, as it is no
        // file of the application.
        let real = std::fs::canonicalize(&page_path).map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                no_page()
            } else {
                BuiltApplicationError::Unreadable(page_path.clone(), error)
            }
        })?;
        if !real.starts_with(&root) || !real.is_file() {
            return Err(no_page());
        }
        let page = std::fs::read(&real)
            .map_err(|error| BuiltApplicationError::Unreadable(page_path, error))?;
        Ok((Bytes::from(page), Self { root }))
    }
}

impl BuiltFiles for BuiltApplicationDirectory {
    async fn file(&self, path: &str) -> Option<Bytes> {
        // The trait hands over a path with no `.` or `..` segment.
        let real = tokio::fs::canonicalize(self.root.join(path)).await.ok()?;
        if !real.starts_with(&self.root) || !tokio::fs::metadata(&real).await.ok()?.is_file() {
            return None;
        }
        tokio::fs::read(&real).await.ok().map(Bytes::from)
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;

    /// A built application directory holding a page, a nested file and a file
    /// beside the directory.
    fn built(temporary: &Path) -> PathBuf {
        let root = temporary.join("built");
        fs::create_dir_all(root.join("assets")).unwrap();
        fs::write(root.join("index.html"), "<p>page</p>").unwrap();
        fs::write(root.join("assets/index-1.js"), "1").unwrap();
        fs::write(temporary.join("outside.txt"), "no").unwrap();
        root
    }

    async fn served(directory: &Path, path: &str) -> Option<Bytes> {
        BuiltApplicationDirectory {
            root: fs::canonicalize(directory).unwrap(),
        }
        .file(path)
        .await
    }

    mod given_a_built_application_directory {
        use super::*;

        #[tokio::test]
        async fn serves_a_file_by_its_request_path() {
            let temporary = tempfile::tempdir().unwrap();
            let root = built(temporary.path());
            assert_eq!(
                served(&root, "index.html").await,
                Some(Bytes::from("<p>page</p>")),
                "a file in the directory"
            );
        }

        #[tokio::test]
        async fn serves_a_nested_file() {
            let temporary = tempfile::tempdir().unwrap();
            let root = built(temporary.path());
            assert_eq!(
                served(&root, "assets/index-1.js").await,
                Some(Bytes::from("1")),
                "a file below a directory"
            );
        }

        #[tokio::test]
        async fn serves_none_for_a_missing_file() {
            let temporary = tempfile::tempdir().unwrap();
            let root = built(temporary.path());
            assert_eq!(served(&root, "absent.js").await, None, "no such file");
        }

        #[tokio::test]
        async fn serves_none_for_a_directory() {
            let temporary = tempfile::tempdir().unwrap();
            let root = built(temporary.path());
            assert_eq!(served(&root, "assets").await, None, "a directory");
        }

        #[tokio::test]
        async fn serves_a_file_changed_after_it_was_opened() {
            let temporary = tempfile::tempdir().unwrap();
            let root = built(temporary.path());
            assert_eq!(
                served(&root, "assets/index-1.js").await,
                Some(Bytes::from("1")),
                "before"
            );
            fs::write(root.join("assets/index-1.js"), "2").unwrap();
            assert_eq!(
                served(&root, "assets/index-1.js").await,
                Some(Bytes::from("2")),
                "after"
            );
        }

        /// Holds the rule only for a user the permission bits bind: a process
        /// that can read the file anyway, root, returns before the assertion.
        #[cfg(unix)]
        #[tokio::test]
        async fn serves_none_for_a_file_whose_permissions_forbid_reading_it() {
            use std::os::unix::fs::PermissionsExt as _;
            let temporary = tempfile::tempdir().unwrap();
            let root = built(temporary.path());
            let file = root.join("assets/index-1.js");
            fs::set_permissions(&file, fs::Permissions::from_mode(0o000)).unwrap();
            let readable = fs::read(&file).is_ok();
            let answer = served(&root, "assets/index-1.js").await;
            fs::set_permissions(&file, fs::Permissions::from_mode(0o644)).unwrap();
            if readable {
                return;
            }
            assert_eq!(answer, None, "a file it may not read");
        }

        #[cfg(unix)]
        #[tokio::test]
        async fn serves_a_link_only_while_it_stays_inside_it() {
            let temporary = tempfile::tempdir().unwrap();
            let root = built(temporary.path());
            std::os::unix::fs::symlink(temporary.path().join("outside.txt"), root.join("out.txt"))
                .unwrap();
            std::os::unix::fs::symlink("assets/index-1.js", root.join("in.js")).unwrap();
            std::os::unix::fs::symlink("assets", root.join("latest")).unwrap();
            assert_eq!(served(&root, "out.txt").await, None, "a link out of it");
            assert_eq!(
                served(&root, "in.js").await,
                Some(Bytes::from("1")),
                "a link to a file inside it"
            );
            assert_eq!(
                served(&root, "latest/index-1.js").await,
                Some(Bytes::from("1")),
                "a link to a directory inside it"
            );
        }

        #[cfg(unix)]
        #[tokio::test]
        async fn serves_through_a_link_to_an_enclosing_directory_without_looping() {
            let temporary = tempfile::tempdir().unwrap();
            let root = built(temporary.path());
            std::os::unix::fs::symlink(".", root.join("self")).unwrap();
            assert_eq!(
                served(&root, "self/index.html").await,
                Some(Bytes::from("<p>page</p>")),
                "the link resolves to a file inside"
            );
            assert_eq!(served(&root, "self").await, None, "the directory itself");
        }

        #[test]
        fn takes_its_page_from_index_html() {
            let temporary = tempfile::tempdir().unwrap();
            let root = built(temporary.path());
            let (page, _files) = BuiltApplicationDirectory::open(&root).unwrap();
            assert_eq!(page, Bytes::from("<p>page</p>"), "the page is index.html");
        }

        #[test]
        fn refuses_a_directory_with_no_page() {
            let temporary = tempfile::tempdir().unwrap();
            let error = BuiltApplicationDirectory::open(temporary.path()).unwrap_err();
            assert!(
                matches!(error, BuiltApplicationError::NoPage(_)),
                "no page: {error:?}"
            );
        }

        #[test]
        fn refuses_a_directory_that_does_not_exist() {
            let temporary = tempfile::tempdir().unwrap();
            let error =
                BuiltApplicationDirectory::open(&temporary.path().join("absent")).unwrap_err();
            assert!(
                matches!(error, BuiltApplicationError::Unreadable(..)),
                "unreadable: {error:?}"
            );
        }

        #[test]
        fn refuses_a_regular_file_as_unreadable() {
            let temporary = tempfile::tempdir().unwrap();
            let file = temporary.path().join("dist.tar");
            fs::write(&file, "not a directory").unwrap();
            let error = BuiltApplicationDirectory::open(&file).unwrap_err();
            assert!(
                matches!(error, BuiltApplicationError::Unreadable(..)),
                "a regular file is unreadable as a directory: {error:?}"
            );
        }

        #[cfg(unix)]
        #[test]
        fn refuses_a_directory_it_cannot_search_as_unreadable() {
            use std::os::unix::fs::PermissionsExt as _;
            let temporary = tempfile::tempdir().unwrap();
            let root = built(temporary.path());
            fs::set_permissions(&root, fs::Permissions::from_mode(0o000)).unwrap();
            // A user the permission bits do not bind (root) can read it.
            let searchable = fs::metadata(root.join("index.html")).is_ok();
            let result = BuiltApplicationDirectory::open(&root);
            fs::set_permissions(&root, fs::Permissions::from_mode(0o755)).unwrap();
            if searchable {
                return;
            }
            let error = result.unwrap_err();
            assert!(
                matches!(error, BuiltApplicationError::Unreadable(..)),
                "a directory it cannot search is unreadable: {error:?}"
            );
        }

        #[cfg(unix)]
        #[test]
        fn refuses_a_page_it_cannot_read_as_unreadable() {
            use std::os::unix::fs::PermissionsExt as _;
            let temporary = tempfile::tempdir().unwrap();
            let root = built(temporary.path());
            let page = root.join("index.html");
            fs::set_permissions(&page, fs::Permissions::from_mode(0o000)).unwrap();
            // A user the permission bits do not bind (root) can read it.
            if fs::read(&page).is_ok() {
                return;
            }
            let error = BuiltApplicationDirectory::open(&root).unwrap_err();
            assert!(
                matches!(error, BuiltApplicationError::Unreadable(..)),
                "a page it cannot read is unreadable: {error:?}"
            );
        }

        #[cfg(unix)]
        #[tokio::test]
        async fn serves_none_through_a_link_to_a_directory_out_of_it() {
            let temporary = tempfile::tempdir().unwrap();
            let root = built(temporary.path());
            std::os::unix::fs::symlink(temporary.path(), root.join("away")).unwrap();
            std::os::unix::fs::symlink("..", root.join("assets/up")).unwrap();
            assert_eq!(served(&root, "away").await, None, "the link itself");
            assert_eq!(
                served(&root, "away/outside.txt").await,
                None,
                "a file through a link to a directory out of it"
            );
            assert_eq!(
                served(&root, "assets/up/index.html").await,
                Some(Bytes::from("<p>page</p>")),
                "a link up that stays inside it"
            );
            assert_eq!(
                served(&root, "assets/up/up/outside.txt").await,
                None,
                "a link up through which a path leaves it"
            );
        }

        #[cfg(unix)]
        #[test]
        fn refuses_a_page_that_is_a_link_out_of_it() {
            let temporary = tempfile::tempdir().unwrap();
            let root = temporary.path().join("built");
            fs::create_dir_all(&root).unwrap();
            fs::write(temporary.path().join("outside.html"), "no").unwrap();
            std::os::unix::fs::symlink(
                temporary.path().join("outside.html"),
                root.join("index.html"),
            )
            .unwrap();
            let error = BuiltApplicationDirectory::open(&root).unwrap_err();
            assert!(
                matches!(error, BuiltApplicationError::NoPage(_)),
                "no page: {error:?}"
            );
        }
    }
}
