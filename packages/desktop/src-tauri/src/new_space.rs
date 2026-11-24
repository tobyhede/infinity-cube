//! A new Space written to a missing or empty folder from the application, as
//! `init` writes it (Storage ST-11, ST-70), through the host's
//! `init_directory`, whose Export is the only writer of an Aggregate
//! directory. A folder holding anything but dot-entries is refused and
//! nothing is written to it.

use std::path::Path;

use host::{Filesystem, IdSource, Initialized, NEW_SPACE_TITLE, init_directory};

use crate::not_opened::NotOpened;

/// Write a new Space to `directory`, missing or holding nothing but
/// dot-entries.
///
/// # Errors
///
/// [`NotOpened::NotEmpty`] for a folder holding anything else, with nothing
/// written, and [`NotOpened::NotCreated`] when the folder could not be listed
/// or the write failed.
pub async fn create_space<F: Filesystem, I: IdSource>(
    fs: &F,
    directory: &Path,
    ids: &I,
) -> Result<(), NotOpened> {
    match init_directory(fs, directory, NEW_SPACE_TITLE, ids).await {
        Ok(Initialized::Written) => Ok(()),
        Ok(_) => Err(NotOpened::NotEmpty(directory.to_path_buf())),
        Err(source) => Err(NotOpened::NotCreated {
            directory: directory.to_path_buf(),
            source,
        }),
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use host::{MemorySpaceRepository, RandomIds, TokioFilesystem, import_directory};

    use super::*;

    async fn create(directory: &Path) -> Result<(), NotOpened> {
        create_space(&TokioFilesystem, directory, &RandomIds).await
    }

    /// What `directory` holds, by relative path, with each file's bytes.
    fn contents(directory: &Path) -> Vec<(String, Vec<u8>)> {
        let mut found = Vec::new();
        let mut pending = vec![directory.to_path_buf()];
        while let Some(next) = pending.pop() {
            for entry in fs::read_dir(&next).unwrap() {
                let path = entry.unwrap().path();
                if path.is_dir() {
                    pending.push(path);
                } else {
                    let relative = path.strip_prefix(directory).unwrap();
                    found.push((relative.display().to_string(), fs::read(&path).unwrap()));
                }
            }
        }
        found.sort();
        found
    }

    mod given_an_empty_folder {
        use super::*;

        #[tokio::test]
        async fn writes_a_space_the_intake_accepts() {
            let folder = tempfile::tempdir().unwrap();
            create(folder.path()).await.unwrap();
            let store = MemorySpaceRepository::new();
            import_directory(&store, &TokioFilesystem, folder.path(), &RandomIds)
                .await
                .expect("the new Space should read in as `check` reads it");
        }

        #[tokio::test]
        async fn keeps_the_dot_entries_it_holds() {
            let folder = tempfile::tempdir().unwrap();
            fs::create_dir(folder.path().join(".git")).unwrap();
            fs::write(folder.path().join(".git/HEAD"), "ref: main\n").unwrap();
            create(folder.path()).await.unwrap();
            assert_eq!(
                fs::read_to_string(folder.path().join(".git/HEAD")).unwrap(),
                "ref: main\n"
            );
            assert!(folder.path().join("aggregate.json").is_file());
        }
    }

    #[tokio::test]
    async fn writes_a_space_to_a_folder_that_is_missing() {
        let parent = tempfile::tempdir().unwrap();
        let folder = parent.path().join("space");
        create(&folder).await.unwrap();
        assert!(folder.join("aggregate.json").is_file());
    }

    #[tokio::test]
    async fn refuses_a_folder_that_is_not_empty_and_writes_nothing_there() {
        let folder = tempfile::tempdir().unwrap();
        fs::write(folder.path().join("notes.md"), "mine\n").unwrap();
        let before = contents(folder.path());
        let refused = create(folder.path()).await.unwrap_err();
        assert!(
            matches!(&refused, NotOpened::NotEmpty(directory) if directory == folder.path()),
            "{refused:?}"
        );
        assert!(refused.tells_the_presenter());
        assert_eq!(contents(folder.path()), before, "nothing should be written");
    }
}
