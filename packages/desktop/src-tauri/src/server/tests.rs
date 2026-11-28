//! Tests of the Aggregate server and its window.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

use std::path::PathBuf;

use super::*;
use crate::test_support::{
    META, META_ADDRESS, fixture_copy, meta_api, rename_text, stand_in_build,
};

/// Every file below `directory`, with its bytes, but for the lock file a run
/// creates on starting (ADR 0162), which is no Export's.
fn snapshot(directory: &Path) -> Vec<(PathBuf, Vec<u8>)> {
    let mut files = Vec::new();
    let mut pending = vec![directory.to_path_buf()];
    while let Some(next) = pending.pop() {
        for entry in std::fs::read_dir(&next).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                pending.push(path);
            } else if path != directory.join(host::LOCK_FILE_NAME) {
                files.push((path.clone(), std::fs::read(&path).unwrap()));
            }
        }
    }
    files.sort();
    files
}

/// An Aggregate open in the window `space-0`, as the shell opens one.
async fn open(
    directory: &Path,
    built: &Path,
) -> (
    OpenAggregates,
    AggregateKey,
    Run<RandomIds, host::BuiltApplicationDirectory>,
) {
    let run = open_run(directory, built_shell(built).unwrap(), |_| {})
        .await
        .unwrap();
    let key = AggregateKey::of(directory);
    let open_aggregates = OpenAggregates::new(SchemeStyle::HostPerAggregate);
    open_aggregates.open(
        AggregateAddress::new(key.clone(), SchemeStyle::HostPerAggregate),
        Arc::clone(run.application()),
        "space-0",
    );
    (open_aggregates, key, run)
}

fn request(key: &AggregateKey, method: &str, path: &str, body: &str) -> http::Request<Vec<u8>> {
    let origin = AggregateAddress::new(key.clone(), SchemeStyle::HostPerAggregate).origin();
    http::Request::builder()
        .method(method)
        .uri(format!("{origin}{path}"))
        .header("origin", origin)
        .header("content-type", "application/json")
        .body(body.as_bytes().to_vec())
        .unwrap()
}

mod given_an_aggregate_closing {
    use super::*;

    #[tokio::test]
    async fn after_an_edit_leaves_the_directory_with_the_edit() {
        let (temporary, directory) = fixture_copy();
        let (open_aggregates, key, run) = open(&directory, &stand_in_build(&temporary)).await;
        let loaded = open_aggregates
            .answer("space-0", request(&key, "GET", &meta_api(), ""))
            .await;
        let loaded: serde_json::Value = serde_json::from_slice(loaded.body()).unwrap();
        let committed = open_aggregates
            .answer(
                "space-0",
                request(
                    &key,
                    "POST",
                    "/api/spaces",
                    &rename_text(&loaded, "Closed with an edit"),
                ),
            )
            .await;
        assert_eq!(committed.status(), 200, "the edit is committed");
        // Closed at once, inside the quiet period: the close writes it.
        let (windows, stopped) = close_aggregate(&open_aggregates, &key, run).await;
        assert_eq!(windows, vec!["space-0".to_owned()], "its window");
        assert!(matches!(stopped, RunStopped::Stopped), "{stopped:?}");
        let written = std::fs::read_to_string(directory.join(META).join("space.json")).unwrap();
        assert!(
            written.contains("Closed with an edit"),
            "the directory should hold the edit: {written}"
        );
    }

    #[tokio::test]
    async fn opened_and_closed_with_no_edit_leaves_the_directory_unchanged() {
        let (temporary, directory) = fixture_copy();
        let before = snapshot(&directory);
        let (open_aggregates, key, run) = open(&directory, &stand_in_build(&temporary)).await;
        // Opening the Aggregate's page reads it, which initializes its Spaces (ST-65).
        for path in ["/", META_ADDRESS, "/api/spaces", meta_api().as_str()] {
            let response = open_aggregates
                .answer("space-0", request(&key, "GET", path, ""))
                .await;
            assert!(
                response.status().as_u16() < 400,
                "{path}: {}",
                response.status()
            );
        }
        let (_windows, stopped) = close_aggregate(&open_aggregates, &key, run).await;
        assert!(matches!(stopped, RunStopped::Stopped), "{stopped:?}");
        assert!(
            snapshot(&directory) == before,
            "the directory should be byte for byte as it was (ST-65)"
        );
    }

