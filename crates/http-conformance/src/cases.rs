//! The cases, one `pub async fn` each, grouped as [`crate::cases!`] lists
//! them. Each carries `// Case: <its name>`, the name its TypeScript `it`
//! writes, each template substitution written `*`.

use bytes::Bytes;
use http::{Request, Response};
use serde_json::json;

use crate::support::assertions::{
    api_policy, html_problem, invalid_request, json_media, not_found, problem, shell, unsupported,
    whole_body_invalid,
};
use crate::support::{
    fresh, get, header, json_of, load, padded, path_of, post_asset, post_commit, rename_change,
    rename_text, revision, send,
};
use crate::{
    Adapter, FIXTURE_SPACES, META, META_ADDRESS, NEW_SPACE, OUTSIDE_THE_BUILD, STAND_IN_ICON,
    STAND_IN_SCRIPT, UNKNOWN_SPACE, fixture,
};

/// The largest commit body the wire takes, written here rather than read
/// from a host (ST-77).
const COMMIT_LIMIT: usize = 1 << 20;
/// The largest asset the wire takes, written here rather than read from a
/// host (ST-75).
const ASSET_LIMIT: usize = 10 << 20;

pub mod given_a_space_api_request {
    use super::*;

    // Case: lists every Space of the directory with its title
    pub async fn lists_every_space_of_the_directory_with_its_title<A: Adapter>(subject: &A) {
        let response = get(subject, "/api/spaces").await;
        assert_eq!(response.status(), 200, "listed");
        json_media(&response);
        api_policy(&response);
        let mut listed: Vec<(String, String)> = json_of(&response)
            .as_array()
            .unwrap()
            .iter()
            .map(|summary| {
                let id = summary["id"].as_str().unwrap().to_owned();
                let title = summary["title"].as_str().unwrap().to_owned();
                (id, title)
            })
            .collect();
        listed.sort();
        let expected: Vec<(String, String)> = FIXTURE_SPACES
            .iter()
            .map(|id| ((*id).to_owned(), fixture_title(id)))
            .collect();
        assert_eq!(
            listed, expected,
            "every Space directory of the fixture, with the title its space.json writes"
        );
    }

    // Case: answers one Space with its snapshot and revision
    pub async fn answers_one_space_with_its_snapshot_and_revision<A: Adapter>(subject: &A) {
        let loaded = load(subject, META).await;
        assert_eq!(loaded["snapshot"]["id"], META, "its snapshot");
        assert!(
            loaded["revision"].as_str().unwrap().parse::<u64>().is_ok(),
            "a revision: {loaded}"
        );
    }

    // Case: answers the aggregate with its Meta Space and every Space
    pub async fn answers_the_aggregate_with_its_meta_space_and_every_space<A: Adapter>(
        subject: &A,
    ) {
        let response = get(subject, "/api/aggregate").await;
        assert_eq!(response.status(), 200, "loaded");
        json_media(&response);
        api_policy(&response);
        let body = json_of(&response);
        assert_eq!(body["kind"], "loaded", "the aggregate is loaded");
        assert_eq!(body["aggregate"]["metaSpaceId"], META, "its Meta Space");
        let mut ids: Vec<&str> = body["aggregate"]["spaces"]
            .as_array()
            .unwrap()
            .iter()
            .map(|space| space["snapshot"]["id"].as_str().unwrap())
            .collect();
        ids.sort_unstable();
        assert_eq!(ids, FIXTURE_SPACES, "every Space of the fixture");
    }

    /// The title a fixture Space's `space.json` writes.
    fn fixture_title(id: &str) -> String {
        let text = std::fs::read_to_string(fixture().join(id).join("space.json")).unwrap();
        let document: serde_json::Value = serde_json::from_str(&text).unwrap();
        document["title"].as_str().unwrap().to_owned()
    }

    // Case: answers 404 not-found for a Space that does not exist
    pub async fn answers_404_for_a_space_that_does_not_exist<A: Adapter>(subject: &A) {
        let response = get(subject, &format!("/api/spaces/{UNKNOWN_SPACE}")).await;
        api_policy(&response);
        not_found(&response);
    }

    // Case: answers 400 invalid-space-id for an id that is not a UUID, whatever the method
    pub async fn answers_400_invalid_space_id_whatever_the_method<A: Adapter>(subject: &A) {
        for method in ["GET", "PUT"] {
            let response = send(subject, method, "/api/spaces/not-a-uuid", &[], Bytes::new()).await;
            problem(&response, "invalid-space-id", 400, "Invalid Space id");
        }
    }

