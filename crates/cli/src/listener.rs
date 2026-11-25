//! The loopback listener `run` and `serve` serve on: `127.0.0.1` only, the `Host` check
//! before anything else (Storage ST-114), and the host's `Request ->
//! Response` function behind it, each request body streamed into it.

use std::convert::Infallible;
use std::future::Future;
use std::io;
use std::net::Ipv4Addr;
use std::sync::Arc;
use std::time::Duration;

use bytes::Bytes;
use http::header::{CACHE_CONTROL, CONTENT_TYPE, HOST};
use http::{HeaderValue, Request, Response, StatusCode};
use http_body_util::Full;
use hyper::body::Incoming;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper_util::rt::{TokioIo, TokioTimer};
use hyper_util::server::graceful::GracefulShutdown;
use tokio::net::TcpListener;
use tokio::task::JoinSet;

use host::{Application, IdSource, SpaceRepository};

use crate::built::Files;
use crate::output::say;

/// The port a run takes without `--port` (Storage ST-120).
pub(crate) const DEFAULT_PORT: u16 = 4173;

/// How long a client has to send a request's headers.
const HEADER_READ_TIMEOUT: Duration = Duration::from_secs(30);

/// How long a stop waits for the open connections to finish the requests
/// they are answering before it drops them: a client that stalls cannot
/// hold the write on stop past a supervisor's grace period (Storage ST-120).
pub(crate) const DRAIN_BOUND: Duration = Duration::from_secs(3);

/// The connections still open once a run stops accepting.
pub(crate) struct Draining {
    graceful: GracefulShutdown,
    connections: JoinSet<()>,
}

impl Draining {
    /// Let each open connection finish the request it is answering, for at
    /// most `bound`, then drop every one still open, so none can commit
    /// after this answers. Answers whether every connection finished.
    pub(crate) async fn finish(mut self, bound: Duration) -> bool {
        let finished = tokio::time::timeout(bound, self.graceful.shutdown())
            .await
            .is_ok();
        self.connections.abort_all();
        while self.connections.join_next().await.is_some() {}
        finished
    }
}

/// Listen on `127.0.0.1`: on `port` exactly when one is given, since an
/// explicit port is the author's choice; otherwise on [`DEFAULT_PORT`] or
/// the next free one above it.
///
/// # Errors
///
/// The port cannot be bound, or no port from the default up is free. Without
/// `port`, the error names the port that failed.
pub(crate) async fn bind(port: Option<u16>) -> io::Result<TcpListener> {
    if let Some(port) = port {
        return TcpListener::bind((Ipv4Addr::LOCALHOST, port)).await;
    }
    for candidate in DEFAULT_PORT..=u16::MAX {
        match TcpListener::bind((Ipv4Addr::LOCALHOST, candidate)).await {
            Err(error) if error.kind() == io::ErrorKind::AddrInUse => {}
            Err(error) => {
                return Err(io::Error::new(
                    error.kind(),
                    format!("port {candidate}: {error}"),
                ));
            }
            bound => return bound,
        }
    }
    Err(io::Error::new(
        io::ErrorKind::AddrInUse,
        format!("no port from {DEFAULT_PORT} up is free"),
    ))
}

/// The port or ports [`bind`] tries for `port`, as a refusal names them.
pub(crate) fn ports_tried(port: Option<u16>) -> String {
    match port {
        Some(port) => format!("port {port}"),
        None => format!("a port from {DEFAULT_PORT} up"),
    }
}

/// The `Host` every request must name: `127.0.0.1:<port>`.
pub(crate) fn own_host(port: u16) -> String {
    format!("{}:{port}", Ipv4Addr::LOCALHOST)
}

/// Whether `named` is the authority `own`: byte for byte, or, on port 80,
/// without the port, the form a client sends for the default port.
fn is_own(named: &[u8], own: &str) -> bool {
    named == own.as_bytes()
        || own
            .strip_suffix(":80")
            .is_some_and(|bare| named == bare.as_bytes())
}

/// Whether a request names exactly one `Host`, this listener's own, and no
/// other authority in its target, so a page reached through DNS rebinding,
/// which names its own host, is refused.
pub(crate) fn names_own_host<B>(request: &Request<B>, own: &str) -> bool {
    let mut hosts = request.headers().get_all(HOST).iter();
    let named =
        matches!((hosts.next(), hosts.next()), (Some(host), None) if is_own(host.as_bytes(), own));
    let target = request
        .uri()
        .authority()
        .is_none_or(|authority| is_own(authority.as_str().as_bytes(), own));
    named && target
}

/// 421 for a request naming another `Host`: plain text that is never cached.
pub(crate) fn misdirected() -> Response<Full<Bytes>> {
    let mut response = Response::new(Full::new(Bytes::from_static(
        b"This server answers only requests for its own address.",
    )));
    *response.status_mut() = StatusCode::MISDIRECTED_REQUEST;
    let headers = response.headers_mut();
    let _type = headers.insert(
        CONTENT_TYPE,
        HeaderValue::from_static("text/plain; charset=utf-8"),
    );
    let _cache = headers.insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}

