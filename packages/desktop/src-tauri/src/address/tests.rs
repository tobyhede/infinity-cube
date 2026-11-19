//! Tests of a talk's key and its address.

use super::*;

fn rust_talk(style: SchemeStyle) -> TalkAddress {
    TalkAddress::new(TalkKey::of(Path::new("/talks/rust")), style)
}

fn url(text: &str) -> Url {
    Url::parse(text).unwrap_or_else(|error| unreachable!("{text} is a URL: {error}"))
}

fn uri(text: &str) -> http::Uri {
    text.parse()
        .unwrap_or_else(|error| unreachable!("{text} is a URI: {error}"))
}

mod given_a_talks_key {
    use super::*;

    #[test]
    fn is_the_first_half_of_the_sha256_of_its_folder_path() {
        // `printf '/talks/rust' | sha256sum | cut -c1-32`
        assert_eq!(
            TalkKey::of(Path::new("/talks/rust")).as_str(),
            "9b684d84a4976d0f4e7893a2dbd4b781",
            "the key should be the path's hash, so it is the same on every launch"
        );
    }

    #[test]
    fn differs_between_two_folders() {
        assert_ne!(
            TalkKey::of(Path::new("/talks/rust")),
            TalkKey::of(Path::new("/talks/go")),
            "two talks should have two keys, and so two origins"
        );
    }
}

mod given_a_host_per_talk_origin {
    use super::*;

    #[test]
    fn a_talk_is_served_from_its_key_under_the_one_scheme() {
        let address = rust_talk(SchemeStyle::HostPerTalk);
        assert_eq!(
            address.scheme(),
            "infinitycube",
            "one scheme for every talk"
        );
        assert_eq!(
            address.origin(),
            "infinitycube://9b684d84a4976d0f4e7893a2dbd4b781",
            "the key in the host part"
        );
        assert_eq!(
            address.window_url().ok(),
            Some(url("infinitycube://9b684d84a4976d0f4e7893a2dbd4b781/")),
            "the window opens at the origin's root"
        );
    }

    #[test]
    fn two_talks_have_two_origins() {
        let go = TalkAddress::new(
            TalkKey::of(Path::new("/talks/go")),
            SchemeStyle::HostPerTalk,
        );
        assert_ne!(
            rust_talk(SchemeStyle::HostPerTalk).origin(),
            go.origin(),
            "two talks presenting at once should not share an origin"
        );
    }

    #[test]
    fn a_window_navigates_only_within_its_talk() {
        let address = rust_talk(SchemeStyle::HostPerTalk);
        assert!(
            address.admits(&url(
                "infinitycube://9b684d84a4976d0f4e7893a2dbd4b781/spaces/x/notes?y#z"
            )),
            "its own talk"
        );
        for elsewhere in [
            "https://example.com/",
            "http://127.0.0.1:4173/",
            "infinitycube://1e50ea2898230c692168cebfd93c5959/",
            "infinitycube://9b684d84a4976d0f4e7893a2dbd4b781:8080/",
            "infinitycube://user@9b684d84a4976d0f4e7893a2dbd4b781/",
            "file:///etc/passwd",
            "about:blank",
        ] {
            assert!(
                !address.admits(&url(elsewhere)),
                "{elsewhere} should be refused"
            );
        }
    }

    #[test]
    fn a_request_names_its_talk_by_the_host() {
        let key = TalkKey::of(Path::new("/talks/rust"));
        assert_eq!(
            TalkAddress::key_of(
                &uri("infinitycube://9b684d84a4976d0f4e7893a2dbd4b781/api/spaces"),
                SchemeStyle::HostPerTalk
            ),
            Some(key),
            "the host is the key"
        );
        for other in [
            "infinitycube://localhost/",
            "infinitycube://9B684D84A4976D0F4E7893A2DBD4B781/",
            "infinitycube://9b684d84a4976d0f4e7893a2dbd4b781:1/",
            "other://9b684d84a4976d0f4e7893a2dbd4b781/",
            "/api/spaces",
        ] {
            assert_eq!(
                TalkAddress::key_of(&uri(other), SchemeStyle::HostPerTalk),
                None,
                "{other} names no talk"
            );
        }
    }
}

mod given_a_scheme_per_talk_origin {
    use super::*;

    #[test]
    fn a_talk_has_a_scheme_of_its_own_served_from_localhost() {
        let address = rust_talk(SchemeStyle::SchemePerTalk);
        assert_eq!(
            address.scheme(),
            "infinitycube-9b684d84a4976d0f4e7893a2dbd4b781",
            "a scheme per talk, named stably from it"
        );
        assert_eq!(
            address.origin(),
            "http://infinitycube-9b684d84a4976d0f4e7893a2dbd4b781.localhost",
            "the origin Tauri serves that scheme from"
        );
        assert_eq!(
            address.window_url().ok(),
            Some(url(
                "infinitycube-9b684d84a4976d0f4e7893a2dbd4b781://localhost/"
            )),
            "the address Tauri rewrites to that origin"
        );
        assert!(
            address.admits(&url(
                "http://infinitycube-9b684d84a4976d0f4e7893a2dbd4b781.localhost/spaces/x"
            )),
            "its own talk, as the webview reports it"
        );
        assert!(
            !address.admits(&url("http://infinitycube.localhost/")),
            "not another scheme"
        );
    }

    #[test]
    fn a_request_names_its_talk_by_the_scheme() {
        assert_eq!(
            TalkAddress::key_of(
                &uri("infinitycube-9b684d84a4976d0f4e7893a2dbd4b781://localhost/api/spaces"),
                SchemeStyle::SchemePerTalk
            ),
            Some(TalkKey::of(Path::new("/talks/rust"))),
            "the scheme carries the key"
        );
        assert_eq!(
            TalkAddress::key_of(
                &uri("infinitycube-9b684d84a4976d0f4e7893a2dbd4b781://elsewhere/"),
                SchemeStyle::SchemePerTalk
            ),
            None,
            "only localhost"
        );
    }
}
