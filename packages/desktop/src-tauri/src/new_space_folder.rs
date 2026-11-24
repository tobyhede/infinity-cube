//! Where New Space would write (Storage ST-131): the folder `<location>/<name>`
//! for a name that is a single folder name on the platform, in a location
//! where that folder is missing or holds nothing but dot-entries, and the
//! default name it offers. The decisions are pure; what a folder holds is
//! asked of a [`Listing`], which a test fakes.

use std::io;
use std::path::{Path, PathBuf};

/// What a folder holds, by name.
pub trait Listing {
    /// The names of the entries directly in `folder`, or `None` when nothing
    /// is there.
    ///
    /// # Errors
    ///
    /// The failure to list a folder that exists.
    fn names(&self, folder: &Path) -> io::Result<Option<Vec<String>>>;
}

/// The folders on disk.
#[derive(Debug, Clone, Copy, Default)]
pub struct FolderListing;

impl Listing for FolderListing {
    fn names(&self, folder: &Path) -> io::Result<Option<Vec<String>>> {
        let entries = match std::fs::read_dir(folder) {
            Ok(entries) => entries,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error),
        };
        entries
            .map(|entry| Ok(entry?.file_name().to_string_lossy().into_owned()))
            .collect::<io::Result<_>>()
            .map(Some)
    }
}

/// The platform whose folder names New Space holds a name to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Platform {
    /// macOS and Linux.
    Unix,
    /// Windows.
    Windows,
}

/// Why New Space would write nothing for a name. Its text is shown beside
/// the field.
#[derive(Debug, thiserror::Error)]
pub enum Refused {
    /// Empty, `.` or `..`, or holding a path separator.
    #[error("A name is one folder name: not empty, `.` or `..`, and with no `/` or `\\`.")]
    NotAFolderName,
    /// A character Windows forbids in a folder name.
    #[error("A folder name on Windows cannot hold {0}.")]
    ForbiddenCharacter(char),
    /// A name Windows reserves for a device, such as `CON`.
    #[error("Windows reserves that name for a device.")]
    Reserved,
    /// A name ending in a dot or a space, which Windows drops.
    #[error("A folder name on Windows cannot end in a dot or a space.")]
    TrailingDotOrSpace,
    /// The folder exists and holds something other than dot-entries.
    #[error(
        "{} is not empty. A new Space goes in an empty folder.",
        .0.display()
    )]
    NotEmpty(PathBuf),
    /// What the folder holds could not be listed.
    #[error("Could not look in {}: {source}", .folder.display())]
    Unlisted {
        folder: PathBuf,
        #[source]
        source: io::Error,
    },
}

/// Whether `folder` is missing or holds nothing but dot-entries, as
/// `init_directory` decides.
fn is_free(listing: &impl Listing, folder: &Path) -> Result<bool, Refused> {
    let names = listing
        .names(folder)
        .map_err(|source| unlisted(folder, source))?;
    Ok(holds_nothing(names.as_deref()))
}

/// Whether a listing is of nothing there, or of nothing but dot-entries.
fn holds_nothing(names: Option<&[String]>) -> bool {
    names.is_none_or(|names| names.iter().all(|name| name.starts_with('.')))
}

fn unlisted(folder: &Path, source: io::Error) -> Refused {
    Refused::Unlisted {
        folder: folder.to_path_buf(),
        source,
    }
}

/// The characters Windows forbids in a folder name, past the separators.
const WINDOWS_FORBIDDEN: [char; 7] = ['<', '>', ':', '"', '|', '?', '*'];

/// Whether Windows reserves `name` for a device: `CON`, `PRN`, `AUX`, `NUL`,
/// `COM1`–`COM9` or `LPT1`–`LPT9`, in any case, alone or before an extension.
fn is_reserved_on_windows(name: &str) -> bool {
    let stem = name.split('.').next().unwrap_or(name).to_ascii_uppercase();
    match stem.as_bytes() {
        b"CON" | b"PRN" | b"AUX" | b"NUL" => true,
        [b'C', b'O', b'M', digit] | [b'L', b'P', b'T', digit] => (b'1'..=b'9').contains(digit),
        _ => false,
    }
}

/// The folder New Space would write for `name` in `location`.
///
/// # Errors
///
/// [`Refused`]: why it would write nothing.
pub fn new_space_folder(
    listing: &impl Listing,
    location: &Path,
    name: &str,
    platform: Platform,
) -> Result<PathBuf, Refused> {
    if matches!(name, "" | "." | "..") || name.contains(['/', '\\']) {
        return Err(Refused::NotAFolderName);
    }
    if platform == Platform::Windows
        && let Some(forbidden) = name.chars().find(|c| WINDOWS_FORBIDDEN.contains(c))
    {
        return Err(Refused::ForbiddenCharacter(forbidden));
    }
    if platform == Platform::Windows && is_reserved_on_windows(name) {
        return Err(Refused::Reserved);
    }
    if platform == Platform::Windows && name.ends_with(['.', ' ']) {
        return Err(Refused::TrailingDotOrSpace);
    }
    let folder = location.join(name);
    if !is_free(listing, &folder)? {
        return Err(Refused::NotEmpty(folder));
    }
    Ok(folder)
}

/// The name New Space offers in `location`: `Untitled Space`, or the first of
/// `Untitled Space 2`, `Untitled Space 3`, … whose folder is free, free as
/// [`new_space_folder`] decides it. A file holding a candidate's name takes
/// that name, as a folder holding something does.
///
/// # Errors
///
/// [`Refused::Unlisted`]: the location, or a folder it looked at, could not
/// be listed. The location is listed first, so a location that is a file is
/// refused rather than passed over name after name.
pub fn default_name(listing: &impl Listing, location: &Path) -> Result<String, Refused> {
    listing
        .names(location)
        .map_err(|source| unlisted(location, source))?;
    let mut name = String::from(UNTITLED);
    let mut number: u64 = 1;
    loop {
        let candidate = location.join(&name);
        match listing.names(&candidate) {
            Ok(names) if holds_nothing(names.as_deref()) => return Ok(name),
            Ok(_) => {}
            Err(error) if error.kind() == io::ErrorKind::NotADirectory => {}
            Err(source) => return Err(unlisted(&candidate, source)),
        }
        number += 1;
        name = format!("{UNTITLED} {number}");
    }
}

/// The default name's stem.
const UNTITLED: &str = "Untitled Space";

#[cfg(test)]
mod tests;