/// Serve `application`, over whichever store, on `listener` until `stop`
/// resolves, then stop accepting. Answers the connections still open, which
/// [`Draining::finish`] lets finish the request each is answering.
pub(crate) async fn serve<R: SpaceRepository, I: IdSource>(
    listener: TcpListener,
    application: Arc<Application<R, I, Files>>,
    own: String,
    stop: impl Future<Output = ()>,
) -> Draining {
    let graceful = GracefulShutdown::new();
    let mut connections = JoinSet::new();
    let own: Arc<str> = Arc::from(own);
    let mut stop = std::pin::pin!(stop);
    // Whether the last accept failed, so a failure that persists, such as a
    // process out of descriptors, is reported once rather than on every pass.
    let mut failing = false;
    loop {
        // Reap the connections that have ended, so a long run holds none.
        while connections.try_join_next().is_some() {}
        let accepted = tokio::select! {
            biased;
            () = &mut stop => break,
            accepted = listener.accept() => accepted,
        };
        let (stream, _peer) = match accepted {
            Ok(accepted) => {
                failing = false;
                accepted
            }
            Err(error) => {
                // A connection that failed before it was accepted, or a
                // process out of descriptors: wait a moment, still heeding
                // a stop, and go on.
                if !failing {
                    say(&format!("Could not accept a connection: {error}"));
                    failing = true;
                }
                tokio::select! {
                    biased;
                    () = &mut stop => break,
                    () = tokio::time::sleep(Duration::from_millis(50)) => continue,
                }
            }
        };
        let application = Arc::clone(&application);
        let own = Arc::clone(&own);
        let service = service_fn(move |request: Request<Incoming>| {
            let application = Arc::clone(&application);
            let own = Arc::clone(&own);
            async move {
                if !names_own_host(&request, &own) {
                    return Ok::<_, Infallible>(misdirected());
                }
                Ok(application.handle(request).await.map(Full::new))
            }
        });
        let connection = http1::Builder::new()
            .timer(TokioTimer::new())
            .header_read_timeout(HEADER_READ_TIMEOUT)
            .serve_connection(TokioIo::new(stream), service);
        let watched = graceful.watch(connection);
        let _task = connections.spawn(async move {
            // A connection the client broke off is no concern of the run's.
            let _ended = watched.await;
        });
    }
    drop(listener);
    Draining {
        graceful,
        connections,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(target: &str, hosts: &[&str]) -> Request<()> {
        let mut builder = Request::get(target);
        for host in hosts {
            builder = builder.header(HOST, *host);
        }
        builder.body(()).unwrap()
    }

    mod given_a_listener_on_port_4173 {
        use super::*;

        const OWN: &str = "127.0.0.1:4173";

        #[test]
        fn admits_a_request_naming_its_own_host() {
            assert!(
                names_own_host(&request("/api/spaces", &[OWN]), OWN),
                "its own host"
            );
        }

        #[test]
        fn refuses_any_other_host_or_none() {
            for hosts in [
                &["localhost:4173"][..],
                &["127.0.0.1"],
                &["127.0.0.1:4174"],
                &["attacker.example"],
                &["127.0.0.1:4173 "],
                &[],
                &[OWN, OWN],
                &[OWN, "attacker.example"],
            ] {
                assert!(!names_own_host(&request("/", hosts), OWN), "{hosts:?}");
            }
        }

        #[test]
        fn refuses_a_target_naming_another_authority() {
            assert!(
                !names_own_host(&request("http://attacker.example/", &[OWN]), OWN),
                "another authority in the target"
            );
            assert!(
                names_own_host(&request("http://127.0.0.1:4173/", &[OWN]), OWN),
                "its own authority in the target"
            );
        }
    }

    mod given_a_request_naming_another_host {
        use super::*;

        #[test]
        fn misdirects_with_plain_text_that_is_never_cached() {
            let response = misdirected();
            assert_eq!(response.status(), 421, "421");
            assert_eq!(
                response.headers()[CONTENT_TYPE],
                "text/plain; charset=utf-8",
                "plain text"
            );
            assert_eq!(
                response.headers()[CACHE_CONTROL],
                "no-store",
                "never cached"
            );
        }
    }

    mod given_a_listener_on_port_80 {
        use super::*;

        #[test]
        fn admits_its_own_host_with_or_without_the_default_port() {
            let own = own_host(80);
            for host in ["127.0.0.1", "127.0.0.1:80"] {
                assert!(names_own_host(&request("/", &[host]), &own), "{host}");
            }
            assert!(
                names_own_host(&request("http://127.0.0.1/", &["127.0.0.1"]), &own),
                "its own authority in the target, without the port"
            );
            assert!(
                !names_own_host(&request("/", &["127.0.0.1:8080"]), &own),
                "another port"
            );
        }
    }
}
