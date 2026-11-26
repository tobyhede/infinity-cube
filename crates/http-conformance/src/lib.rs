//! The HTTP conformance cases (`conformance/http/wire-cases.ts`) that both
//! Rust adapters of the host's application run: `host::Application::handle`
//! itself (`crates/host/tests/wire.rs`) and the desktop shell's scheme handler
//! (`packages/desktop/src-tauri/src/scheme/tests.rs`). Each case is written
//! once, in [`cases`], against an [`Adapter`]: a request-to-response function
//! over a host that has Imported the tracked fixture and serves the stand-in
//! built application. An adapter's test binary invokes [`cases!`] once, which
//! generates one test per case.
//!
//! A case carries `// Case: <its name>`, which
//! `test/unit/http-conformance-rust-ports.test.ts` holds to the TypeScript
//! case lists for both adapters. The crate also holds the fixture's ids, the
//! stand-in built application and an id source counted up from one.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

use std::future::Future;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};

use bytes::Bytes;
use host::IdSource;
use http::{Request, Response};
use intake::Uuid;

pub mod cases;
pub mod support;

/// A host of the tracked fixture serving the stand-in built application, as
/// the conformance cases reach it.
pub trait Adapter: Sized {
    /// A fresh host over its own Import of `packages/app/fixture`, serving
    /// the stand-in built application ([`write_stand_in_build`]).
    fn open() -> impl Future<Output = Self>;

    /// The host's answer to `request`, whose URI is a path, sent as the
    /// application's own page sends a request, with the headers it names.
    fn send(&self, request: Request<Bytes>) -> impl Future<Output = Response<Bytes>>;

    /// The `Origin` of the application's own page.
    fn own_origin(&self) -> String;

    /// What a request from the application's own page names besides its
    /// `Origin`: a listener's requests name their `Host`, and the scheme
    /// handler's name none.
    fn own_address(&self) -> Vec<(&'static str, String)>;

    /// The order the host's store holds an object's keys in, given the order
    /// a commit wrote them: as written, unless the store orders them itself,
    /// as PostgreSQL's `jsonb` does.
    #[must_use]
    fn stored_key_order(written: Vec<String>) -> Vec<String> {
        written
    }

    /// Stop the host once a case has passed.
    fn close(self) -> impl Future<Output = ()>;
}

/// The tracked fixture's Meta Space, and its product address.
pub const META: &str = "00000000-0000-4000-8000-000000000040";
pub const META_ADDRESS: &str = "/spaces/AAAAAAAAQACAAAAAAAAAQA";
/// Every Space of the tracked fixture, in id order.
pub const FIXTURE_SPACES: [&str; 4] = [
    "00000000-0000-4000-8000-000000000040",
    "00000000-0000-4000-8000-000000000060",
    "00000000-0000-4000-8000-000000000070",
    "00000000-0000-4000-8000-000000000080",
];
/// A Space id the fixture does not hold.
pub const UNKNOWN_SPACE: &str = "00000000-0000-4000-8000-00000000dead";
/// A Space id a case creates.
pub const NEW_SPACE: &str = "00000000-0000-4000-8000-0000000c0f01";

/// `packages/app/fixture`.
#[must_use]
pub fn fixture() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packages/app/fixture")
}

/// The HTTP conformance suite's stand-in build: its page, and its files by path.
pub const STAND_IN_PAGE: &str = "<!doctype html><html><head><title>Stand-in</title><script>window.standIn = true;</script></head><body><div id=\"root\"></div></body></html>\n";
pub const STAND_IN_SCRIPT: (&str, &str) =
    ("assets/index-c0nf0rm4.js", "console.log(\"stand-in\");\n");
pub const STAND_IN_ICON: (&str, &str) = (
    "favicon.svg",
    "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1 1\"/>\n",
);
/// The stand-in build's files other than its page.
pub const STAND_IN_FILES: [(&str, &str); 2] = [STAND_IN_SCRIPT, STAND_IN_ICON];
/// `contentSecurityPolicy(inlineScriptSources(page), [])` for the stand-in
/// page, its one script hashed by `openssl dgst -sha256 -binary | base64`.
pub const STAND_IN_POLICY: &str = "default-src 'self'; script-src 'self' 'sha256-PhqNIk+nbvnTgY4TWUCSygYKMiovRbbBV8E7EBCqKHo='; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
/// A file [`write_stand_in_build`] writes beside the build, not in it.
pub const OUTSIDE_THE_BUILD: (&str, &str) = ("outside.txt", "not built");