    // Case: answers 405 to %s %s, allowing %s
    pub async fn answers_405_naming_the_methods_a_path_allows<A: Adapter>(subject: &A) {
        let meta = format!("/api/spaces/{META}");
        let unstored = format!("/assets/{}", "A".repeat(43));
        for (method, path, allow) in [
            ("DELETE", "/api/spaces", "GET, POST"),
            ("HEAD", "/api/spaces", "GET, POST"),
            ("POST", "/api/aggregate", "GET"),
            ("PUT", meta.as_str(), "GET"),
            ("HEAD", meta.as_str(), "GET"),
            ("GET", "/assets", "POST"),
            ("DELETE", unstored.as_str(), "GET, HEAD"),
        ] {
            let response = send(subject, method, path, &[], Bytes::new()).await;
            assert_eq!(response.status(), 405, "{method} {path}");
            assert_eq!(
                header(&response, "allow"),
                Some(allow),
                "{method} {path}: Allow"
            );
            api_policy(&response);
            if method == "HEAD" {
                assert!(response.body().is_empty(), "{method} {path}: no body");
            } else {
                problem(&response, "method-not-allowed", 405, "Method not allowed");
            }
        }
    }

    // Case: answers %s as the path it escapes
    pub async fn answers_an_unreserved_escape_as_the_path_it_escapes<A: Adapter>(subject: &A) {
        let escaped_id = format!("/api/spaces/%30{}", &META[1..]);
        for path in ["/api/%73paces", escaped_id.as_str()] {
            let response = get(subject, path).await;
            assert_eq!(response.status(), 200, "{path}: {:?}", response.body());
            json_media(&response);
            api_policy(&response);
        }
    }

    // Case: answers 404 not-found for %s, which is off the declared API
    pub async fn answers_404_for_a_path_off_the_declared_api<A: Adapter>(subject: &A) {
        let more = format!("/api/spaces/{META}/more");
        for path in ["/api", "/api/nowhere", "/api/spaces/", more.as_str()] {
            let response = get(subject, path).await;
            api_policy(&response);
            not_found(&response);
        }
    }
}

pub mod given_a_commit {
    use super::*;
    use intake::json::JsonValue;

    // Case: answers * committed with each Space's next revision
    pub async fn answers_200_committed_with_each_spaces_next_revision<A: Adapter>(subject: &A) {
        let loaded = load(subject, META).await;
        let response = post_commit(
            subject,
            rename_text(&loaded, "Committed"),
            "application/json",
        )
        .await;
        assert_eq!(response.status(), 200, "committed");
        json_media(&response);
        api_policy(&response);
        assert_eq!(
            json_of(&response),
            json!({
                "revisions": [{ "spaceId": META, "revision": (revision(&loaded) + 1).to_string() }],
                "deletedSpaceIds": [],
            }),
            "the next revision"
        );
        assert_eq!(
            load(subject, META).await["snapshot"]["document"]["title"],
            "Committed",
            "renamed"
        );
    }

    // Case: answers * conflict with the current Space for a stale revision
    pub async fn answers_409_with_the_current_space_for_a_stale_revision<A: Adapter>(subject: &A) {
        let stale = load(subject, META).await;
        let first = post_commit(subject, rename_text(&stale, "First"), "application/json").await;
        assert_eq!(first.status(), 200, "the first commit");
        let response =
            post_commit(subject, rename_text(&stale, "Second"), "application/json").await;
        assert_eq!(response.status(), 409, "a conflict");
        json_media(&response);
        let conflicts = json_of(&response)["conflicts"].clone();
        assert_eq!(conflicts.as_array().unwrap().len(), 1, "one conflict");
        assert_eq!(conflicts[0]["spaceId"], META, "the Meta Space");
        assert_eq!(
            conflicts[0]["current"]["revision"],
            (revision(&stale) + 1).to_string(),
            "its current revision"
        );
        assert_eq!(
            conflicts[0]["current"]["snapshot"]["document"]["title"], "First",
            "its current title"
        );
    }

    // Case: answers * aggregate-refused for a Space no Space Resource references
    pub async fn answers_422_for_a_space_no_space_resource_references<A: Adapter>(subject: &A) {
        let commit = json!({
            "changes": [{
                "kind": "create",
                "spaceId": NEW_SPACE,
                "snapshot": { "id": NEW_SPACE, "document": { "version": 1, "title": "Unreferenced" }, "resources": [] },
            }],
        });
        let response = post_commit(subject, commit.to_string(), "application/json").await;
        assert_eq!(response.status(), 422, "refused");
        json_media(&response);
        assert_eq!(
            json_of(&response),
            json!({ "errors": [{ "kind": "ordinary-space-unreferenced", "spaceId": NEW_SPACE }] }),
            "the unreferenced Space"
        );
        not_found(&get(subject, &format!("/api/spaces/{NEW_SPACE}")).await);
    }

