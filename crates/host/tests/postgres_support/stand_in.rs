//! A loopback server standing in for PostgreSQL, as
//! `test/support/refusing-postgres-server.ts` does in TypeScript: it answers
//! the startup message with a FATAL `ErrorResponse`, hangs up with a FIN or
//! an RST, or resets its first connection and passes every later one to a
//! real server. The real driver and pool meet it, so a case observes what
//! `sqlx` raises rather than a value built by hand.

use std::net::SocketAddr;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use host::DatabaseUrl;
use tokio::io::{AsyncReadExt as _, AsyncWriteExt as _};
use tokio::net::{TcpListener, TcpStream};
use tokio::task::JoinHandle;

/// A port on loopback that refuses every connection.
pub const REFUSING: &str = "postgres://cube:unused@127.0.0.1:1/cube";

/// What the stand-in does with each connection.
#[derive(Debug, Clone)]
pub enum Behaviour {
    /// Answer the startup message with a FATAL error carrying this SQLSTATE
    /// and these words, then hang up.
    Refuse(&'static str, &'static str),
    /// Read the startup message, then close with a FIN.
    Fin,
    /// Read the startup message, then close with an RST.
    Reset,
    /// Reset the first connection, and pass every later one to `0`.
    ResetFirstThenPass(SocketAddr),
}

/// A running stand-in, stopped when dropped.
#[derive(Debug)]
pub struct StandIn {
    port: u16,
    connections: Arc<AtomicUsize>,
    task: JoinHandle<()>,
}

impl StandIn {
    /// A stand-in on a port the system picks.
    pub async fn start(behaviour: Behaviour) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let connections = Arc::new(AtomicUsize::new(0));
        let counted = Arc::clone(&connections);
        let task = tokio::spawn(async move {
            loop {
                let Ok((socket, _)) = listener.accept().await else {
                    return;
                };
                let nth = counted.fetch_add(1, Ordering::SeqCst);
                let behaviour = behaviour.clone();
                tokio::spawn(async move {
                    let _ = answer(socket, behaviour, nth).await;
                });
            }
        });
        Self {
            port,
            connections,
            task,
        }
    }

    /// Its port.
    #[must_use]
    pub fn port(&self) -> u16 {
        self.port
    }

    /// How many connections it has accepted.
    #[must_use]
    pub fn connections(&self) -> usize {
        self.connections.load(Ordering::SeqCst)
    }

    /// A URL naming it, as a misconfigured `DATABASE_URL` would. It asks for
    /// no TLS, so a `PGSSLMODE` in the environment cannot stop the client at
    /// the stand-in declining TLS before it meets the behaviour.
    #[must_use]
    pub fn url(&self) -> DatabaseUrl {
        DatabaseUrl::parse(Some(&format!(
            "postgres://cube:wrong@127.0.0.1:{}/cube?sslmode=disable",
            self.port
        )))
        .unwrap()
    }
}

impl Drop for StandIn {
    fn drop(&mut self) {
        self.task.abort();
    }
}

async fn answer(mut socket: TcpStream, behaviour: Behaviour, nth: usize) -> std::io::Result<()> {
    if let Behaviour::ResetFirstThenPass(server) = behaviour {
        if nth == 0 {
            socket.set_zero_linger()?;
            return Ok(());
        }
        let mut upstream = TcpStream::connect(server).await?;
        tokio::io::copy_bidirectional(&mut socket, &mut upstream).await?;
        return Ok(());
    }
    read_startup(&mut socket).await?;
    match behaviour {
        Behaviour::Refuse(code, words) => {
            socket.write_all(&error_response(code, words)).await?;
            socket.shutdown().await
        }
        Behaviour::Fin => socket.shutdown().await,
        Behaviour::Reset => socket.set_zero_linger(),
        Behaviour::ResetFirstThenPass(_) => Ok(()),
    }
}

/// Read the client's startup message, declining TLS if it asks first.
async fn read_startup(socket: &mut TcpStream) -> std::io::Result<()> {
    const SSL_REQUEST: u32 = 80_877_103;
    loop {
        let length = socket.read_u32().await?;
        let mut body = vec![0; usize::try_from(length).unwrap_or(4).saturating_sub(4)];
        socket.read_exact(&mut body).await?;
        if length == 8 && body == SSL_REQUEST.to_be_bytes() {
            socket.write_all(b"N").await?;
            continue;
        }
        return Ok(());
    }
}

/// One wire-protocol `ErrorResponse`: a type byte, a length counting itself,
/// each field as a type byte and a NUL-terminated string, and a final NUL.
fn error_response(code: &str, words: &str) -> Vec<u8> {
    let mut body = Vec::new();
    for (field, value) in [('S', "FATAL"), ('V', "FATAL"), ('C', code), ('M', words)] {
        body.push(u8::try_from(field).unwrap());
        body.extend_from_slice(value.as_bytes());
        body.push(0);
    }
    body.push(0);
    let mut message = vec![b'E'];
    message.extend_from_slice(&u32::try_from(body.len() + 4).unwrap().to_be_bytes());
    message.extend_from_slice(&body);
    message
}
