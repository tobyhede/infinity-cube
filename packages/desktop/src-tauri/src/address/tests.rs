//! Tests of an Aggregate's key and its address.

use super::*;

fn rust_aggregate(style: SchemeStyle) -> AggregateAddress {
    AggregateAddress::new(AggregateKey::of(Path::new("/spaces/rust")), style)
}

fn url(text: &str) -> Url {
    Url::parse(text).unwrap_or_else(|error| unreachable!("{text} is a URL: {error}"))
}

fn uri(text: &str) -> http::Uri {
    text.parse()
        .unwrap_or_else(|error| unreachable!("{text} is a URI: {error}"))
}

mod given_an_aggregates_key {
    use super::*;

    #[test]
    fn is_the_first_half_of_the_sha256_of_its_folder_path() {
        // `printf '/spaces/rust' | sha256sum | cut -c1-32`
        assert_eq!(
            AggregateKey::of(Path::new("/spaces/rust")).as_str(),
            "b9cf8013ab0bb83fffb617cada9319eb",
            "the key should be the path's hash, so it is the same on every launch"
        );
    }

    #[test]
    fn differs_between_two_folders() {
        assert_ne!(
            AggregateKey::of(Path::new("/spaces/rust")),
            AggregateKey::of(Path::new("/spaces/go")),
            "two Aggregates should have two keys, and so two origins"
        );
    }
}

mod given_a_host_per_aggregate_origin {
    use super::*;

    #[test]
    fn an_aggregate_is_served_from_its_key_under_the_one_scheme() {
        let address = rust_aggregate(SchemeStyle::HostPerAggregate);
        assert_eq!(
            address.scheme(),
            "infinitycube",
            "one scheme for every Aggregate"
        );
        assert_eq!(
            address.origin(),
            "infinitycube://b9cf8013ab0bb83fffb617cada9319eb",
            "the key in the host part"
        );
        assert_eq!(
            address.window_url().ok(),
            Some(url("infinitycube://b9cf8013ab0bb83fffb617cada9319eb/")),
            "the window opens at the origin's root"
        );
    }

    #[test]
    fn two_aggregates_have_two_origins() {
        let go = AggregateAddress::new(
            AggregateKey::of(Path::new("/spaces/go")),
            SchemeStyle::HostPerAggregate,
        );
        assert_ne!(
            rust_aggregate(SchemeStyle::HostPerAggregate).origin(),
            go.origin(),
            "two Aggregates presenting at once should not share an origin"
        );
    }

    #[test]
    fn a_window_navigates_only_within_its_aggregate() {
        let address = rust_aggregate(SchemeStyle::HostPerAggregate);
        assert!(
            address.admits(&url(
                "infinitycube://b9cf8013ab0bb83fffb617cada9319eb/spaces/x/notes?y#z"
            )),
            "its own Aggregate"
        );
        for elsewhere in [
            "https://example.com/",
            "http://127.0.0.1:4173/",
            "infinitycube://1e50ea2898230c692168cebfd93c5959/",
            "infinitycube://b9cf8013ab0bb83fffb617cada9319eb:8080/",
            "infinitycube://user@b9cf8013ab0bb83fffb617cada9319eb/",
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
    fn a_request_names_its_aggregate_by_the_host() {
        let key = AggregateKey::of(Path::new("/spaces/rust"));
        assert_eq!(
            AggregateAddress::key_of(
                &uri("infinitycube://b9cf8013ab0bb83fffb617cada9319eb/api/spaces"),
                SchemeStyle::HostPerAggregate
            ),
            Some(key),
            "the host is the key"
        );
        for other in [
            "infinitycube://localhost/",
            "infinitycube://9B684D84A4976D0F4E7893A2DBD4B781/",
            "infinitycube://b9cf8013ab0bb83fffb617cada9319eb:1/",
            "other://b9cf8013ab0bb83fffb617cada9319eb/",
            "/api/spaces",
        ] {
            assert_eq!(
                AggregateAddress::key_of(&uri(other), SchemeStyle::HostPerAggregate),
                None,
                "{other} names no Aggregate"
            );
        }
    }
}

mod given_a_scheme_per_aggregate_origin {
    use super::*;

    #[test]
    fn an_aggregate_has_a_scheme_of_its_own_served_from_localhost() {
        let address = rust_aggregate(SchemeStyle::SchemePerAggregate);
        assert_eq!(
            address.scheme(),
            "infinitycube-b9cf8013ab0bb83fffb617cada9319eb",
            "a scheme per Aggregate, named stably from it"
        );
        assert_eq!(
            address.origin(),
            "http://infinitycube-b9cf8013ab0bb83fffb617cada9319eb.localhost",
            "the origin Tauri serves that scheme from"
        );
        assert_eq!(
            address.window_url().ok(),
            Some(url(
                "infinitycube-b9cf8013ab0bb83fffb617cada9319eb://localhost/"
            )),
            "the address Tauri rewrites to that origin"
        );
        assert!(
            address.admits(&url(
                "http://infinitycube-b9cf8013ab0bb83fffb617cada9319eb.localhost/spaces/x"
            )),
            "its own Aggregate, as the webview reports it"
        );
        assert!(
            !address.admits(&url("http://infinitycube.localhost/")),
            "not another scheme"
        );
    }

    #[test]
    fn a_request_names_its_aggregate_by_the_scheme() {
        assert_eq!(
            AggregateAddress::key_of(
                &uri("infinitycube-b9cf8013ab0bb83fffb617cada9319eb://localhost/api/spaces"),
                SchemeStyle::SchemePerAggregate
            ),
            Some(AggregateKey::of(Path::new("/spaces/rust"))),
            "the scheme carries the key"
        );
        assert_eq!(
            AggregateAddress::key_of(
                &uri("infinitycube-b9cf8013ab0bb83fffb617cada9319eb://elsewhere/"),
                SchemeStyle::SchemePerAggregate
            ),
            None,
            "only localhost"
        );
    }
}