    /// `value` with each member `transform` answers for its key replaced.
    fn replacing(
        value: &JsonValue,
        transform: impl Fn(&str, &JsonValue) -> Option<JsonValue>,
    ) -> JsonValue {
        let object = value.as_object().unwrap();
        JsonValue::Object(
            object
                .iter()
                .map(|(key, member)| {
                    let member = transform(key, member).unwrap_or_else(|| member.clone());
                    (key.to_owned(), member)
                })
                .collect(),
        )
    }

    /// The ids of a snapshot's first Map's positions, in the order its JSON
    /// text writes them.
    fn first_map_positions(snapshot: &JsonValue) -> Vec<String> {
        let first_map = match snapshot.as_object().unwrap().get("document").unwrap() {
            JsonValue::Object(document) => match document.get("maps").unwrap() {
                JsonValue::Array(maps) => maps.first().unwrap().clone(),
                other => panic!("maps: {other}"),
            },
            other => panic!("document: {other}"),
        };
        let positions = first_map.as_object().unwrap().get("positions").unwrap();
        positions
            .as_object()
            .unwrap()
            .iter()
            .map(|(id, _)| id.to_owned())
            .collect()
    }

    fn text_of(response: &Response<Bytes>) -> JsonValue {
        intake::json::parse(std::str::from_utf8(response.body()).unwrap()).unwrap()
    }

    // Case: answers a Space with its positions in the order the commit wrote them
    pub async fn answers_positions_in_the_order_the_commit_wrote_them<A: Adapter>(subject: &A) {
        let loaded = text_of(&get(subject, &format!("/api/spaces/{META}")).await);
        let loaded = loaded.as_object().unwrap();
        let revision = loaded.get("revision").unwrap().as_str().unwrap();
        let stored = first_map_positions(loaded.get("snapshot").unwrap());
        let snapshot = replacing(loaded.get("snapshot").unwrap(), |key, document| {
            (key == "document").then(|| {
                replacing(document, |key, maps| {
                    let JsonValue::Array(maps) = maps else {
                        return None;
                    };
                    (key == "maps").then(|| {
                        let mut maps = maps.clone();
                        let first = maps.first_mut().unwrap();
                        *first = replacing(first, |key, positions| {
                            (key == "positions").then(|| {
                                let mut entries: Vec<(String, JsonValue)> = positions
                                    .as_object()
                                    .unwrap()
                                    .iter()
                                    .map(|(id, at)| (id.to_owned(), at.clone()))
                                    .collect();
                                entries.reverse();
                                JsonValue::Object(entries.into_iter().collect())
                            })
                        });
                        JsonValue::Array(maps)
                    })
                })
            })
        });
        let order = first_map_positions(&snapshot);
        assert!(
            order.len() > 1,
            "the fixture Meta Space's Map has positions"
        );
        assert_eq!(
            order,
            stored.into_iter().rev().collect::<Vec<_>>(),
            "the commit reverses them"
        );
        let body = format!(
            r#"{{"changes":[{{"kind":"update","spaceId":"{META}","snapshot":{snapshot},"expectedRevision":"{revision}"}}]}}"#
        );
        let committed = post_commit(subject, body.clone(), "application/json").await;
        assert_eq!(committed.status(), 200, "committed: {:?}", committed.body());
        let answered = text_of(&get(subject, &format!("/api/spaces/{META}")).await);
        assert_eq!(
            first_map_positions(answered.as_object().unwrap().get("snapshot").unwrap()),
            order,
            "the positions in the order the commit wrote them"
        );
        let stale = post_commit(subject, body, "application/json").await;
        assert_eq!(stale.status(), 409, "a conflict");
        let JsonValue::Array(conflicts) = text_of(&stale)
            .as_object()
            .unwrap()
            .get("conflicts")
            .unwrap()
            .clone()
        else {
            panic!("conflicts");
        };
        let current = conflicts
            .first()
            .unwrap()
            .as_object()
            .unwrap()
            .get("current")
            .unwrap()
            .clone();
        assert_eq!(
            first_map_positions(current.as_object().unwrap().get("snapshot").unwrap()),
            order,
            "the conflict's current Space as stored"
        );
    }

    // Case: answers 400 invalid-request for a commit the store will not judge
    pub async fn answers_400_for_a_commit_the_store_will_not_judge<A: Adapter>(subject: &A) {
        let loaded = load(subject, META).await;
        let change = rename_change(&loaded, "Twice");
        let text = json!({ "changes": [change.clone(), change] }).to_string();
        let response = post_commit(subject, text, "application/json").await;
        api_policy(&response);
        invalid_request(&response);
        whole_body_invalid(&response);
    }

