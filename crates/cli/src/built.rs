//! The built browser application a run serves around the API: the one
//! `build.rs` embedded, a directory `--built` names, or, in a binary built
//! without one, a placeholder page that says so.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use bytes::Bytes;
use host::{BuiltApplicationDirectory, BuiltApplicationError, BuiltFiles, Shell};

include!(concat!(env!("OUT_DIR"), "/built.rs"));

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

/// The files of the built application a run serves: what the binary
/// carries, or a directory read on request.
#[derive(Debug)]
pub(crate) enum Files {
    Carried(BTreeMap<String, Bytes>),
    Directory(BuiltApplicationDirectory),
}

impl BuiltFiles for Files {
    async fn file(&self, path: &str) -> Option<Bytes> {
        match self {
            Self::Carried(files) => files.file(path).await,
            Self::Directory(files) => files.file(path).await,
        }
    }
}

/// The shell of the built application a run serves: from `directory` when
/// given, else what the binary carries.
///
/// # Errors
///
/// [`BuiltApplicationError`] when `directory` cannot be read or holds no `index.html`.
pub(crate) fn load(
    directory: Option<&Path>,
) -> Result<(Shell<Files>, Origin), BuiltApplicationError> {
    match (directory, EMBEDDED) {
        (Some(directory), _) => {
            let (page, files) = BuiltApplicationDirectory::open(directory)?;
            Ok((
                Shell::new(page, Files::Directory(files)),
                Origin::Directory(directory.to_owned()),
            ))
        }
        (None, Some(embedded)) => {
            let files: BTreeMap<String, Bytes> = embedded
                .iter()
                .map(|(name, bytes)| ((*name).to_owned(), Bytes::from_static(bytes)))
                .collect();
            let page = files.get(PAGE).cloned().unwrap_or_default();
            Ok((Shell::new(page, Files::Carried(files)), Origin::Embedded))
        }
        (None, None) => {
            let page = Bytes::from_static(PLACEHOLDER_PAGE.as_bytes());
            Ok((
                Shell::new(page, Files::Carried(BTreeMap::new())),
                Origin::Placeholder,
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use host::{Application, MemorySpaceRepository, RandomIds};
    use http::Request;
    use http_body_util::Empty;

    use super::*;

    type Served = Application<MemorySpaceRepository, RandomIds, Files>;

    /// An application over an empty store, serving `shell`.
    fn application(shell: Shell<Files>) -> Served {
        Application::new(Arc::new(MemorySpaceRepository::new()), RandomIds, shell)
    }

    /// The body `application` answers a GET of `path` with.
    async fn served(application: &Served, path: &str) -> Bytes {
        let request = Request::get(path).body(Empty::<Bytes>::new()).unwrap();
        application.handle(request).await.into_body()
    }

    mod given_a_built_directory {
        use super::*;

        #[tokio::test]
        async fn serves_its_page_and_its_files() {
            let temporary = tempfile::tempdir().unwrap();
            let root = temporary.path();
            std::fs::create_dir_all(root.join("assets")).unwrap();
            std::fs::write(root.join(PAGE), "<p>built page</p>").unwrap();
            std::fs::write(root.join("assets/index-1.js"), "built script").unwrap();
            let (shell, origin) = load(Some(root)).unwrap();
            assert_eq!(origin, Origin::Directory(root.to_owned()), "the directory");
            let application = application(shell);
            assert_eq!(
                served(&application, "/somewhere/else").await,
                Bytes::from("<p>built page</p>"),
                "the page is the directory's index.html"
            );
            assert_eq!(
                served(&application, "/assets/index-1.js").await,
                Bytes::from("built script"),
                "a file beside it, read from the directory"
            );
        }
    }

    mod given_no_built_directory {
        use super::*;

        #[test]
        fn serves_the_placeholder_or_the_embedded_build() {
            let (_shell, origin) = load(None).unwrap();
            let expected = if EMBEDDED.is_some() {
                Origin::Embedded
            } else {
                Origin::Placeholder
            };
            assert_eq!(origin, expected, "what the binary carries");
        }
    }
}