    /// An Edit the page has sent before the close, which the handler
    /// is still answering however long the close waits, is answered
    /// 200 and must be in the last write.
    #[tokio::test(start_paused = true)]
    async fn writes_an_edit_still_being_answered_however_long_it_takes() {
        let (temporary, directory) = fixture_copy();
        let (open_aggregates, key, run) = open(&directory, &stand_in_build(&temporary)).await;
        let loaded = open_aggregates
            .answer("space-0", request(&key, "GET", &meta_api(), ""))
            .await;
        let loaded: serde_json::Value = serde_json::from_slice(loaded.body()).unwrap();
        let Ok(admitted) = open_aggregates.admit(
            "space-0",
            request(
                &key,
                "POST",
                "/api/spaces",
                &rename_text(&loaded, "Answered while closing"),
            ),
        ) else {
            panic!("the change should be admitted before the close");
        };
        let answer_late = async {
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
            admitted.answer().await
        };
        let ((_windows, stopped), committed) =
            tokio::join!(close_aggregate(&open_aggregates, &key, run), answer_late);
        assert_eq!(committed.status(), 200, "the page is told the edit landed");
        assert!(matches!(stopped, RunStopped::Stopped), "{stopped:?}");
        let written = std::fs::read_to_string(directory.join(META).join("space.json")).unwrap();
        assert!(
            written.contains("Answered while closing"),
            "an edit answered 200 should be on disk after the close: {written}"
        );
    }

    #[tokio::test]
    async fn refuses_a_request_made_once_it_is_closing() {
        let (temporary, directory) = fixture_copy();
        let (open_aggregates, key, run) = open(&directory, &stand_in_build(&temporary)).await;
        let (_windows, _stopped) = close_aggregate(&open_aggregates, &key, run).await;
        let response = open_aggregates
            .answer("space-0", request(&key, "GET", "/api/spaces", ""))
            .await;
        assert_eq!(
            response.status(),
            404,
            "no Edit can arrive after the last write"
        );
    }
}

mod given_a_space_window {
    use super::*;

    #[tokio::test]
    async fn opens_at_the_meta_space_the_root_redirects_to() {
        let (temporary, directory) = fixture_copy();
        let (open_aggregates, key, run) = open(&directory, &stand_in_build(&temporary)).await;
        assert_eq!(
            first_address(&Arc::clone(run.application()).into()).await,
            crate::test_support::META_ADDRESS,
            "the root's redirect, followed by the shell"
        );
        let (_windows, _stopped) = close_aggregate(&open_aggregates, &key, run).await;
    }

    fn windows() -> (SpaceWindows, Url) {
        let address = AggregateAddress::new(
            AggregateKey::of(Path::new("/spaces/rust")),
            SchemeStyle::HostPerAggregate,
        );
        let root = address.window_url().unwrap();
        let first = root.join(crate::test_support::META_ADDRESS).unwrap();
        let open_aggregates = Arc::new(OpenAggregates::new(SchemeStyle::HostPerAggregate));
        (SpaceWindows::new(address, first, open_aggregates), root)
    }

    #[test]
    fn asked_for_the_aggregates_root_loads_the_address_it_redirects_to() {
        let (windows, root) = windows();
        for asked in ["/", "/?reload=1", "/#top"] {
            assert_eq!(
                windows.navigation(&root.join(asked).unwrap()),
                Navigation::Redirect(windows.first().clone()),
                "{asked}: WebKitGTK would stay on the redirect's empty body"
            );
        }
    }

    #[test]
    fn asked_for_its_origin_with_no_path_loads_the_address_the_root_redirects_to() {
        let (windows, root) = windows();
        let origin = Url::parse(root.as_str().trim_end_matches('/')).unwrap();
        assert_eq!(
            origin.path(),
            "",
            "a non-special scheme's origin has no path"
        );
        assert_eq!(
            windows.navigation(&origin),
            Navigation::Redirect(windows.first().clone()),
            "`location.origin` is the root too"
        );
    }