    /// Import reads a Space directory only by a lower-case name, so a Space
    /// created under an upper-case id would be exported where no run reads it.
    // Case: answers 400 invalid-request for a Space named in upper case
    pub async fn answers_400_for_a_space_named_in_upper_case<A: Adapter>(subject: &A) {
        let upper = "ABCDEF00-0000-4000-8000-00000000000A";
        let text = json!({
            "changes": [{
                "kind": "create",
                "spaceId": upper,
                "snapshot": {
                    "id": upper,
                    "document": { "version": 1, "title": "Upper" },
                    "resources": []
                }
            }]
        })
        .to_string();
        let response = post_commit(subject, text, "application/json").await;
        api_policy(&response);
        invalid_request(&response);
        whole_body_invalid(&response);
    }

    // Case: answers 400 invalid-request for malformed JSON
    pub async fn answers_400_for_malformed_json<A: Adapter>(subject: &A) {
        let response = post_commit(subject, "{", "application/json").await;
        invalid_request(&response);
        assert!(
            json_of(&response).get("errors").is_none(),
            "no errors: {:?}",
            response.body()
        );
    }

    /// ADR 0160: a lone surrogate escape is refused as malformed JSON and
    /// nothing is stored, as the Node host refuses it.
    // Case: answers 400 invalid-request for a lone surrogate escape, as for malformed JSON
    pub async fn answers_400_for_a_lone_surrogate_as_for_malformed_json<A: Adapter>(subject: &A) {
        let loaded = load(subject, META).await;
        let text = rename_text(&loaded, "LONE").replace("\"LONE\"", r#""\ud800x""#);
        assert!(text.contains(r"\ud800x"), "the escape is sent: {text}");
        let response = post_commit(subject, text, "application/json").await;
        invalid_request(&response);
        assert_eq!(
            json_of(&response)["detail"],
            "Malformed JSON in request body",
            "refused as malformed"
        );
        assert_eq!(
            revision(&load(subject, META).await),
            revision(&loaded),
            "nothing stored"
        );
    }

    // Case: answers 400 invalid-request for a body that is not a commit
    pub async fn answers_400_for_a_body_that_is_not_a_commit<A: Adapter>(subject: &A) {
        let response = post_commit(subject, r#"{"changes":"none"}"#, "application/json").await;
        invalid_request(&response);
        whole_body_invalid(&response);
    }

    // Case: answers 415 unsupported-media-type for a commit sent with no Content-Type
    pub async fn answers_415_for_a_commit_sent_with_no_content_type<A: Adapter>(subject: &A) {
        let loaded = load(subject, META).await;
        let response = send(
            subject,
            "POST",
            "/api/spaces",
            &[],
            rename_text(&loaded, "Untyped"),
        )
        .await;
        unsupported(&response);
        assert_eq!(
            revision(&load(subject, META).await),
            revision(&loaded),
            "nothing committed"
        );
    }

    // Case: answers 415 unsupported-media-type for a commit sent as %s
    pub async fn answers_415_for_a_commit_sent_as_another_type<A: Adapter>(subject: &A) {
        for content_type in [
            "text/plain",
            "application/json; charset=iso-8859-1",
            "application/json; x=1; x=2",
        ] {
            let loaded = load(subject, META).await;
            unsupported(&post_commit(subject, rename_text(&loaded, "Refused"), content_type).await);
        }
    }

    // Case: answers 415 unsupported-media-type for an encoded commit
    pub async fn answers_415_for_an_encoded_commit<A: Adapter>(subject: &A) {
        let loaded = load(subject, META).await;
        let response = send(
            subject,
            "POST",
            "/api/spaces",
            &[
                ("content-type", "application/json"),
                ("content-encoding", "gzip"),
            ],
            rename_text(&loaded, "Encoded"),
        )
        .await;
        unsupported(&response);
    }

    // Case: accepts a media type with spaces around its parameter (RFC 9110)
    pub async fn accepts_a_media_type_with_spaces_around_its_parameter<A: Adapter>(subject: &A) {
        let loaded = load(subject, META).await;
        let response = post_commit(
            subject,
            rename_text(&loaded, "Spaced"),
            "application/json ; charset=UTF-8",
        )
        .await;
        assert_eq!(response.status(), 200, "RFC 9110 allows the spaces");
    }

    // Case: accepts a media type whose quoted parameter carries a Latin-1 byte
    pub async fn accepts_a_quoted_parameter_carrying_a_latin_1_byte<A: Adapter>(subject: &A) {
        let loaded = load(subject, META).await;
        let request = Request::post("/api/spaces")
            .header(
                "content-type",
                http::HeaderValue::from_bytes(b"application/json; x=\"\xe9\"").unwrap(),
            )
            .body(Bytes::from(rename_text(&loaded, "Latin-1")))
            .unwrap();
        let response = subject.send(request).await;
        assert_eq!(response.status(), 200, "committed: {:?}", response.body());
    }

    // Case: commits a body of exactly * bytes
    pub async fn commits_a_body_of_exactly_the_limit<A: Adapter>(subject: &A) {
        let loaded = load(subject, META).await;
        let padded = padded(&rename_text(&loaded, "At the limit"), COMMIT_LIMIT);
        assert_eq!(
            post_commit(subject, padded, "application/json")
                .await
                .status(),
            200,
            "at the limit"
        );
    }

    // Case: answers 413 payload-too-large for a body of * bytes
    pub async fn answers_413_for_a_body_one_byte_over_the_limit<A: Adapter>(subject: &A) {
        let loaded = load(subject, META).await;
        let padded = padded(&rename_text(&loaded, "Too large"), COMMIT_LIMIT + 1);
        let response = post_commit(subject, padded, "application/json").await;
        api_policy(&response);
        problem(&response, "payload-too-large", 413, "Payload too large");
        assert_eq!(
            revision(&load(subject, META).await),
            revision(&loaded),
            "nothing committed"
        );
    }
}

pub mod given_an_asset_request {
    use super::*;

    // Case: stores an asset at its hash, 201 the first time and 200 after
    pub async fn stores_an_asset_at_its_hash_201_the_first_time_and_200_after<A: Adapter>(
        subject: &A,
    ) {
        let bytes = fresh(64, "stores");
        let url = path_of(&bytes);
        assert_eq!(
            url, "/assets/en92Qf23B2hkBFm0qOk9IyHE7mrNoDfDHFzbAOri4gM",
            "the unpadded base64url SHA-256 of the bytes"
        );
        let first = post_asset(subject, bytes.clone(), &[("content-type", "image/png")]).await;
        assert_eq!(first.status(), 201, "stored");
        assert_eq!(
            header(&first, "location"),
            Some(url.as_str()),
            "its location"
        );
        json_media(&first);
        api_policy(&first);
        assert_eq!(json_of(&first), json!({ "url": url }), "its url");
        let again = post_asset(subject, bytes, &[("content-type", "image/png")]).await;
        assert_eq!(again.status(), 200, "already stored");
        assert_eq!(json_of(&again), json!({ "url": url }), "the same url");
    }

    // Case: serves a stored picture as itself, immutable and sandboxed
    pub async fn serves_a_stored_picture_as_itself_immutable_and_sandboxed<A: Adapter>(
        subject: &A,
    ) {
        let bytes = fresh(32, "picture");
        post_asset(subject, bytes.clone(), &[("content-type", "image/png")]).await;
        let response = get(subject, &path_of(&bytes)).await;
        assert_eq!(response.status(), 200, "served");
        assert_eq!(
            header(&response, "content-type"),
            Some("image/png"),
            "as itself"
        );
        assert_eq!(
            header(&response, "x-asset-media-type"),
            Some("image/png"),
            "its stored type"
        );
        assert_eq!(
            header(&response, "cache-control"),
            Some("public, max-age=31536000, immutable"),
            "immutable"
        );
        assert_eq!(
            header(&response, "x-content-type-options"),
            Some("nosniff"),
            "nosniff"
        );
        assert_eq!(
            header(&response, "content-security-policy"),
            Some("default-src 'none'; sandbox"),
            "sandboxed"
        );
        assert_eq!(response.body().as_ref(), bytes.as_slice(), "its bytes");
    }

    // Case: serves any other stored type as inert bytes, naming the type it was stored as
    pub async fn serves_any_other_stored_type_as_inert_bytes<A: Adapter>(subject: &A) {
        let bytes = fresh(16, "html");
        post_asset(subject, bytes.clone(), &[("content-type", "text/html")]).await;
        let response = get(subject, &path_of(&bytes)).await;
        assert_eq!(
            header(&response, "content-type"),
            Some("application/octet-stream"),
            "inert"
        );
        assert_eq!(
            header(&response, "x-asset-media-type"),
            Some("text/html"),
            "its stored type"
        );
    }

    // Case: answers HEAD for a stored asset without its bytes
    pub async fn answers_head_for_a_stored_asset_without_its_bytes<A: Adapter>(subject: &A) {
        let bytes = fresh(16, "head");
        post_asset(subject, bytes.clone(), &[("content-type", "image/png")]).await;
        let response = send(subject, "HEAD", &path_of(&bytes), &[], Bytes::new()).await;
        assert_eq!(response.status(), 200, "served");
        assert_eq!(
            header(&response, "content-type"),
            Some("image/png"),
            "its type"
        );
        assert!(response.body().is_empty(), "no bytes");
    }

    // Case: serves a stored asset at its hash with a character escaped
    pub async fn serves_a_stored_asset_at_its_hash_with_a_character_escaped<A: Adapter>(
        subject: &A,
    ) {
        let bytes = fresh(16, "escaped");
        post_asset(subject, bytes.clone(), &[("content-type", "image/png")]).await;
        let path = path_of(&bytes);
        let hash = path.strip_prefix("/assets/").unwrap();
        let escaped = format!("/assets/%{:02X}{}", hash.as_bytes()[0], &hash[1..]);
        let response = get(subject, &escaped).await;
        assert_eq!(response.status(), 200, "{escaped}: {:?}", response.body());
        assert_eq!(
            header(&response, "x-asset-media-type"),
            Some("image/png"),
            "the stored type"
        );
        assert_eq!(response.body().as_ref(), bytes.as_slice(), "its bytes");
    }

    // Case: answers 404 not-found for a hash no asset is stored at
    pub async fn answers_404_for_a_hash_no_asset_is_stored_at<A: Adapter>(subject: &A) {
        not_found(&get(subject, &format!("/assets/{}", "A".repeat(43))).await);
    }

    // Case: answers 415 unsupported-media-type for an encoded asset
    pub async fn answers_415_for_an_encoded_asset<A: Adapter>(subject: &A) {
        let response = post_asset(
            subject,
            fresh(8, "encoded"),
            &[("content-type", "image/png"), ("content-encoding", "gzip")],
        )
        .await;
        unsupported(&response);
    }

    // Case: stores an asset of exactly * bytes
    pub async fn stores_an_asset_of_exactly_the_limit<A: Adapter>(subject: &A) {
        let bytes = fresh(ASSET_LIMIT, "limit");
        let response = post_asset(
            subject,
            bytes.clone(),
            &[("content-type", "application/octet-stream")],
        )
        .await;
        assert_eq!(response.status(), 201, "at the limit");
        let served = get(subject, &path_of(&bytes)).await;
        assert_eq!(served.status(), 200, "and served");
        assert!(served.body().as_ref() == bytes.as_slice(), "byte for byte");
    }

    // Case: answers 413 asset-too-large for an asset of * bytes
    pub async fn answers_413_for_an_asset_one_byte_over_the_limit<A: Adapter>(subject: &A) {
        let bytes = fresh(ASSET_LIMIT + 1, "over");
        let path = path_of(&bytes);
        let response = post_asset(
            subject,
            bytes,
            &[("content-type", "application/octet-stream")],
        )
        .await;
        api_policy(&response);
        problem(&response, "asset-too-large", 413, "Asset too large");
        not_found(&get(subject, &path).await);
    }
}

pub mod given_a_change_from_another_site {
    use super::*;

    /// `CROSS_SITE_CHANGE_DETAIL` (`packages/http/src/index.ts`).
    const DETAIL: &str = "Send a change from the application's own page.";

    fn refused(response: &Response<Bytes>) {
        api_policy(response);
        problem(response, "forbidden", 403, "Forbidden");
        assert_eq!(
            json_of(response)["detail"],
            DETAIL,
            "the same detail as the Node host"
        );
    }

    /// What a request from the application's own address names, `origin`
    /// as its `Origin`, and `more`.
    fn naming<'a>(
        address: &'a [(&'static str, String)],
        origin: &'a str,
        more: &[(&'a str, &'a str)],
    ) -> Vec<(&'a str, &'a str)> {
        let mut headers: Vec<(&str, &str)> = address
            .iter()
            .map(|(name, value)| (*name, value.as_str()))
            .collect();
        headers.push(("origin", origin));
        headers.extend_from_slice(more);
        headers
    }

    // Case: answers 403 forbidden to a change sent with Sec-Fetch-Site: %s, changing nothing
    pub async fn refuses_a_change_another_site_sends_by_its_sec_fetch_site<A: Adapter>(
        subject: &A,
    ) {
        let address = subject.own_address();
        let own = subject.own_origin();
        for site in ["cross-site", "same-site"] {
            let headers = naming(&address, &own, &[("sec-fetch-site", site)]);
            let bytes = format!("cross-site {headers:?}").into_bytes();
            let path = path_of(&bytes);
            let mut asset = headers.clone();
            asset.push(("content-type", "text/plain"));
            refused(&send(subject, "POST", "/assets", &asset, bytes).await);
            not_found(&get(subject, &path).await);
            let loaded = load(subject, META).await;
            let mut commit = headers.clone();
            commit.push(("content-type", "application/json"));
            let text = rename_text(&loaded, "Cross-site");
            refused(&send(subject, "POST", "/api/spaces", &commit, text).await);
            assert_eq!(
                revision(&load(subject, META).await),
                revision(&loaded),
                "{headers:?}: the Meta Space is unchanged"
            );
        }
    }

    // Case: stores an asset sent with Sec-Fetch-Site: %s from its own origin
    pub async fn stores_an_asset_sent_from_its_own_origin<A: Adapter>(subject: &A) {
        let address = subject.own_address();
        let own = subject.own_origin();
        for site in ["same-origin", "none"] {
            let headers = naming(
                &address,
                &own,
                &[("content-type", "text/plain"), ("sec-fetch-site", site)],
            );
            let response = send(
                subject,
                "POST",
                "/assets",
                &headers,
                format!("cross-site {site}"),
            )
            .await;
            assert_eq!(response.status(), 201, "{site}: stored");
        }
    }

    // Case: stores an asset sent from its own origin naming no Sec-Fetch-Site
    pub async fn stores_an_asset_sent_from_its_own_origin_naming_no_sec_fetch_site<A: Adapter>(
        subject: &A,
    ) {
        let address = subject.own_address();
        let own = subject.own_origin();
        let headers = naming(&address, &own, &[("content-type", "text/plain")]);
        let response = send(
            subject,
            "POST",
            "/assets",
            &headers,
            "own origin, no Sec-Fetch-Site",
        )
        .await;
        assert_eq!(response.status(), 201, "stored");
    }

    // Case: answers a read whatever site a browser says sent it
    pub async fn answers_a_read_whatever_site_sent_it<A: Adapter>(subject: &A) {
        let address = subject.own_address();
        let headers = naming(
            &address,
            "http://attacker.example",
            &[("sec-fetch-site", "cross-site")],
        );
        let listed = send(subject, "GET", "/api/spaces", &headers, Bytes::new()).await;
        assert_eq!(listed.status(), 200, "the Spaces are listed");
        let bytes = b"cross-site read".to_vec();
        let path = path_of(&bytes);
        let stored = post_asset(subject, bytes, &[("content-type", "image/png")]).await;
        assert_eq!(stored.status(), 201, "stored from the page");
        let read = send(subject, "GET", &path, &headers, Bytes::new()).await;
        assert_eq!(read.status(), 200, "the asset is served");
    }
}

