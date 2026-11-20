//! Embeds the built browser application in the binary.
//!
//! `INFINITY_CUBE_BUILT_APPLICATION` names the directory `pnpm build` writes
//! (`packages/app/dist`), as an absolute path or one relative to the
//! repository root. Every regular file below it is embedded with
//! `include_bytes!`, so a release binary carries the application it serves;
//! a link is followed only while its target stays inside the built
//! application, so one leading out of it is left out.
//! Unset, nothing is embedded and the binary serves a placeholder page, which
//! it reports when it starts: `cargo build`, clippy and the tests need no web
//! build, and what a binary carries never depends on whether a `dist/`
//! happens to be lying around.
//!
//! It also has Cargo rebuild when `INFINITY_CUBE_COMMIT` changes, the commit
//! `infinity-cube version` names.

use std::fmt::Write as _;
use std::path::{Path, PathBuf};
use std::{env, fs, io};

const VARIABLE: &str = "INFINITY_CUBE_BUILT_APPLICATION";

/// Every file below `directory`: a link is followed only while its target
/// stays inside the built application at `root`, and never back into a
/// directory the walk is already inside, whose real paths `within` holds.
fn walk(
    root: &Path,
    directory: &Path,
    within: &mut Vec<PathBuf>,
    files: &mut Vec<(String, PathBuf)>,
) -> io::Result<()> {
    for entry in fs::read_dir(directory)? {
        let path = entry?.path();
        let Ok(real) = fs::canonicalize(&path) else {
            continue;
        };
        if !real.starts_with(root) {
            continue;
        }
        if real.is_dir() {
            if within.contains(&real) {
                continue;
            }
            within.push(real);
            let walked = walk(root, &path, within, files);
            let _left = within.pop();
            walked?;
        } else if real.is_file() {
            let relative =
                path.strip_prefix(root)
                    .map_err(io::Error::other)?
                    .components()
                    .map(|part| {
                        part.as_os_str().to_str().map(str::to_owned).ok_or_else(|| {
                            io::Error::other(format!("{} is not UTF-8", path.display()))
                        })
                    })
                    .collect::<io::Result<Vec<_>>>()?
                    .join("/");
            files.push((relative, path));
        }
    }
    Ok(())
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("cargo::rerun-if-env-changed={VARIABLE}");
    // The commit `version` names, which the release workflow sets; read with
    // `option_env!` in `src/version.rs`.
    println!("cargo::rerun-if-env-changed=INFINITY_CUBE_COMMIT");
    let out = PathBuf::from(env::var("OUT_DIR")?).join("built.rs");
    let mut code = String::new();
    match env::var_os(VARIABLE).filter(|value| !value.is_empty()) {
        None => code.push_str("pub(crate) const EMBEDDED: Option<&[(&str, &[u8])]> = None;\n"),
        Some(value) => {
            let named = PathBuf::from(value);
            let root = if named.is_absolute() {
                named
            } else {
                PathBuf::from(env::var("CARGO_MANIFEST_DIR")?)
                    .join("../..")
                    .join(named)
            };
            let root = fs::canonicalize(&root)
                .map_err(|error| format!("{VARIABLE} names {}: {error}", root.display()))?;
            println!("cargo::rerun-if-changed={}", root.display());
            let mut files = Vec::new();
            walk(&root, &root, &mut vec![root.clone()], &mut files)?;
            files.sort();
            if !files.iter().any(|(name, _)| name == "index.html") {
                return Err(format!(
                    "{VARIABLE} names {}, which holds no index.html",
                    root.display()
                )
                .into());
            }
            code.push_str("pub(crate) const EMBEDDED: Option<&[(&str, &[u8])]> = Some(&[\n");
            for (name, path) in files {
                let path = path.to_str().ok_or("a built file's path is not UTF-8")?;
                writeln!(code, "    ({name:?}, include_bytes!({path:?})),")?;
            }
            code.push_str("]);\n");
        }
    }
    fs::write(out, code)?;
    Ok(())
}