    #[test]
    fn loads_any_other_address_of_its_aggregate_and_none_elsewhere() {
        let (windows, root) = windows();
        assert_eq!(
            windows.navigation(windows.first()),
            Navigation::Load,
            "its first address"
        );
        assert_eq!(
            windows.navigation(&root.join("/spaces/AAAAAAAAQACAAAAAAAAAQA/notes").unwrap()),
            Navigation::Load,
            "another page of the Aggregate"
        );
        assert_eq!(
            windows.navigation(&Url::parse("https://example.com/").unwrap()),
            Navigation::Refuse,
            "a remote origin"
        );
    }

    #[tokio::test]
    async fn a_page_opening_the_aggregates_root_opens_its_first_address() {
        let (windows, root) = windows();
        let (temporary, directory) = fixture_copy();
        let run = open_run(
            &directory,
            built_shell(&stand_in_build(&temporary)).unwrap(),
            |_| {},
        )
        .await
        .unwrap();
        windows.open_aggregates.open(
            windows.address.clone(),
            Arc::clone(run.application()),
            "space-0",
        );
        let opened = windows.open_from_page(&root);
        assert!(
            matches!(&opened, Some((_label, url)) if url == windows.first()),
            "{opened:?}"
        );
        let _stopped = run.stop().await;
    }
}

/// What a presenter reads for a folder refused for `error`.
fn refusal(directory: &Path, error: &ImportError) -> String {
    match unrun(directory, error) {
        Some(Started::Refused { message }) => message,
        other => panic!("{error:?} should be refused, but is {other:?}"),
    }
}

mod given_a_folder_with_no_aggregate {
    use super::*;

    #[test]
    fn is_offered_a_new_space_rather_than_refused() {
        let unrun = unrun(Path::new("/spaces/empty"), &ImportError::Empty);
        assert!(matches!(unrun, Some(Started::Empty)), "{unrun:?}");
    }

    #[tokio::test]
    async fn is_empty_when_it_holds_only_dot_entries() {
        let temporary = tempfile::tempdir().unwrap();
        let directory = temporary.path().join("space");
        std::fs::create_dir_all(directory.join(".git")).unwrap();
        let error = open_run(
            &directory,
            built_shell(&stand_in_build(&temporary)).unwrap(),
            |_| {},
        )
        .await
        .unwrap_err();
        assert!(
            matches!(unrun(&directory, &error), Some(Started::Empty)),
            "{error:?}"
        );
    }
}

mod given_a_folder_another_run_holds {
    use super::*;

    #[tokio::test]
    async fn is_refused_naming_the_folder_and_no_command() {
        let (temporary, directory) = fixture_copy();
        let holder = open_run(
            &directory,
            built_shell(&stand_in_build(&temporary)).unwrap(),
            |_| {},
        )
        .await
        .unwrap();
        let error = open_run(
            &directory,
            built_shell(&stand_in_build(&temporary)).unwrap(),
            |_| {},
        )
        .await
        .unwrap_err();
        let message = refusal(&directory, &error);
        assert_eq!(
            message,
            format!(
                "{} is open in another InfinityCube window or run: close it there first.",
                directory.display()
            ),
            "as the Node sidecar words it"
        );
        let _stopped = holder.stop().await;
    }
}

mod given_a_folder_intake_refuses {
    use super::*;

    #[tokio::test]
    async fn is_refused_with_where_each_refusal_is() {
        let (temporary, directory) = fixture_copy();
        std::fs::remove_file(directory.join("aggregate.json")).unwrap();
        let error = open_run(
            &directory,
            built_shell(&stand_in_build(&temporary)).unwrap(),
            |_| {},
        )
        .await
        .unwrap_err();
        let message = refusal(&directory, &error);
        assert!(
            message.contains("(aggregate-file-missing at aggregate.json)"),
            "each refusal names its kind and file: {message}"
        );
    }
}