pub mod given_a_product_address {
    use super::*;

    // Case: redirects %s / to the Meta Space with 302
    pub async fn redirects_get_and_head_of_the_root_to_the_meta_space<A: Adapter>(subject: &A) {
        for method in ["GET", "HEAD"] {
            let response = send(subject, method, "/", &[], Bytes::new()).await;
            assert_eq!(response.status(), 302, "{method}: a redirect");
            assert_eq!(
                header(&response, "location"),
                Some(META_ADDRESS),
                "{method}: the Meta Space"
            );
        }
    }

    // Case: answers 405 method-not-allowed to %s by %s, allowing GET and HEAD
    pub async fn answers_405_to_a_write_allowing_get_and_head<A: Adapter>(subject: &A) {
        let notes = format!("{META_ADDRESS}/notes");
        for (path, method) in [
            ("/", "POST"),
            (META_ADDRESS, "POST"),
            (notes.as_str(), "DELETE"),
        ] {
            let response = send(subject, method, path, &[], Bytes::new()).await;
            assert_eq!(
                header(&response, "allow"),
                Some("GET, HEAD"),
                "{method} {path}: Allow"
            );
            problem(&response, "method-not-allowed", 405, "Method not allowed");
        }
    }

    // Case: answers 400 invalid-request to %s %s, which cannot be read
    pub async fn answers_400_to_an_address_that_cannot_be_read<A: Adapter>(subject: &A) {
        let nowhere = format!("{META_ADDRESS}/nowhere");
        for (method, path) in [
            ("GET", "/spaces"),
            ("GET", "/spaces/not-an-id"),
            ("GET", nowhere.as_str()),
            ("POST", "/spaces/not-an-id"),
        ] {
            invalid_request(&send(subject, method, path, &[], Bytes::new()).await);
        }
    }

