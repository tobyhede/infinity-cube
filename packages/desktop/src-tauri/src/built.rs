//! The built browser application a talk is served with: the directory
//! `pnpm build` writes, which the bundle carries as a resource. Each file is
//! read when a request names it, so the shell holds no copy of the build.

use std::io;
use std::path::{Path, PathBuf};

use bytes::Bytes;
use host::{BuiltFiles, Shell};

/// The built application's files, read from the directory that holds them.
#[derive(Debug, Clone)]
pub struct BuiltDirectory {
    root: PathBuf,
}

impl BuiltFiles for BuiltDirectory {
    async fn file(&self, path: &str) -> Option<Bytes> {
        // The host hands over a path with no `.` or `..` segment; a link is
        // still followed only while it stays inside the build.
        let real = tokio::fs::canonicalize(self.root.join(path)).await.ok()?;
        if !real.starts_with(&self.root) || !tokio::fs::metadata(&real).await.ok()?.is_file() {
            return None;
        }
        tokio::fs::read(&real).await.ok().map(Bytes::from)
    }
}

/// The shell for the build in `directory`: its `index.html` as the page,
/// and every other file beside it.
///
/// # Errors
///
/// The directory cannot be resolved, or holds no readable `index.html`.
pub fn load(directory: &Path) -> io::Result<Shell<BuiltDirectory>> {
    let root = std::fs::canonicalize(directory)?;
    let page = std::fs::read(root.join("index.html"))?;
    Ok(Shell::new(page, BuiltDirectory { root }))
}