/// Write the stand-in build to `parent/built`, and [`OUTSIDE_THE_BUILD`]
/// beside it, answering the build's directory.
#[must_use]
pub fn write_stand_in_build(parent: &Path) -> PathBuf {
    let root = parent.join("built");
    std::fs::create_dir_all(root.join("assets")).unwrap();
    std::fs::write(root.join("index.html"), STAND_IN_PAGE).unwrap();
    for (path, text) in STAND_IN_FILES {
        std::fs::write(root.join(path), text).unwrap();
    }
    std::fs::write(parent.join(OUTSIDE_THE_BUILD.0), OUTSIDE_THE_BUILD.1).unwrap();
    root
}

/// Ids counted up from one, each `00000000-0000-4000-8000-` and the count as
/// twelve hex digits.
#[derive(Debug, Default)]
pub struct Counted(AtomicUsize);

impl IdSource for Counted {
    fn new_id(&self) -> Uuid {
        let next = self.0.fetch_add(1, Ordering::SeqCst) + 1;
        Uuid::parse(&format!("00000000-0000-4000-8000-{next:012x}")).unwrap()
    }
}

/// One test per case of [`cases`], in a module `conformance`, each opening a
/// fresh `$adapter` (an [`Adapter`] named as the invoking module names it),
/// running the case and closing it. Attributes after the adapter, such as
/// `#[ignore = "…"]` for an adapter that needs a server, go on every test.
#[macro_export]
macro_rules! cases {
    ($adapter:ty $(, #[$attribute:meta])* $(,)?) => {
        $crate::__cases! { $adapter; [$(#[$attribute])*];
            // table:begin
            given_a_space_api_request {
                lists_every_space_of_the_directory_with_its_title,
                answers_one_space_with_its_snapshot_and_revision,
                answers_the_aggregate_with_its_meta_space_and_every_space,
                answers_404_for_a_space_that_does_not_exist,
                answers_400_invalid_space_id_whatever_the_method,
                answers_405_naming_the_methods_a_path_allows,
                answers_an_unreserved_escape_as_the_path_it_escapes,
                answers_404_for_a_path_off_the_declared_api,
            }
            given_a_commit {
                answers_200_committed_with_each_spaces_next_revision,
                answers_409_with_the_current_space_for_a_stale_revision,
                answers_422_for_a_space_no_space_resource_references,
                answers_positions_in_the_order_the_commit_wrote_them,
                answers_400_for_a_commit_the_store_will_not_judge,
                answers_400_for_a_space_named_in_upper_case,
                answers_400_for_malformed_json,
                answers_400_for_a_lone_surrogate_as_for_malformed_json,
                answers_400_for_a_body_that_is_not_a_commit,
                answers_415_for_a_commit_sent_with_no_content_type,
                answers_415_for_a_commit_sent_as_another_type,
                answers_415_for_an_encoded_commit,
                accepts_a_media_type_with_spaces_around_its_parameter,
                accepts_a_quoted_parameter_carrying_a_latin_1_byte,
                commits_a_body_of_exactly_the_limit,
                answers_413_for_a_body_one_byte_over_the_limit,
            }
            given_an_asset_request {
                stores_an_asset_at_its_hash_201_the_first_time_and_200_after,
                serves_a_stored_picture_as_itself_immutable_and_sandboxed,
                serves_any_other_stored_type_as_inert_bytes,
                answers_head_for_a_stored_asset_without_its_bytes,
                serves_a_stored_asset_at_its_hash_with_a_character_escaped,
                answers_404_for_a_hash_no_asset_is_stored_at,
                answers_415_for_an_encoded_asset,
                stores_an_asset_of_exactly_the_limit,
                answers_413_for_an_asset_one_byte_over_the_limit,
            }
            given_a_change_from_another_site {
                refuses_a_change_another_site_sends_by_its_sec_fetch_site,
                stores_an_asset_sent_from_its_own_origin,
                stores_an_asset_sent_from_its_own_origin_naming_no_sec_fetch_site,
                answers_a_read_whatever_site_sent_it,
            }
            given_a_product_address {
                redirects_get_and_head_of_the_root_to_the_meta_space,
                answers_405_to_a_write_allowing_get_and_head,
                answers_400_to_an_address_that_cannot_be_read,
                answers_404_for_an_address_naming_no_space,
                answers_its_refusals_as_html_to_a_request_that_accepts_it,
            }
            given_a_request_for_the_shell {
                serves_the_shell_for_a_product_address_that_resolves,
                falls_back_to_the_shell_for_an_address_not_the_applications,
                serves_the_shell_with_its_policy_at_index_html,
                answers_head_for_the_shell_without_its_body,
                answers_405_to_a_write_to_an_address_not_the_applications,
                serves_a_content_named_built_file_as_immutable,
                serves_another_built_file_to_be_revalidated,
                serves_the_built_file_an_escaped_assets_climb_resolves_to,
                answers_400_invalid_asset_hash_and_no_file_under_assets,
            }
            // table:end
        }
    };
}

#[doc(hidden)]
#[macro_export]
macro_rules! __cases {
    ($adapter:ty; $attributes:tt; $($group:ident { $($case:ident),* $(,)? })*) => {
        mod conformance {
            #[allow(unused_imports, reason = "the adapter may be named by a path")]
            use super::*;

            type Subject = $adapter;

            $(
                mod $group {
                    $(
                        $crate::__case! { $attributes $group $case }
                    )*
                }
            )*
        }
    };
}

#[doc(hidden)]
#[macro_export]
macro_rules! __case {
    ([$(#[$attribute:meta])*] $group:ident $case:ident) => {
        #[tokio::test]
        $(#[$attribute])*
        async fn $case() {
            let subject = <super::Subject as $crate::Adapter>::open().await;
            $crate::cases::$group::$case(&subject).await;
            <super::Subject as $crate::Adapter>::close(subject).await;
        }
    };
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    /// The cases [`cases!`] lists, by group.
    fn listed() -> BTreeSet<String> {
        let source = include_str!("lib.rs");
        let begin = source.find("// table:begin").unwrap();
        let end = source.find("// table:end").unwrap();
        let mut group = String::new();
        let mut names = BTreeSet::new();
        for line in source[begin..end].lines().skip(1) {
            let line = line.trim().trim_end_matches(',');
            if let Some(opened) = line.strip_suffix(" {") {
                opened.clone_into(&mut group);
            } else if !line.is_empty() && line != "}" {
                let _new = names.insert(format!("{group}::{line}"));
            }
        }
        names
    }

    /// What is wrong with how `source` marks its cases: each `pub async fn`
    /// carries exactly one `// Case:` line in the comment lines directly
    /// above it, and every `// Case:` line sits above one.
    fn marker_problems(source: &str) -> Vec<String> {
        let mut problems = Vec::new();
        let mut pending: Vec<&str> = Vec::new();
        for line in source.lines().map(str::trim) {
            if let Some(name) = line.strip_prefix("// Case: ") {
                pending.push(name);
            } else if line.starts_with("//") {
                // a comment line between a marker and its function
            } else if let Some(case) = line.strip_prefix("pub async fn ") {
                let name = case.split('<').next().unwrap();
                if pending.len() != 1 {
                    problems.push(format!(
                        "`{name}` has {} markers: {pending:?}",
                        pending.len()
                    ));
                }
                pending.clear();
            } else {
                if !pending.is_empty() {
                    problems.push(format!("not above a `pub async fn`: {pending:?}"));
                }
                pending.clear();
            }
        }
        if !pending.is_empty() {
            problems.push(format!("not above a `pub async fn`: {pending:?}"));
        }
        problems
    }

    /// The cases `cases.rs` writes, by group.
    fn written() -> BTreeSet<String> {
        let mut group = "";
        let mut names = BTreeSet::new();
        for line in include_str!("cases.rs").lines() {
            if let Some(opened) = line.strip_prefix("pub mod ") {
                group = opened.trim_end_matches(" {");
            } else if let Some(case) = line.trim().strip_prefix("pub async fn ") {
                let name = case.split('<').next().unwrap();
                let _new = names.insert(format!("{group}::{name}"));
            }
        }
        names
    }

    mod given_the_table {
        use super::*;

        #[test]
        fn lists_every_case_it_writes_and_no_other() {
            let written = written();
            assert!(written.len() > 40, "the cases are read: {written:?}");
            assert_eq!(listed(), written, "the macro lists every case written");
        }

        #[test]
        fn marks_each_case_it_writes_once() {
            let problems = marker_problems(include_str!("cases.rs"));
            assert!(problems.is_empty(), "mis-marked cases: {problems:?}");
        }
    }

    mod given_a_mis_marked_table {
        use super::*;

        #[test]
        fn names_a_function_with_two_markers() {
            let text = "// Case: a\n// Case: b\npub async fn one() {}\n";
            assert_eq!(marker_problems(text).len(), 1, "two markers on one case");
        }

        #[test]
        fn names_a_function_with_none() {
            let text = "// Case: a\npub async fn one() {}\npub async fn two() {}\n";
            assert_eq!(marker_problems(text).len(), 1, "`two` has no marker");
        }

        #[test]
        fn names_a_marker_on_a_helper_even_when_the_counts_match() {
            let text = "// Case: a\nasync fn helper() {}\npub async fn one() {}\n";
            assert_eq!(
                marker_problems(text).len(),
                2,
                "a stray marker, an unmarked case"
            );
        }

        #[test]
        fn names_a_marker_followed_by_a_blank_line() {
            let text = "// Case: a\n\npub async fn one() {}\n";
            assert_eq!(
                marker_problems(text).len(),
                2,
                "a stray marker, an unmarked case"
            );
        }

        #[test]
        fn accepts_a_comment_between_marker_and_function() {
            let text = "// Case: a\n/// note\npub async fn one() {}\n";
            assert!(marker_problems(text).is_empty(), "one marker, one case");
        }
    }
}