    // Case: answers 404 not-found for an address naming no Space
    pub async fn answers_404_for_an_address_naming_no_space<A: Adapter>(subject: &A) {
        not_found(&get(subject, "/spaces/AAAAAAAAQACAAAAAAADerQ").await);
    }

    // Case: answers its refusals as HTML to a request that accepts it
    pub async fn answers_its_refusals_as_html_to_a_request_that_accepts_it<A: Adapter>(
        subject: &A,
    ) {
        let accept = [("accept", "text/html,application/xhtml+xml;q=0.9")];
        html_problem(
            &send(subject, "GET", "/spaces", &accept, Bytes::new()).await,
            400,
        );
        html_problem(
            &send(
                subject,
                "GET",
                "/spaces/AAAAAAAAQACAAAAAAADerQ",
                &accept,
                Bytes::new(),
            )
            .await,
            404,
        );
        let refused = send(subject, "POST", "/", &accept, Bytes::new()).await;
        assert_eq!(header(&refused, "allow"), Some("GET, HEAD"), "Allow");
        html_problem(&refused, 405);
    }
}

pub mod given_a_request_for_the_shell {
    use super::*;

    // Case: serves the shell for a product address that resolves
    pub async fn serves_the_shell_for_a_product_address_that_resolves<A: Adapter>(subject: &A) {
        shell(&get(subject, META_ADDRESS).await);
        shell(&get(subject, &format!("{META_ADDRESS}/notes")).await);
    }

    // Case: falls back to the shell for an address that is not the application’s
    pub async fn falls_back_to_the_shell_for_an_address_not_the_applications<A: Adapter>(
        subject: &A,
    ) {
        shell(&get(subject, "/somewhere/else").await);
    }

    // Case: answers HEAD for the shell without its body
    pub async fn answers_head_for_the_shell_without_its_body<A: Adapter>(subject: &A) {
        let response = send(subject, "HEAD", "/somewhere/else", &[], Bytes::new()).await;
        assert_eq!(response.status(), 200, "served");
        assert_eq!(
            header(&response, "content-type"),
            Some("text/html; charset=utf-8"),
            "the page's type"
        );
        assert!(response.body().is_empty(), "no body");
    }

    // Case: answers 405 to a write to an address that is not the application’s
    pub async fn answers_405_to_a_write_to_an_address_not_the_applications<A: Adapter>(
        subject: &A,
    ) {
        let response = send(subject, "POST", "/somewhere/else", &[], "x").await;
        assert_eq!(response.status(), 405, "refused");
        assert_eq!(header(&response, "allow"), Some("GET, HEAD"), "Allow");
    }

    // Case: serves a content-named built file as immutable
    pub async fn serves_a_content_named_built_file_as_immutable<A: Adapter>(subject: &A) {
        let response = get(subject, &format!("/{}", STAND_IN_SCRIPT.0)).await;
        assert_eq!(response.status(), 200, "served");
        assert_eq!(
            header(&response, "content-type"),
            Some("text/javascript; charset=utf-8"),
            "script"
        );
        assert_eq!(
            header(&response, "cache-control"),
            Some("public, max-age=31536000, immutable"),
            "immutable"
        );
        assert_eq!(
            header(&response, "x-content-type-options"),
            Some("nosniff"),
            "nosniff"
        );
        assert_eq!(response.body(), STAND_IN_SCRIPT.1.as_bytes(), "its text");
    }

    // Case: serves another built file to be revalidated
    pub async fn serves_another_built_file_to_be_revalidated<A: Adapter>(subject: &A) {
        let response = get(subject, &format!("/{}", STAND_IN_ICON.0)).await;
        assert_eq!(response.status(), 200, "served");
        assert_eq!(
            header(&response, "content-type"),
            Some("image/svg+xml"),
            "svg"
        );
        assert_eq!(
            header(&response, "cache-control"),
            Some("no-cache"),
            "revalidated"
        );
        assert_eq!(response.body(), STAND_IN_ICON.1.as_bytes(), "its text");
    }

    // Case: serves the built file an escaped climb under /assets/ resolves to
    pub async fn serves_the_built_file_an_escaped_assets_climb_resolves_to<A: Adapter>(
        subject: &A,
    ) {
        let response = get(subject, &format!("/assets/..%2F{}", STAND_IN_ICON.0)).await;
        assert_eq!(response.status(), 200, "served: {:?}", response.body());
        assert_eq!(
            header(&response, "content-type"),
            Some("image/svg+xml"),
            "its media type"
        );
        assert_eq!(response.body(), STAND_IN_ICON.1.as_bytes(), "its text");
    }

    // Case: answers 400 invalid-asset-hash, and no file, for %s
    pub async fn answers_400_invalid_asset_hash_and_no_file_under_assets<A: Adapter>(subject: &A) {
        let climb = format!("/assets/..%2f..%2f{}", OUTSIDE_THE_BUILD.0);
        for path in ["/assets/index-missing.js", climb.as_str()] {
            let response = get(subject, path).await;
            problem(&response, "invalid-asset-hash", 400, "Invalid asset hash");
            assert!(
                response.body().as_ref() != OUTSIDE_THE_BUILD.1.as_bytes(),
                "{path}: no file outside the build is served"
            );
        }
    }
}
